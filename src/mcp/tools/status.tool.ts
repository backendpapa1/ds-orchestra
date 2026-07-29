import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OrchestratorService } from '../../services/orchestrator/orchestrator.service.js';

export function registerStatusTool(
  server: McpServer,
  orchestrator: OrchestratorService,
): void {
  server.tool(
    'ds_status',
    {
      taskId: z.string().regex(/^[0-9a-f]{8}$/, 'Must be an 8-character hex task ID').describe('The task ID from ds_dispatch'),
    },
    async (args) => {
      const status = orchestrator.getStatus(args.taskId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(status) }],
      };
    },
  );
}
