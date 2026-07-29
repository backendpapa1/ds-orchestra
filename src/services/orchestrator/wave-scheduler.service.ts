import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../config/config.service.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { OverlapError } from './overlap-error.js';
import type { TaskContract } from '../../shared/contracts/task-contract.js';
import type { RunResult } from '../../shared/contracts/run-state.js';
import type { RunRegistry } from '../run-registry/run-registry.service.js';

/**
 * WaveScheduler — overlap detection and concurrency control.
 *
 * PRD §7.5:
 * - checkOverlap: conservative glob intersection. False positives OK, false negatives NOT OK.
 * - Concurrency cap: default 5, configurable via DS_MAX_CONCURRENT.
 * - waitAll: Promise.allSettled semantics — violated runs resolve, not reject.
 */
@Injectable()
export class WaveScheduler {
  constructor(
    private readonly config: ConfigService,
    private readonly sandbox: SandboxService,
  ) {}

  /**
   * Check if a new contract's mayEdit overlaps with any active contract.
   *
   * @returns OverlapError if conflict found, null if clear.
   */
  checkOverlap(
    newContract: TaskContract,
    activeContracts: TaskContract[],
  ): OverlapError | null {
    for (const active of activeContracts) {
      if (this.sandbox.globsOverlap(newContract.mayEdit, active.mayEdit)) {
        // Find the specific intersecting globs
        const intersecting = this.findIntersecting(
          newContract.mayEdit,
          active.mayEdit,
        );
        return new OverlapError(
          `Overlap with active run ${active.taskId}. ` +
            `Intersecting globs: ${intersecting.join(', ')}. ` +
            `Wait for that run to complete, or narrow your mayEdit.`,
          active.taskId,
          intersecting,
        );
      }
    }
    return null;
  }

  /**
   * Check if the concurrency cap allows another task.
   */
  hasCapacity(activeCount: number): boolean {
    return activeCount < this.config.maxConcurrent;
  }

  /**
   * Wait for all named tasks to settle.
   * Uses polling on RunRegistry since we don't store Promises.
   */
  async waitAll(
    taskIds: string[],
    registry: RunRegistry,
  ): Promise<RunResult[]> {
    const results: RunResult[] = [];

    // Poll until all tasks have settled
    await new Promise<void>((resolve) => {
      const check = (): void => {
        let allDone = true;
        results.length = 0;

        for (const taskId of taskIds) {
          const state = registry.get(taskId);
          if (!state) {
            results.push({
              status: 'failed',
              workerSummary: `Task ${taskId} not found`,
              acceptanceExitCode: null,
              acceptanceOutput: '',
              testsModified: [],
              filesTouched: [],
              diff: '',
              stepsCompleted: 0,
            });
          } else if (state.status === 'running') {
            allDone = false;
          } else {
            results.push(
              state.result ?? {
                status: state.status,
                workerSummary: 'No result recorded',
                acceptanceExitCode: null,
                acceptanceOutput: '',
                testsModified: [],
                filesTouched: [...state.filesTouched],
                diff: '',
                stepsCompleted: state.stepsCompleted,
              },
            );
          }
        }

        if (allDone) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });

    return results;
  }

  /** Find which globs from two sets intersect (best-effort for error messages). */
  private findIntersecting(globsA: readonly string[], globsB: readonly string[]): string[] {
    const intersecting: string[] = [];
    for (const a of globsA) {
      for (const b of globsB) {
        if (
          a === b ||
          (a.replace(/\/?\*\*\/?\*?$/, '') &&
            b.replace(/\/?\*\*\/?\*?$/, '') &&
            (a.replace(/\/?\*\*\/?\*?$/, '').startsWith(b.replace(/\/?\*\*\/?\*?$/, '')) ||
              b.replace(/\/?\*\*\/?\*?$/, '').startsWith(a.replace(/\/?\*\*\/?\*?$/, ''))))
        ) {
          if (!intersecting.includes(a)) intersecting.push(a);
          if (!intersecting.includes(b)) intersecting.push(b);
        }
      }
    }
    return intersecting;
  }
}
