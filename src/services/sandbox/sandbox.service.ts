import { Injectable } from '@nestjs/common';
import { minimatch } from 'minimatch';
import { resolve, relative } from 'node:path';
import type { TaskContract } from '../../shared/contracts/task-contract.js';
import { TripwireError } from '../../shared/utils/tripwire-error.js';

/**
 * SandboxService — the security boundary.
 *
 * Pure, stateless, fully unit-testable. Every guardrail the system exists to
 * provide is enforced here, not in a prompt. Check neverTouch BEFORE mayEdit
 * so a deny always wins.
 *
 * Built first, tested hardest (PRD §7.1).
 */
@Injectable()
export class SandboxService {
  /**
   * Shell metacharacters that indicate command chaining.
   * If a command contains any of these followed by a dangerous head,
   * it's a tripwire even if the first token was allowed.
   * \n is included — bash treats newlines as command separators.
   */
  private static readonly SHELL_METACHARS = [';', '&&', '||', '|', '|&'];

  /**
   * Dangerous command heads that must never be allowed through chaining,
   * even if hidden behind an allowed first token like `npm test; rm -rf /`.
   */
  private static readonly DANGEROUS_HEADS = [
    'rm',
    'curl',
    'wget',
    'sudo',
    'chmod',
    'dd',
    'mkfs',
    'shutdown',
    'reboot',
    'kill',
    'pkill',
    'git push',
  ];

  // ── Write guard ────────────────────────────────────────────────

  /**
   * Validates that a write to `relPath` is permitted under the contract.
   *
   * Order of checks (PRD §7.1):
   * 1. Path traversal — resolve and verify prefix
   * 2. neverTouch — checked FIRST, deny always wins
   * 3. mayEdit — must match at least one glob
   * 4. maxFilesTouched — strict: >= max means already at limit
   *
   * @throws {TripwireError} if any check fails
   */
  checkWrite(contract: TaskContract, relPath: string, touchedSoFar: number): void {
    // 1. Path traversal guard
    const resolved = this.resolveWithin(contract.workdir, relPath);

    // Convert back to relative path for glob matching
    const normalized = relative(contract.workdir, resolved);
    if (!normalized || normalized.startsWith('..')) {
      throw new TripwireError(
        `Path traversal: '${relPath}' resolves outside worktree root`,
        { relPath, workdir: contract.workdir },
      );
    }

    // 2. neverTouch — checked FIRST, deny always wins
    for (const pattern of contract.neverTouch) {
      if (minimatch(normalized, pattern, { dot: true })) {
        throw new TripwireError(
          `Path matches neverTouch glob: '${pattern}'`,
          { relPath: normalized, pattern },
        );
      }
    }

    // 3. mayEdit — must match at least one glob
    const allowed = contract.mayEdit.some((pattern) =>
      minimatch(normalized, pattern, { dot: true }),
    );
    if (!allowed) {
      throw new TripwireError(
        `Path '${normalized}' not in mayEdit globs: [${contract.mayEdit.join(', ')}]`,
        { relPath: normalized, mayEdit: contract.mayEdit },
      );
    }

    // 4. maxFilesTouched — strict >= check
    if (touchedSoFar >= contract.maxFilesTouched) {
      throw new TripwireError(
        `maxFilesTouched exceeded: ${touchedSoFar} files already touched (limit: ${contract.maxFilesTouched})`,
        { touchedSoFar, maxFilesTouched: contract.maxFilesTouched },
      );
    }
  }

  // ── Read guard ─────────────────────────────────────────────────

  /**
   * Glob patterns that are blocked for reads.
   * Narrower than neverTouch — the worker needs to read config files
   * (package.json, tsconfig, lock files) to understand the project.
   * Only blocks test files (cheating prevention) and secrets.
   */
  private static readonly READ_DENYLIST = [
    'tests/**',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.js',
    '**/*.test.js',
    '.git/**',
    '.env*',
  ];

  /**
   * Validates that reading a file at `relPath` is permitted.
   * Uses a narrow denylist — the worker can read config files
   * (package.json, tsconfig, lock files, migrations) to understand
   * the codebase, but is blocked from test files (prevents cheating)
   * and secrets (.env, .git).
   *
   * @throws {TripwireError} if the path matches the read denylist
   */
  checkRead(_contract: TaskContract, relPath: string): void {
    for (const pattern of SandboxService.READ_DENYLIST) {
      if (minimatch(relPath, pattern, { dot: true })) {
        throw new TripwireError(
          `Read blocked: '${relPath}' matches denylist: '${pattern}'. ` +
          `Test files and secrets cannot be read. Try reading source files instead.`,
          { relPath, pattern },
        );
      }
    }
  }

  // ── Bash guard ─────────────────────────────────────────────────

  /**
   * Validates that a bash command is permitted under the contract.
   *
   * Checks:
   * 1. First token must be in bashAllow
   * 2. If the command contains shell metacharacters, scan for dangerous heads
   *    that might be smuggled past the head check (e.g., `npm test; rm -rf /`)
   *
   * @throws {TripwireError} if any check fails
   */
  checkBash(contract: TaskContract, cmd: string): void {
    const trimmed = cmd.trim();

    // 0. Reject multiline commands — newlines are command separators in bash
    if (trimmed.includes('\n')) {
      throw new TripwireError(
        'Multiline commands are not permitted',
        { cmd: trimmed.slice(0, 80) },
      );
    }

    // 0b. Reject command substitution — $(...) and backticks
    if (/\$\(/.test(trimmed) || /`/.test(trimmed)) {
      throw new TripwireError(
        'Command substitution ($(...) or backticks) is not permitted',
        { cmd: trimmed.slice(0, 80) },
      );
    }

    // Extract the first token (command head)
    const firstToken = this.extractFirstToken(trimmed);
    if (!firstToken) {
      throw new TripwireError('Empty command', { cmd });
    }

    // 1. First token must be in bashAllow
    if (!contract.bashAllow.includes(firstToken)) {
      throw new TripwireError(
        `Command '${firstToken}' not in bashAllow: [${contract.bashAllow.join(', ')}]`,
        { cmd, firstToken, bashAllow: contract.bashAllow },
      );
    }

    // 2. Scan for chained dangerous commands
    this.checkChainedDangerous(trimmed);
  }

  /**
   * Scans the command string for shell metacharacters followed by dangerous heads.
   * This prevents smuggling: `npm test; rm -rf /` would pass the head check
   * (first token is 'npm') but still execute 'rm'.
   */
  private checkChainedDangerous(cmd: string): void {
    // Build regex: (metachar)\s*(dangerousHead)
    const metaPattern = SandboxService.SHELL_METACHARS.map((m) =>
      m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    ).join('|');

    const headPattern = SandboxService.DANGEROUS_HEADS.map((h) =>
      h.replace(/\s+/g, '\\s+'),
    ).join('|');

    const regex = new RegExp(`(?:${metaPattern})\\s*(${headPattern})\\b`, 'gi');
    const match = regex.exec(cmd);

    if (match) {
      throw new TripwireError(
        `Chained dangerous command detected: '${match[1]}' after shell metacharacter`,
        { cmd, dangerousHead: match[1] },
      );
    }
  }

  /**
   * Extract the first token from a command string.
   * Handles: bare commands, paths like /usr/bin/git, and compound commands like `git push`.
   */
  private extractFirstToken(cmd: string): string {
    const trimmed = cmd.trim();
    // Split on whitespace
    const tokens = trimmed.split(/\s+/);
    if (tokens.length === 0 || tokens[0] === '') return '';

    // Handle `git push` — the first two tokens together if the second
    // is a common git subcommand that could be dangerous
    if (tokens[0] === 'git' && tokens.length > 1) {
      const twoToken = `${tokens[0]} ${tokens[1]}`;
      if (SandboxService.DANGEROUS_HEADS.includes(twoToken)) {
        return twoToken;
      }
    }

    return tokens[0];
  }

  // ── Path resolution ────────────────────────────────────────────

  /**
   * Resolves a relative path within a root directory.
   *
   * @returns The resolved absolute path
   * @throws {TripwireError} if the resolved path escapes the root
   */
  resolveWithin(root: string, rel: string): string {
    const resolved = resolve(root, rel);

    // Verify the resolved path stays within root.
    // path.relative returns a path starting with '..' if it escaped.
    // Also check: the resolved path must start with root (trailing sep or exact match).
    const relBack = relative(root, resolved);
    const escaped =
      relBack.startsWith('..') ||
      (!resolved.startsWith(root + '/') && resolved !== root);

    if (escaped) {
      throw new TripwireError(
        `Path traversal: '${rel}' resolves to '${resolved}' which escapes root '${root}'`,
        { rel, resolved, root },
      );
    }

    return resolved;
  }

  // ── Glob overlap ───────────────────────────────────────────────

  /**
   * Conservative glob overlap check for WaveScheduler.
   *
   * v0.1 uses exact string equality + prefix-directory comparison.
   * False positives are acceptable (reject safe dispatches);
   * false negatives are NOT (allow conflicting dispatches).
   *
   * Documented in PRD §7.5 as approximate. Replace with proper
   * glob-intersection library if false positives become problematic.
   */
  globsOverlap(globsA: readonly string[], globsB: readonly string[]): boolean {
    for (const a of globsA) {
      for (const b of globsB) {
        // Exact match
        if (a === b) return true;

        // Strip trailing /** and wildcard suffixes for prefix comparison
        const aPrefix = a.replace(/\/?\*\*\/?\*?$/, '');
        const bPrefix = b.replace(/\/?\*\*\/?\*?$/, '');

        // One is a prefix of the other (directory overlap)
        if (aPrefix && bPrefix) {
          if (aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix)) {
            return true;
          }
        }

        // Same wildcard with same extension pattern
        if (a.startsWith('**.') && a === b) return true;
      }
    }

    return false;
  }
}
