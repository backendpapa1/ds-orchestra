#!/usr/bin/env node
/**
 * ds-orchestra — CLI entrypoint.
 *
 * Commands: init, update, status, gc, uninstall
 * Uses a lean NestJS module (AppCliModule) — no MCP/worker infrastructure loaded.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppCliModule } from './app-cli.module.js';
import { StderrLogger } from './logger/stderr-logger.service.js';
import { CliService } from './cli/cli.service.js';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppCliModule, {
    logger: false,
    bufferLogs: true,
    abortOnError: true,
  });

  const logger = app.get(StderrLogger);
  logger.setContext('ds-orchestra');
  app.useLogger(logger);

  // Initialize modules (commands register themselves)
  await app.init();

  // Run the CLI
  const cli = app.get(CliService);
  await cli.run(process.argv);

  await app.close();
}

main().catch((err: Error) => {
  process.stderr.write(`[ds-orchestra] ${err.message}\n`);
  process.exit(1);
});
