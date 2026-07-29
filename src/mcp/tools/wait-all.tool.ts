import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OrchestratorService } from '../../services/orchestrator/orchestrator.service.js';

export function registerWaitAllTool(
  server: McpServer,
  orchestrator: OrchestratorService,
): void {
  server.tool(
    'ds_wait_all',
    {
      taskIds: z.array(z.string().min(1)).min(1).max(20).describe('Task IDs to wait for'),
    },
    async (args) => {
      const results = await orchestrator.waitAll(args.taskIds);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results) }],
      };
    },
  );
}
