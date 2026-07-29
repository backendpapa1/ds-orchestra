#!/usr/bin/env node
/**
 * ds-orchestra-mcp — stdio MCP server entrypoint.
 *
 * Spawned by Claude Code as a child process. Communicates via JSON-RPC
 * over stdin/stdout. stdout is RESERVED for the MCP protocol — all
 * logging must go to stderr via StderrLogger.
 *
 * The McpModule handles MCP server lifecycle automatically on module init:
 * it creates the McpServer, registers all tools, and connects stdio transport.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { StderrLogger } from './logger/stderr-logger.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    bufferLogs: true,
    abortOnError: true,
  });

  const stderrLogger = app.get(StderrLogger);
  stderrLogger.setContext('ds-orchestra');
  app.useLogger(stderrLogger);
  app.enableShutdownHooks();

  // Trigger module initialization — McpModule.onModuleInit connects the transport
  await app.init();

  // Keep the process alive while the transport runs on stdin/stdout
}

bootstrap().catch((err: Error) => {
  process.stderr.write(`[ds-orchestra] Fatal: ${err.message}\n`);
  process.exit(1);
});
