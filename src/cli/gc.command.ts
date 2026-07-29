import { Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';
import { CliService } from './cli.service.js';

@Injectable()
export class GcCommand implements OnModuleInit {
  constructor(private readonly cli: CliService) {}

  onModuleInit(): void {
    this.cli.program
      .command('gc')
      .description('Remove orphaned worktrees and branches left by crashed runs')
      .option('--dry-run', 'List orphaned worktrees without removing')
      .action(async (options) => {
        await this.run(options);
      });
  }

  async run(options: { dryRun?: boolean }): Promise<void> {
    const log = (msg: string): void => {
      process.stderr.write(`[ds-orchestra] ${msg}\n`);
    };

    const stateDir =
      process.env['DS_STATE_DIR'] ||
      join(process.env['HOME'] || '/tmp', '.ds-orchestra');
    const wtDir = join(stateDir, 'wt');

    if (!existsSync(wtDir)) {
      log('No worktree directory found. Nothing to clean up.');
      return;
    }

    const entries = readdirSync(wtDir, { withFileTypes: true });
    const worktrees = entries.filter((e) => e.isDirectory());

    if (worktrees.length === 0) {
      log('No worktrees found.');
      return;
    }

    log(`Found ${worktrees.length} worktree(s):`);

    // Try to find the original repo for each worktree
    for (const wt of worktrees) {
      const wtPath = join(wtDir, wt.name);
      log(`  ${wtPath}`);

      if (!options.dryRun) {
        try {
          // Try to get the repo location from the worktree's git config
          const result = await execa(
            'git',
            ['worktree', 'list', '--porcelain'],
            { cwd: wtPath, reject: false },
          );
          if (result.exitCode === 0) {
            // Remove the worktree
            await execa('git', ['worktree', 'remove', '--force', wtPath], {
              reject: false,
            });
            // Try to delete the branch
            try {
              const branch = `ds/${wt.name}`;
              await execa('git', ['branch', '-D', branch], { reject: false });
            } catch {
              // branch might already be gone
            }
          }
        } catch {
          // If git commands fail, just try to remove the directory
          try {
            rmSync(wtPath, { recursive: true, force: true });
          } catch {
            // best effort
          }
        }
      }
    }

    log(options.dryRun ? '(dry-run — no changes made)' : 'Cleanup complete.');
  }
}
