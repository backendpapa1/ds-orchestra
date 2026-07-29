import { Injectable } from '@nestjs/common';
import { WaveScheduler } from './wave-scheduler.service.js';
import { WorktreeService } from '../worktree/worktree.service.js';
import { WorkerService } from '../worker/worker.service.js';
import { RunRegistry } from '../run-registry/run-registry.service.js';
import { EventLogService } from '../run-registry/event-log.service.js';
import { ConfigService } from '../../config/config.service.js';
import { resolve, join } from 'node:path';
import { generateTaskId } from '../../shared/utils/id-generator.js';
import { truncate } from '../../shared/utils/truncator.js';
import { createTaskContract } from '../../shared/contracts/task-contract.js';
import type { RunResult } from '../../shared/contracts/run-state.js';
import type { LogEvent } from '../../shared/contracts/log-event.js';

/**
 * OrchestratorService — the main facade over all subsystems.
 *
 * This is what MCP tool handlers call into. It coordinates:
 *   WaveScheduler → overlap + concurrency
 *   WorktreeService → git isolation
 *   SandboxService → guard validation
 *   WorkerService → agent loop
 *   RunRegistry → state tracking
 *   EventLogService → JSONL event log
 */
@Injectable()
export class OrchestratorService {
  constructor(
    private readonly scheduler: WaveScheduler,
    private readonly worktree: WorktreeService,
    private readonly worker: WorkerService,
    private readonly registry: RunRegistry,
    private readonly eventLog: EventLogService,
    private readonly config: ConfigService,
  ) {}

  // ── Dispatch ──────────────────────────────────────────────────

  async dispatch(params: {
    repo: string;
    goal: string;
    context?: string;
    acceptanceCmd: string;
    mayEdit: string[];
    maxSteps?: number;
    maxSeconds?: number;
  }): Promise<{ taskId: string; worktree: string; branch: string }> {
    const taskId = generateTaskId();

    // 1. Check overlap with active runs
    const active = this.registry.listActive();
    const activeContracts = active.map((r) => r.contract);
    const overlap = this.scheduler.checkOverlap(
      {
        taskId,
        goal: params.goal,
        context: params.context,
        acceptanceCmd: params.acceptanceCmd,
        workdir: '', // placeholder — not yet created
        mayEdit: params.mayEdit,
        neverTouch: [],
        bashAllow: [],
        maxSteps: params.maxSteps ?? 40,
        maxSeconds: params.maxSeconds ?? 900,
        maxFilesTouched: 12,
      },
      activeContracts,
    );
    if (overlap) throw overlap;

    // 2. Check concurrency cap
    if (!this.scheduler.hasCapacity(active.length)) {
      throw new Error(
        `Concurrency cap reached (${this.config.maxConcurrent} tasks running). Wait for a task to complete.`,
      );
    }

    // 3. Create isolated worktree (captures original branch)
    const { worktree, branch, originalBranch } = await this.worktree.create(
      params.repo,
      taskId,
    );

    // 4. Build the full contract with defaults
    const contract = createTaskContract({
      taskId,
      goal: params.goal,
      context: params.context,
      acceptanceCmd: params.acceptanceCmd,
      workdir: worktree,
      mayEdit: params.mayEdit,
      maxSteps: params.maxSteps,
      maxSeconds: params.maxSeconds,
    });

    // 5. Register the run
    const abortController = new AbortController();
    this.registry.register(contract, worktree, branch, originalBranch, abortController);

    // 6. Launch the worker (fire-and-forget — caller returns immediately)
    this.worker
      .run(contract, abortController.signal)
      .then((result) => {
        this.registry.updateStatus(taskId, result.status, result);
      })
      .catch((err: Error) => {
        this.registry.updateStatus(taskId, 'violated', {
          status: 'violated',
          workerSummary: `Worker crashed: ${err.message}`,
          acceptanceExitCode: null,
          acceptanceOutput: '',
          testsModified: [],
          filesTouched: [],
          diff: '',
          violationReason: err.message,
          stepsCompleted: 0,
        });
      });

    return { taskId, worktree, branch };
  }

  // ── Status ────────────────────────────────────────────────────

  getStatus(taskId: string): Record<string, unknown> | 'not_found' {
    const state = this.registry.get(taskId);
    if (!state) return 'not_found';

    return {
      running: state.status === 'running',
      steps: state.stepsCompleted,
      writes: [...state.filesTouched],
      commands: state.status,
      status: state.status,
      result: state.result ?? null,
    };
  }

  // ── Tail ──────────────────────────────────────────────────────

  tail(taskId: string, n?: number): LogEvent[] {
    return this.eventLog.tail(taskId, n);
  }

  // ── Abort ─────────────────────────────────────────────────────

  async abort(
    taskId: string,
    reason: string,
  ): Promise<{ taskId: string; status: string; diff: string }> {
    const state = this.registry.get(taskId);
    if (!state) throw new Error(`Task ${taskId} not found`);
    if (state.status !== 'running') {
      throw new Error(`Task ${taskId} is not running (status: ${state.status})`);
    }

    state.abortController.abort(reason);

    // Wait briefly for the worker to terminate
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get the updated state
    return {
      taskId,
      status: state.status,
      diff: truncate(state.result?.diff ?? '', 120_000),
    };
  }

  // ── Diff ──────────────────────────────────────────────────────

  diff(taskId: string): Promise<string> {
    // Validate path stays within stateDir to prevent traversal
    const wtDir = resolve(join(this.config.stateDir, 'wt'));
    const worktree = resolve(join(wtDir, taskId));
    if (!worktree.startsWith(wtDir)) {
      throw new Error(`Invalid taskId: path traversal detected`);
    }
    return this.worktree.diff(worktree);
  }

  // ── Wait all ──────────────────────────────────────────────────

  waitAll(taskIds: string[]): Promise<RunResult[]> {
    return this.scheduler.waitAll(taskIds, this.registry);
  }

  // ── Accept ────────────────────────────────────────────────────

  async accept(
    taskId: string,
    repo: string,
  ): Promise<{ mergeResult: string; filesTouched: string[] }> {
    const state = this.registry.get(taskId);
    if (!state) throw new Error(`Task ${taskId} not found`);

    if (state.status === 'running') {
      throw new Error(`Task ${taskId} is still running. Wait for completion before accepting.`);
    }

    if (state.status !== 'passed' && state.status !== 'failed') {
      // Can still accept failed/violated if you know what you're doing
      // but 'passed' is the happy path
    }

    // Commit worktree changes to the worker branch first
    await this.worktree.commitWorktree(state.worktree, taskId);

    // Squash-merge into the original branch (never touches user's working tree)
    const mergeResult = await this.worktree.squashMerge(
      repo,
      state.branch,
      state.originalBranch,
    );
    await this.worktree.remove(repo, state.worktree, state.branch);

    return {
      mergeResult,
      filesTouched: state.result?.filesTouched ?? [],
    };
  }

  // ── Reject ────────────────────────────────────────────────────

  async reject(taskId: string, repo: string): Promise<void> {
    const state = this.registry.get(taskId);
    if (!state) throw new Error(`Task ${taskId} not found`);

    await this.worktree.remove(repo, state.worktree, state.branch);
  }
}
