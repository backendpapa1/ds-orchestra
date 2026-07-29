import { Module, OnModuleInit } from '@nestjs/common';
import { OrchestratorModule } from '../services/orchestrator/orchestrator.module.js';
import { OrchestratorService } from '../services/orchestrator/orchestrator.service.js';
import { StderrLogger } from '../logger/stderr-logger.service.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDispatchTool } from './tools/dispatch.tool.js';
import { registerStatusTool } from './tools/status.tool.js';
import { registerTailTool } from './tools/tail.tool.js';
import { registerAbortTool } from './tools/abort.tool.js';
import { registerDiffTool } from './tools/diff.tool.js';
import { registerWaitAllTool } from './tools/wait-all.tool.js';
import { registerAcceptTool } from './tools/accept.tool.js';
import { registerRejectTool } from './tools/reject.tool.js';

/**
 * McpModule — creates the MCP server, registers all tools,
 * and connects the stdio transport on module init.
 */
@Module({
  imports: [OrchestratorModule],
})
export class McpModule implements OnModuleInit {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly logger: StderrLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    const server = new McpServer({
      name: 'ds-orchestra',
      version: '0.1.0',
    });

    // Register all 8 tools
    registerDispatchTool(server, this.orchestrator);
    registerStatusTool(server, this.orchestrator);
    registerTailTool(server, this.orchestrator);
    registerAbortTool(server, this.orchestrator);
    registerDiffTool(server, this.orchestrator);
    registerWaitAllTool(server, this.orchestrator);
    registerAcceptTool(server, this.orchestrator);
    registerRejectTool(server, this.orchestrator);

    // Also register ds_ping for health checks
    server.tool('ds_ping', {}, async () => ({
      content: [{ type: 'text' as const, text: 'pong' }],
    }));

    // Connect stdio transport
    const transport = new StdioServerTransport();
    this.logger.log('ds-orchestra MCP server starting on stdio');
    await server.connect(transport);
  }
}
