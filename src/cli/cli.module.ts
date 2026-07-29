import { Module } from '@nestjs/common';
import { CliService } from './cli.service.js';
import { ManagedBlockService } from './managed-block.service.js';
import { ConfigFileService } from '../config/config-file.service.js';
import { InitCommand } from './init.command.js';
import { UpdateCommand } from './update.command.js';
import { StatusCommand } from './status.command.js';
import { GcCommand } from './gc.command.js';
import { UninstallCommand } from './uninstall.command.js';
import { ConfigCommand } from './config.command.js';

/**
 * CLI module — registers all commands with Commander.
 * Uses ConfigFileService directly (not ConfigService) to avoid
 * requiring DEEPSEEK_API_KEY for CLI operations.
 */
@Module({
  providers: [
    CliService,
    ManagedBlockService,
    ConfigFileService,
    InitCommand,
    UpdateCommand,
    StatusCommand,
    GcCommand,
    UninstallCommand,
    ConfigCommand,
  ],
})
export class CliModule {}
