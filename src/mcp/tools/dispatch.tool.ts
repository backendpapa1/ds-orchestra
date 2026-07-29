import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OrchestratorService } from '../../services/orchestrator/orchestrator.service.js';
import { OverlapError } from '../../services/orchestrator/overlap-error.js';

export function registerDispatchTool(
  server: McpServer,
  orchestrator: OrchestratorService,
): void {
  server.tool(
    'ds_dispatch',
    `DELEGATE implementation work to a DeepSeek worker. Use this whenever you need to:
- Implement a feature against existing tests
- Fill in function bodies to make tests pass
- Generate boilerplate, scaffolds, or migrations
- Refactor code across files with a clear specification
- Fix a bug where a failing test is already written

Do NOT read source files or start implementing yourself — write the tests, then call this tool.
The worker gets an isolated git worktree and CANNOT touch tests/ or config files.
Returns immediately with a taskId — poll ds_status and ds_tail to monitor.`,
    {
      repo: z.string().min(1).describe('Absolute path to the git repository'),
      goal: z.string().min(1).describe(
        'Closed-form specification. Include exact function signatures, expected behaviour, and edge cases. Leave no design decisions open.',
      ),
      acceptanceCmd: z.string().min(1).describe(
        'Shell command that exits 0 when the task is complete. Runs in the worktree independently.',
      ),
      mayEdit: z.array(z.string()).nonempty().describe(
        'Glob patterns the worker is allowed to modify. Be as narrow as possible (e.g., ["src/feature-a/**"]). Expand if the worker needs broader access.',
      ),
      context: z.string().optional().describe(
        'Conversation context for the worker — why this approach, what NOT to touch, scope boundaries, user preferences. Inject relevant discussion points, rejected alternatives, and explicit guardrails. The worker sees this in its system prompt.',
      ),
      maxSteps: z.number().int().min(1).max(200).optional().describe('Maximum agent steps (default 40). Increase for complex multi-file work.'),
      maxSeconds: z.number().int().min(10).max(7200).optional().describe('Time budget in seconds (default 900 = 15min). Increase for long builds.'),
    },
    async (args) => {
      try {
        const result = await orchestrator.dispatch(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (e) {
        if (e instanceof OverlapError) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: 'overlap',
                message: e.message,
                conflictTaskId: e.conflictTaskId,
                intersectingGlobs: e.intersectingGlobs,
              }),
            }],
          };
        }
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Dispatch failed: ${(e as Error).message}` }],
        };
      }
    },
  );
}
