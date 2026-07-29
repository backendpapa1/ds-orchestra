/**
 * TaskContract — immutable once dispatched.
 * Everything the worker is permitted to do.
 */

/** Default globs the worker must never touch. These always win over mayEdit. */
export const DEFAULT_NEVER_TOUCH = [
  'tests/**',
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/*.lock',
  '.git/**',
  '.env*',
  '**/migrations/**',
  'package.json',
  'tsconfig*.json',
] as const;

/** Default allowlisted command heads. */
export const DEFAULT_BASH_ALLOW = [
  'npm',
  'npx',
  'node',
  'tsc',
  'jest',
  'vitest',
  'eslint',
  'ls',
  'cat',
] as const;

export interface TaskContract {
  /** 8-char hex, generated at dispatch time */
  readonly taskId: string;

  /**
   * Closed-form specification. Must leave no design decisions open.
   * Include exact function signatures, expected behaviour, edge cases.
   */
  readonly goal: string;

  /** Shell command. Exit 0 = task is done. Runs independently in the worktree. */
  readonly acceptanceCmd: string;

  /** Absolute path to the git worktree */
  readonly workdir: string;

  /**
   * Glob allowlist for file writes. Non-empty. Required.
   * The worker may only write files matching at least one of these.
   * Be as narrow as possible.
   */
  readonly mayEdit: string[];

  /**
   * Glob denylist. Always applied on top of mayEdit.
   * Default includes tests/**, lock files, migrations, config files.
   * neverTouch is checked BEFORE mayEdit — a deny always wins.
   */
  readonly neverTouch: string[];

  /** Allowlisted command heads for run_bash. First token must match. */
  readonly bashAllow: string[];

  /** Maximum agent steps (default 40) */
  readonly maxSteps: number;

  /** Time budget in seconds (default 900 = 15 minutes) */
  readonly maxSeconds: number;

  /** Maximum distinct files the worker may touch (default 12) */
  readonly maxFilesTouched: number;
}

/** Build a TaskContract with defaults applied. */
export function createTaskContract(overrides: {
  taskId: string;
  goal: string;
  acceptanceCmd: string;
  workdir: string;
  mayEdit: string[];
  neverTouch?: string[];
  bashAllow?: string[];
  maxSteps?: number;
  maxSeconds?: number;
  maxFilesTouched?: number;
}): TaskContract {
  return {
    taskId: overrides.taskId,
    goal: overrides.goal,
    acceptanceCmd: overrides.acceptanceCmd,
    workdir: overrides.workdir,
    mayEdit: overrides.mayEdit,
    neverTouch: overrides.neverTouch ?? [...DEFAULT_NEVER_TOUCH],
    bashAllow: overrides.bashAllow ?? [...DEFAULT_BASH_ALLOW],
    maxSteps: overrides.maxSteps ?? 40,
    maxSeconds: overrides.maxSeconds ?? 900,
    maxFilesTouched: overrides.maxFilesTouched ?? 12,
  };
}
