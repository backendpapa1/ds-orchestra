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
    {
      repo: z.string().min(1).describe('Absolute path to the git repository'),
      goal: z.string().min(1).describe(
        'Closed-form specification. Include exact function signatures, expected behaviour, and edge cases. Leave no design decisions open.',
      ),
      acceptanceCmd: z.string().min(1).describe(
        'Shell command that exits 0 when the task is complete. Runs in the worktree independently.',
      ),
      mayEdit: z.array(z.string()).nonempty().describe(
        'Glob patterns the worker is allowed to modify. Be as narrow as possible. The worker CANNOT touch tests/ or config files.',
      ),
      maxSteps: z.number().int().min(1).max(200).optional().describe('Maximum agent steps (default 40)'),
      maxSeconds: z.number().int().min(10).max(7200).optional().describe('Time budget in seconds (default 900)'),
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
