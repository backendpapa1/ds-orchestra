import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OrchestratorService } from '../../services/orchestrator/orchestrator.service.js';

export function registerTailTool(
  server: McpServer,
  orchestrator: OrchestratorService,
): void {
  server.tool(
    'ds_tail',
    {
      taskId: z.string().regex(/^[0-9a-f]{8}$/, 'Must be an 8-character hex task ID').describe('The task ID'),
      n: z.number().int().min(1).max(1000).optional().describe('Number of events (default: all)'),
    },
    async (args) => {
      const events = orchestrator.tail(args.taskId, args.n);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(events) }],
      };
    },
  );
}
