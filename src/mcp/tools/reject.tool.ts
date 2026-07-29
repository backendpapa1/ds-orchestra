import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OrchestratorService } from '../../services/orchestrator/orchestrator.service.js';

export function registerRejectTool(
  server: McpServer,
  orchestrator: OrchestratorService,
): void {
  server.tool(
    'ds_reject',
    {
      taskId: z.string().regex(/^[0-9a-f]{8}$/, 'Must be an 8-character hex task ID').describe('The task ID to reject'),
      repo: z.string().min(1).describe('Absolute path to the git repository'),
    },
    async (args) => {
      try {
        await orchestrator.reject(args.taskId, args.repo);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ taskId: args.taskId, status: 'rejected' }) }],
        };
      } catch (e) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Reject failed: ${(e as Error).message}` }],
        };
      }
    },
  );
}
