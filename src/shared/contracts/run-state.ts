import type { TaskContract } from './task-contract.js';

export type RunStatus =
  | 'running'
  | 'passed'
  | 'failed'
  | 'violated'
  | 'aborted';

export interface RunState {
  readonly taskId: string;
  readonly contract: TaskContract;
  status: RunStatus;
  readonly branch: string;
  readonly originalBranch: string;
  readonly worktree: string;
  readonly abortController: AbortController;
  readonly startedAt: Date;
  stepsCompleted: number;
  filesTouched: Set<string>;
  result?: RunResult | undefined;
}

export interface RunResult {
  readonly status: RunStatus;
  /** Worker's submit summary, or violation/abort reason */
  readonly workerSummary: string;
  /** Exit code from acceptance command (null if not run) */
  readonly acceptanceExitCode: number | null;
  /** Last 6000 chars of acceptance command output */
  readonly acceptanceOutput: string;
  /** Test files that were detected as modified (should always be empty) */
  readonly testsModified: string[];
  /** All files the worker touched */
  readonly filesTouched: string[];
  /** Full diff, capped at 120k chars */
  readonly diff: string;
  /** Set when status is 'violated' or 'aborted' */
  readonly violationReason?: string;
  readonly stepsCompleted: number;
  readonly totalTokens?: number;
}
