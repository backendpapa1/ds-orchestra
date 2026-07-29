import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OrchestratorService } from '../../services/orchestrator/orchestrator.service.js';

export function registerDiffTool(
  server: McpServer,
  orchestrator: OrchestratorService,
): void {
  server.tool(
    'ds_diff',
    {
      taskId: z.string().regex(/^[0-9a-f]{8}$/, 'Must be an 8-character hex task ID').describe('The task ID'),
    },
    async (args) => {
      const diff = await orchestrator.diff(args.taskId);
      return {
        content: [{ type: 'text' as const, text: diff || '(no changes)' }],
      };
    },
  );
}
