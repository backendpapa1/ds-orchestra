import { Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { CliService } from './cli.service.js';
import { ManagedBlockService } from './managed-block.service.js';

@Injectable()
export class UninstallCommand implements OnModuleInit {
  constructor(
    private readonly cli: CliService,
    private readonly managedBlock: ManagedBlockService,
  ) {}

  onModuleInit(): void {
    this.cli.program
      .command('uninstall')
      .description('Remove ds-orchestra from this repository')
      .option('--yes', 'Skip confirmation prompt')
      .option('--dry-run', 'Print planned changes without writing')
      .action(async (options) => {
        await this.run(process.cwd(), options);
      });
  }

  async run(repo: string, options: { yes?: boolean; dryRun?: boolean }): Promise<void> {
    const log = (msg: string): void => {
      process.stderr.write(`[ds-orchestra] ${msg}\n`);
    };

    log('Uninstalling ds-orchestra from this repository...');

    // 1. Remove managed block from CLAUDE.md
    const claudeMdPath = join(repo, 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      const result = this.managedBlock.remove(claudeMdPath, options.dryRun);
      if (result.modified) {
        log('Removed managed block from CLAUDE.md');
      }
    }

    // 2. Remove ds-orchestra/ directory
    const orchestrDir = join(repo, 'ds-orchestra');
    if (existsSync(orchestrDir)) {
      if (!options.dryRun) {
        rmSync(orchestrDir, { recursive: true, force: true });
      }
      log('Removed ds-orchestra/ directory');
    }

    // 3. Deregister MCP server
    try {
      if (!options.dryRun) {
        execSync('claude mcp remove ds-orchestra', { stdio: 'pipe' });
      }
      log('Deregistered MCP server');
    } catch {
      log('NOTE: Could not deregister MCP server. Run manually:');
      log('  claude mcp remove ds-orchestra');
    }

    log('');
    log('Uninstall complete. The repository is clean.');
  }
}
