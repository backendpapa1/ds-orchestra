import { Module } from '@nestjs/common';
import { LoggerModule } from './logger/logger.module.js';
import { CliModule } from './cli/cli.module.js';

/**
 * Lean NestJS module for CLI commands.
 *
 * Does NOT load: config, sandbox, worker, MCP, or orchestrator infrastructure.
 * The CLI commands (init, update, status, gc, uninstall) are purely local
 * file operations and don't need DeepSeek API access.
 */
@Module({
  imports: [LoggerModule, CliModule],
})
export class AppCliModule {}
