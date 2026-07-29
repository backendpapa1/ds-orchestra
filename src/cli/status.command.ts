import { Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CliService } from './cli.service.js';
import { ManagedBlockService } from './managed-block.service.js';

@Injectable()
export class StatusCommand implements OnModuleInit {
  constructor(
    private readonly cli: CliService,
    private readonly managedBlock: ManagedBlockService,
  ) {}

  onModuleInit(): void {
    this.cli.program
      .command('status')
      .description('Show version, MCP registration state, and config summary')
      .action(async () => {
        await this.run(process.cwd());
      });
  }

  async run(repo: string): Promise<void> {
    const log = (msg: string): void => {
      process.stderr.write(`[ds-orchestra] ${msg}\n`);
    };

    log('ds-orchestra v0.1.0');
    log('');

    // Check if initialized
    const orchestrDir = join(repo, 'ds-orchestra');
    const initialized = existsSync(orchestrDir);
    log(`Repository: ${repo}`);
    log(`Initialized: ${initialized ? 'yes' : 'no'}`);

    if (!initialized) {
      log('Run ds-orchestra init to set up');
      return;
    }

    // Check managed block
    const claudeMdPath = join(repo, 'CLAUDE.md');
    const block = this.managedBlock.read(claudeMdPath);
    log(`Managed block in CLAUDE.md: ${block ? 'present' : 'missing'}`);

    // Check config
    const configPath = join(orchestrDir, 'config.yaml');
    log(`Config: ${existsSync(configPath) ? 'present' : 'missing'}`);

    // Check MCP registration
    log('');
    log('To check MCP registration: claude mcp list | grep ds-orchestra');

    // Check for orphaned worktrees
    const stateDir = process.env['DS_STATE_DIR'] || join(process.env['HOME'] || '/tmp', '.ds-orchestra');
    const wtDir = join(stateDir, 'wt');
    if (existsSync(wtDir)) {
      log('');
      log(`Worktrees: ${wtDir}`);
      log('Run ds-orchestra gc to clean up orphaned worktrees');
    }
  }
}
