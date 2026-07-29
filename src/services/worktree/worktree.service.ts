import { Injectable } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '../../config/config.service.js';
import { GitExecutor } from './git-executor.js';

/**
 * WorktreeService — manages isolated git worktrees for worker tasks.
 *
 * Each task gets its own worktree under <stateDir>/wt/<taskId> on a branch
 * named ds/<taskId>. The user's working tree is NEVER modified by a worker.
 * Changes only reach the user via explicit ds_accept (squashMerge).
 *
 * PRD §7.2: "Must not run any git command that touches the user's
 * checked-out branch other than the explicit merge in accept."
 */
@Injectable()
export class WorktreeService {
  constructor(
    private readonly config: ConfigService,
    private readonly git: GitExecutor,
  ) {}

  /**
   * Create an isolated git worktree for a task.
   *
   * git worktree add -b ds/<taskId> <stateDir>/wt/<taskId> HEAD
   */
  async create(
    repo: string,
    taskId: string,
  ): Promise<{ worktree: string; branch: string; originalBranch: string }> {
    const branch = `ds/${taskId}`;
    const worktree = join(this.config.stateDir, 'wt', taskId);

    // Capture the current branch BEFORE creating the worktree
    const currentResult = await this.git.exec(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      repo,
    );
    const originalBranch = currentResult.stdout.trim() || 'main';

    // Ensure the parent directory exists
    await mkdir(join(this.config.stateDir, 'wt'), { recursive: true });

    // Create the worktree from HEAD of the repo
    await this.git.execOrThrow(
      ['worktree', 'add', '-b', branch, worktree, 'HEAD'],
      repo,
    );

    return { worktree, branch, originalBranch };
  }

  /**
   * Get the full unified diff of changes in the worktree.
   */
  async diff(worktree: string): Promise<string> {
    const result = await this.git.exec(['diff', 'HEAD'], worktree);
    // git diff returns exit 0 with empty output when no changes,
    // or exit != 0 with output. stdout contains the diff either way.
    return result.stdout;
  }

  /**
   * Get list of files changed in the worktree (relative paths).
   */
  async changedFiles(worktree: string): Promise<string[]> {
    const result = await this.git.exec(
      ['diff', '--name-only', 'HEAD'],
      worktree,
    );
    if (!result.stdout.trim()) return [];
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Check if any files matching test globs have been modified.
   * Used during finalization to verify the worker didn't touch tests.
   */
  async testFilesModified(worktree: string): Promise<string[]> {
    // Check both tests/ directory and spec/test file patterns
    const args = [
      'diff',
      '--name-only',
      'HEAD',
      '--',
      'tests/',
      ':*/*.spec.ts',
      ':*/*.spec.tsx',
      ':*/*.test.ts',
      ':*/*.test.tsx',
      ':*/*.spec.js',
      ':*/*.test.js',
    ];

    const result = await this.git.exec(args, worktree);

    // Filter: only return files that actually exist in the diff output
    // The -- pathspec will filter, but git may return paths that match
    // even if they weren't modified. We check for non-empty output.
    if (!result.stdout.trim()) return [];
    return result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter(
        (f) =>
          f.includes('tests/') ||
          f.endsWith('.spec.ts') ||
          f.endsWith('.test.ts') ||
          f.endsWith('.spec.tsx') ||
          f.endsWith('.test.tsx') ||
          f.endsWith('.spec.js') ||
          f.endsWith('.test.js'),
      );
  }

  /**
   * Force-remove a worktree and delete its branch.
   *
   * git worktree remove --force <worktree>
   * git branch -D <branch> (from the main repo)
   */
  async remove(
    repo: string,
    worktree: string,
    branch: string,
  ): Promise<void> {
    // Remove the worktree first
    const removeResult = await this.git.exec(
      ['worktree', 'remove', '--force', worktree],
      repo,
    );
    // worktree remove can fail if already removed — that's ok
    if (removeResult.exitCode !== 0) {
      // Log but don't fail — the worktree might already be gone
    }

    // Delete the branch from the main repo
    await this.git.exec(['branch', '-D', branch], repo);
    // branch -D can fail if branch already deleted — ok
  }

  /**
   * Commit the working-tree changes in the worktree to the worker branch.
   * Must be called before squashMerge — otherwise the merge has nothing to merge.
   */
  async commitWorktree(worktree: string, taskId: string): Promise<void> {
    // Stage all changes in the worktree
    await this.git.execOrThrow(['add', '-A', '.'], worktree);
    // Commit them to the worker branch
    const result = await this.git.exec(
      ['commit', '-m', `ds-orchestra: worker changes for ${taskId}`],
      worktree,
    );
    // Non-zero exit with "nothing to commit" is OK — no changes to commit
    if (result.exitCode !== 0 && !result.stderr.includes('nothing to commit')) {
      throw new Error(`Failed to commit worktree changes: ${result.stderr}`);
    }
  }

  /**
   * Squash-merge the worker branch into the original branch.
   *
   * This is the ONLY operation that touches the user's branch.
   * Called by ds_accept after Claude has reviewed the diff.
   *
   * Does NOT checkout the worker branch in the main repo — merges by branch
   * reference only. The original branch is captured at create() time and
   * stored by the caller (OrchestratorService).
   */
  async squashMerge(
    repo: string,
    branch: string,
    originalBranch: string,
  ): Promise<string> {
    // Get the changed files list WITHOUT checking out the worker branch.
    // Find the merge-base between the original branch and the worker branch,
    // then diff from merge-base to worker branch tip.
    const baseResult = await this.git.exec(
      ['merge-base', originalBranch, branch],
      repo,
    );
    const mergeBase = baseResult.stdout.trim() || 'HEAD';

    const changedResult = await this.git.exec(
      ['diff', '--name-only', mergeBase, branch],
      repo,
    );

    // Ensure we're on the original branch
    const currentBranch = await this.git.exec(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      repo,
    );
    if (currentBranch.stdout.trim() !== originalBranch) {
      await this.git.execOrThrow(['checkout', originalBranch], repo);
    }

    // Squash-merge the worker branch by reference (no checkout needed)
    const mergeResult = await this.git.execOrThrow(
      ['merge', '--squash', branch],
      repo,
    );

    // Return changed files info and merge output
    const files = changedResult.stdout.trim()
      ? changedResult.stdout.trim().split('\n').filter(Boolean)
      : [];

    return `Merged branch ${branch} into ${originalBranch}\n${mergeResult.stdout}\nFiles: ${files.join(', ') || 'none'}`;
  }
}
