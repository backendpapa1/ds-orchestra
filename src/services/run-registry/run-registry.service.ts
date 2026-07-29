import { Injectable } from '@nestjs/common';
import type { TaskContract } from '../../shared/contracts/task-contract.js';
import type { RunState, RunResult, RunStatus } from '../../shared/contracts/run-state.js';

/**
 * In-memory run state registry.
 *
 * Tracks all active and completed runs. State is lost on process restart
 * (acceptable per PRD §3 — "in-memory run state is acceptable for v0.1").
 */
@Injectable()
export class RunRegistry {
  private readonly runs = new Map<string, RunState>();

  /** Register a new run. Returns the created RunState. */
  register(
    contract: TaskContract,
    worktree: string,
    branch: string,
    originalBranch: string,
    abortController: AbortController,
  ): RunState {
    const state: RunState = {
      taskId: contract.taskId,
      contract,
      status: 'running',
      branch,
      originalBranch,
      worktree,
      abortController,
      startedAt: new Date(),
      stepsCompleted: 0,
      filesTouched: new Set(),
    };
    this.runs.set(contract.taskId, state);
    return state;
  }

  /** Get a run by taskId. Returns undefined if not found. */
  get(taskId: string): RunState | undefined {
    return this.runs.get(taskId);
  }

  /** Update the status and optionally store the result. */
  updateStatus(taskId: string, status: RunStatus, result?: RunResult): void {
    const state = this.runs.get(taskId);
    if (state) {
      state.status = status;
      if (result) state.result = result;
    }
  }

  /** Increment the step counter for a running task. */
  incrementSteps(taskId: string): void {
    const state = this.runs.get(taskId);
    if (state) state.stepsCompleted++;
  }

  /** List all currently running tasks. */
  listActive(): RunState[] {
    return [...this.runs.values()].filter((r) => r.status === 'running');
  }

  /** List all tasks (running and completed). */
  listAll(): RunState[] {
    return [...this.runs.values()];
  }
}
