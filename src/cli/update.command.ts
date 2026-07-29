import { Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CliService } from './cli.service.js';
import { ManagedBlockService } from './managed-block.service.js';

@Injectable()
export class UpdateCommand implements OnModuleInit {
  constructor(
    private readonly cli: CliService,
    private readonly managedBlock: ManagedBlockService,
  ) {}

  onModuleInit(): void {
    this.cli.program
      .command('update')
      .description('Regenerate INSTRUCTIONS.md and refresh the managed block')
      .option('--dry-run', 'Print planned changes without writing')
      .action(async (options) => {
        await this.run(process.cwd(), options);
      });
  }

  async run(repo: string, options: { dryRun?: boolean }): Promise<void> {
    const log = (msg: string): void => {
      process.stderr.write(`[ds-orchestra] ${msg}\n`);
    };

    const claudeMdPath = join(repo, 'CLAUDE.md');
    if (!existsSync(claudeMdPath)) {
      log('No CLAUDE.md found — run ds-orchestra init first');
      return;
    }

    // Regenerate the managed block
    const blockContent = `\n<!-- This block is managed by ds-orchestra. Do not edit manually. -->\n<!-- Local overrides go in CLAUDE.md OUTSIDE this block. -->\n\n## Delegation (ds-orchestra)\n\n**When to delegate**: Bulk/mechanical implementation above ~200 lines with a clear acceptance command (compile + tests pass).\n\n**Before dispatching**:\n- Write the tests yourself. The worker CANNOT edit tests.\n- goal must be a closed-form spec.\n- mayEdit must be as narrow as possible.\n\n**Decide before reading source files**. Use Glob/Grep/LS only.\n\n**After the run**:\n- Read the full diff with ds_diff before ds_accept. Never merge unaudited.\n\nFull workflow: ds-orchestra/INSTRUCTIONS.md\n`;

    const result = this.managedBlock.upsert(claudeMdPath, blockContent, options.dryRun);
    log(`${claudeMdPath}: ${result.modified ? 'updated' : 'already up to date'}`);
  }
}
