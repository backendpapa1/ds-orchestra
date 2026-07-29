import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OrchestratorService } from '../../services/orchestrator/orchestrator.service.js';

export function registerAbortTool(
  server: McpServer,
  orchestrator: OrchestratorService,
): void {
  server.tool(
    'ds_abort',
    {
      taskId: z.string().regex(/^[0-9a-f]{8}$/, 'Must be an 8-character hex task ID').describe('The task ID to abort'),
      reason: z.string().min(1).describe('Human-readable reason for aborting'),
    },
    async (args) => {
      try {
        const result = await orchestrator.abort(args.taskId, args.reason);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (e) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Abort failed: ${(e as Error).message}` }],
        };
      }
    },
  );
}
