import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { LoggerModule } from './logger/logger.module.js';
import { SandboxModule } from './services/sandbox/sandbox.module.js';
import { WorktreeModule } from './services/worktree/worktree.module.js';
import { WorkerModule } from './services/worker/worker.module.js';
import { RunRegistryModule } from './services/run-registry/run-registry.module.js';
import { OrchestratorModule } from './services/orchestrator/orchestrator.module.js';
import { McpModule } from './mcp/mcp.module.js';

/**
 * Root NestJS module for the MCP server.
 *
 * Loads the FULL stack. The McpModule handles the MCP server lifecycle
 * automatically on module init — it creates the server, registers tools,
 * and connects the stdio transport.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    SandboxModule,
    WorktreeModule,
    WorkerModule,
    RunRegistryModule,
    OrchestratorModule,
    McpModule,
  ],
})
export class AppModule {}
