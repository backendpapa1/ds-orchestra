import { Injectable } from '@nestjs/common';
import { execa } from 'execa';
import { TripwireError } from '../../shared/utils/tripwire-error.js';
import { truncate } from '../../shared/utils/truncator.js';
import type { TaskContract } from '../../shared/contracts/task-contract.js';
import type { RunResult, RunStatus } from '../../shared/contracts/run-state.js';
import type { LogEvent } from '../../shared/contracts/log-event.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { DeepSeekClient } from './deepseek-client.service.js';
import type { WorkerToolDefinition } from './deepseek-client.service.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { EventLogService } from '../run-registry/event-log.service.js';

// Tool handlers
import { handleReadFile } from './tools/read-file.handler.js';
import { handleListFiles } from './tools/list-files.handler.js';
import { handleGrep } from './tools/grep.handler.js';
import { handleWriteFile } from './tools/write-file.handler.js';
import type { WriteFileState } from './tools/write-file.handler.js';
import { handleRunBash } from './tools/run-bash.handler.js';
import type { BashState } from './tools/run-bash.handler.js';
import { handleSubmit } from './tools/submit.handler.js';

/**
 * WorkerService — runs the DeepSeek agent loop.
 *
 * Each step:
 * 1. Check abort signal + time budget
 * 2. Call DeepSeek with full message history + 6 tool schemas
 * 3. If no tool calls → inject nudge message, continue (do not let it converse)
 * 4. Dispatch each tool call through sandbox checks
 * 5. TripwireError → terminate immediately with 'violated'
 * 6. Other errors → return as tool error string, worker can recover
 * 7. On 'submit' → finalization (acceptance command + test-diff check)
 */
@Injectable()
export class WorkerService {
  constructor(
    private readonly deepseek: DeepSeekClient,
    private readonly sandbox: SandboxService,
    private readonly eventLog: EventLogService,
  ) {}

  /**
   * Run the full agent loop for a task contract.
   * Resolves when the worker submits, trips a wire, or is aborted.
   */
  async run(contract: TaskContract, signal: AbortSignal): Promise<RunResult> {
    const startTime = Date.now();
    const filesTouched = new Set<string>();
    let totalTokens = 0;
    let stepCount = 0;
    let nudgeCount = 0;
    let workerSummary = '';
    let tripwireReason: string | undefined;

    // Emit start event
    this.emit(contract.taskId, { t: 0, kind: 'start', contract });

    // Build initial message history
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `Your task:\n\n${contract.goal}\n\nAcceptance command: ${contract.acceptanceCmd}\n\nYou may edit files matching: ${contract.mayEdit.join(', ')}\n\nBegin by reading relevant files and understanding the codebase. When done, call submit with a summary of your changes.`,
      },
    ];

    const tools = WORKER_TOOL_DEFINITIONS;

    try {
      // ── Agent loop ──────────────────────────────────────────
      while (stepCount < contract.maxSteps) {
        // 1. Check abort signal
        if (signal.aborted) {
          const reason = (signal as AbortSignal & { reason?: string }).reason ?? 'aborted';
          throw new TripwireError(`aborted: ${reason}`);
        }

        // 2. Check time budget
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= contract.maxSeconds) {
          throw new TripwireError(
            `wall-clock budget exceeded: ${elapsed.toFixed(1)}s / ${contract.maxSeconds}s`,
          );
        }

        stepCount++;

        // 3. Call DeepSeek
        const response = await this.deepseek.chatCompletion({
          messages,
          tools,
          signal,
        });

        // Track tokens
        if (response.usage) {
          totalTokens +=
            response.usage.promptTokens + response.usage.completionTokens;
        }

        this.emit(contract.taskId, {
          t: (Date.now() - startTime) / 1000,
          kind: 'step',
          n: stepCount,
          tokens: {
            in: response.usage?.promptTokens ?? 0,
            out: response.usage?.completionTokens ?? 0,
          },
        });

        // 4. If no tool calls → nudge (max 3 consecutive nudges)
        if (response.toolCalls.length === 0) {
          nudgeCount++;
          if (nudgeCount > 3) {
            throw new TripwireError(
              `Worker returned no tool calls ${nudgeCount} times consecutively — appears stuck or refusing`,
            );
          }
          messages.push({
            role: 'assistant',
            content: response.content ?? '',
          });
          messages.push({
            role: 'user',
            content:
              'You must use a tool to make progress or call submit if you are done. Do not just describe what you would do — use the tools.',
          });
          continue;
        }
        // Reset nudge counter on successful tool use
        nudgeCount = 0;

        // 5. Dispatch tool calls
        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });

        // Process each tool call
        let shouldFinalize = false;

        for (const toolCall of response.toolCalls) {
          const toolResult = await this.dispatchTool(
            toolCall.name,
            toolCall.arguments as Record<string, string>,
            contract,
            { filesTouched, onWrite: (path, bytes) => {
              this.emit(contract.taskId, {
                t: (Date.now() - startTime) / 1000,
                kind: 'write',
                path,
                bytes,
              });
            }},
            {
              onCommand: (cmd, exitCode, stdout) => {
                this.emit(contract.taskId, {
                  t: (Date.now() - startTime) / 1000,
                  kind: 'bash',
                  cmd,
                  exitCode,
                  stdoutTruncated: truncate(stdout, 1000),
                });
              },
            },
          );

          // Check if submit was called
          if (toolResult.submit) {
            workerSummary = toolResult.content[0]?.text ?? 'No summary';
            shouldFinalize = true;
            break; // Stop processing other tool calls
          }

          // Add tool result to history
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult.content[0]?.text ?? '',
          });
        }

        if (shouldFinalize) {
          // Check abort before finalization — don't run acceptance if aborted
          if (signal.aborted) {
            const reason = (signal as AbortSignal & { reason?: string }).reason ?? 'aborted';
            throw new TripwireError(`aborted: ${reason}`);
          }
          // Run finalization and return
          return await this.finalize(
            contract,
            workerSummary,
            filesTouched,
            totalTokens,
            stepCount,
            startTime,
          );
        }
      }

      // Max steps exceeded
      throw new TripwireError(
        `maxSteps exceeded: ${stepCount} steps (limit: ${contract.maxSteps})`,
      );
    } catch (e) {
      if (e instanceof TripwireError) {
        tripwireReason = e.message;

        this.emit(contract.taskId, {
          t: (Date.now() - startTime) / 1000,
          kind: 'tripwire',
          reason: e.message,
        });

        // Determine status
        const status: RunStatus = e.message.startsWith('aborted:')
          ? 'aborted'
          : 'violated';

        // Capture partial diff if possible
        let diff = '';
        try {
          const diffResult = await execa('git', ['diff', 'HEAD'], {
            cwd: contract.workdir,
            reject: false,
          });
          diff =
            typeof diffResult.stdout === 'string'
              ? truncate(diffResult.stdout, 120_000)
              : '';
        } catch {
          // Diff capture is best-effort
        }

        return {
          status,
          workerSummary: e.message,
          acceptanceExitCode: null,
          acceptanceOutput: '',
          testsModified: [],
          filesTouched: [...filesTouched],
          diff,
          violationReason: tripwireReason,
          stepsCompleted: stepCount,
          totalTokens,
        };
      }

      // Unexpected error — treat as violation
      tripwireReason = `unexpected error: ${(e as Error).message}`;
      return {
        status: 'violated',
        workerSummary: tripwireReason,
        acceptanceExitCode: null,
        acceptanceOutput: '',
        testsModified: [],
        filesTouched: [...filesTouched],
        diff: '',
        violationReason: tripwireReason,
        stepsCompleted: stepCount,
        totalTokens,
      };
    }
  }

  /**
   * Dispatch a single tool call through the sandbox.
   * TripwireError propagates (terminates run).
   * Other errors return as error strings (worker can recover).
   */
  private async dispatchTool(
    name: string,
    args: Record<string, string>,
    contract: TaskContract,
    writeState: WriteFileState,
    bashState: BashState,
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; submit?: boolean }> {
    switch (name) {
      case 'read_file':
        return handleReadFile(args as { path: string }, contract, this.sandbox);

      case 'list_files':
        return handleListFiles(
          args as { path: string; pattern?: string },
          contract,
          this.sandbox,
        );

      case 'grep':
        return handleGrep(
          args as { pattern: string; path: string },
          contract,
          this.sandbox,
        );

      case 'write_file':
        return handleWriteFile(
          args as { path: string; content: string },
          contract,
          this.sandbox,
          writeState,
        );

      case 'run_bash':
        return handleRunBash(
          args as { command: string },
          contract,
          this.sandbox,
          bashState,
        );

      case 'submit':
        return handleSubmit(args as { summary: string });

      default:
        return {
          content: [
            {
              type: 'text',
              text: `ERROR: Unknown tool '${name}'. Available tools: read_file, list_files, grep, write_file, run_bash, submit`,
            },
          ],
        };
    }
  }

  /**
   * Finalization — runs independently of the worker. Does not trust worker self-report.
   *
   * 1. Run acceptanceCmd in the worktree, capture exit code and output
   * 2. Run git diff --name-only to check for test file modifications
   * 3. status = 'passed' only if exitCode === 0 AND no test files dirty
   */
  private async finalize(
    contract: TaskContract,
    workerSummary: string,
    filesTouched: Set<string>,
    totalTokens: number,
    stepCount: number,
    startTime: number,
  ): Promise<RunResult> {
    // Emit submit event
    this.emit(contract.taskId, {
      t: (Date.now() - startTime) / 1000,
      kind: 'submit',
      summary: workerSummary,
    });

    // 1. Run acceptance command independently
    let acceptanceExitCode: number | null = null;
    let acceptanceOutput = '';

    try {
      const result = await execa('bash', ['-c', contract.acceptanceCmd], {
        cwd: contract.workdir,
        timeout: 120_000,
        reject: false,
      });
      acceptanceExitCode = result.exitCode ?? 1;
      acceptanceOutput = truncate(
        typeof result.stdout === 'string' ? result.stdout : '',
        6_000,
      );
    } catch (e) {
      acceptanceOutput = `Failed to run acceptance command: ${(e as Error).message}`;
      acceptanceExitCode = null;
    }

    // 2. Check for test file modifications
    let testsModified: string[] = [];
    try {
      const diffResult = await execa(
        'git',
        ['diff', '--name-only', 'HEAD', '--', 'tests/', ':/*.spec.ts', ':/*.test.ts', ':/*.spec.tsx', ':/*.test.tsx'],
        { cwd: contract.workdir, reject: false },
      );
      if (diffResult.stdout && typeof diffResult.stdout === 'string') {
        const files = diffResult.stdout.trim().split('\n').filter(Boolean);
        testsModified = files.filter(
          (f) =>
            f.startsWith('tests/') ||
            f.includes('.spec.') ||
            f.includes('.test.'),
        );
      }
    } catch {
      // Diff check is best-effort
    }

    // Emit verify event
    this.emit(contract.taskId, {
      t: (Date.now() - startTime) / 1000,
      kind: 'verify',
      exitCode: acceptanceExitCode ?? 1,
      testsDirty: testsModified,
    });

    // 3. Determine status
    const passed =
      acceptanceExitCode === 0 && testsModified.length === 0;
    const status: RunStatus = passed ? 'passed' : 'failed';

    // 4. Capture full diff
    let diff = '';
    try {
      const diffResult = await execa('git', ['diff', 'HEAD'], {
        cwd: contract.workdir,
        reject: false,
      });
      diff =
        typeof diffResult.stdout === 'string'
          ? truncate(diffResult.stdout, 120_000)
          : '';
    } catch {
      // Best-effort
    }

    return {
      status,
      workerSummary,
      acceptanceExitCode,
      acceptanceOutput,
      testsModified,
      filesTouched: [...filesTouched],
      diff,
      stepsCompleted: stepCount,
      totalTokens,
    };
  }

  /** Emit a log event to the JSONL file. */
  private emit(taskId: string, event: LogEvent): void {
    try {
      this.eventLog.append(taskId, event);
    } catch {
      // Best-effort logging
    }
  }
}

// ── System prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a software implementation agent. Your goal is to modify source files to satisfy the specification and pass the acceptance command.

WHAT YOU CAN DO:
- Read any source file, config file, lock file, or documentation to understand the codebase.
- Write files matching the mayEdit patterns provided in the task.
- Run build, test, lint, and other development commands via run_bash.
- Submit your work when complete or blocked.

WHAT YOU CANNOT DO:
- Write to tests/, **/*.spec.ts, **/*.test.ts — these are the contract. Tests must pass AS-IS.
- Write to package.json, tsconfig*.json, .env*, lock files, or .git/.
- Read test files or .env files — these are blocked to prevent shortcuts.

RULES:
1. Start by reading relevant source files (not test files) to understand the codebase.
2. You CAN and SHOULD read package.json, tsconfig, lock files — they help you understand the project's dependencies, scripts, and build setup.
3. Do not hardcode values to satisfy assertions. Implement the actual logic.
4. If the specification is ambiguous or appears wrong, call submit with a summary beginning "BLOCKED:" explaining what is unclear.
5. Run the acceptance command to verify your work before submitting.
6. When done, call submit with a clear summary of all changes made.

TOOLS:
- read_file(path) — read a file (source and config files allowed, test files blocked)
- list_files(path) — list directory contents
- grep(pattern, path) — search for a pattern in files
- write_file(path, content) — write content to a file (only within mayEdit)
- run_bash(command) — run a shell command in the worktree
- submit(summary) — submit your completed work for verification`;

// ── Tool definitions sent to DeepSeek ────────────────────────────

const WORKER_TOOL_DEFINITIONS: WorkerToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Path is relative to the worktree.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file in the worktree' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory. Recursive. Skips hidden files and node_modules.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative directory path in the worktree' },
        pattern: { type: 'string', description: 'Optional glob filter (e.g., "**/*.ts")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'grep',
    description: 'Search for a pattern in files. Uses ripgrep if available, otherwise grep -r.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex supported)' },
        path: { type: 'string', description: 'Relative directory or file path to search in' },
      },
      required: ['pattern', 'path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories. Overwrites existing files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path in the worktree to write to' },
        content: { type: 'string', description: 'Complete file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_bash',
    description: 'Run a bash command in the worktree. Only allowlisted commands are permitted (npm, npx, node, tsc, jest, vitest, eslint, ls, cat).',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute in the worktree' },
      },
      required: ['command'],
    },
  },
  {
    name: 'submit',
    description: 'Submit your completed work for verification. Include a summary of all changes made.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of all changes made and why' },
      },
      required: ['summary'],
    },
  },
];
