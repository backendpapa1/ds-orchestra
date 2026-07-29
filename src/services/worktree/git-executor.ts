import { Injectable } from '@nestjs/common';
import { execa } from 'execa';

/**
 * Cleaned git command result with string stdout/stderr.
 */
export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Thin wrapper around execa v9 for git command execution.
 * Provides AbortSignal support, timeout, and structured error handling.
 *
 * execa v9 is used (not v10) because v10 requires Node 22 and PRD specifies Node 20+.
 */
@Injectable()
export class GitExecutor {
  /**
   * Execute a git command in the given working directory.
   *
   * @param args - git arguments (e.g., ['worktree', 'add', path])
   * @param cwd - working directory for the command
   * @param signal - optional AbortSignal for cancellation
   * @param timeout - timeout in ms (default 30s)
   */
  async exec(
    args: string[],
    cwd: string,
    signal?: AbortSignal,
    timeout = 30_000,
  ): Promise<GitResult> {
    const result = await execa('git', args, {
      cwd,
      timeout,
      cancelSignal: signal,
      reject: false,
      // Ensure stdout is always a string
      stdout: 'pipe',
      stderr: 'pipe',
    });

    return {
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
      exitCode: result.exitCode ?? 1,
    };
  }

  /**
   * Execute a git command that must succeed. Throws on non-zero exit.
   */
  async execOrThrow(
    args: string[],
    cwd: string,
    signal?: AbortSignal,
    timeout = 30_000,
  ): Promise<GitResult> {
    const result = await this.exec(args, cwd, signal, timeout);
    if (result.exitCode !== 0) {
      throw new Error(
        `git ${args.join(' ')} failed (exit ${result.exitCode}): ${result.stderr}`,
      );
    }
    return result;
  }
}
