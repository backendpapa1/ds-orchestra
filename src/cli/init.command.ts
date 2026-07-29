import { Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync, writeFileSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliService } from './cli.service.js';
import { ManagedBlockService } from './managed-block.service.js';
import { ConfigFileService } from '../config/config-file.service.js';
import { detectStack } from './stack-detector.js';
import { execSync } from 'node:child_process';

/**
 * ds-orchestra init — set up ds-orchestra in a target repository.
 * Idempotent — safe to re-run multiple times.
 */
@Injectable()
export class InitCommand implements OnModuleInit {
  constructor(
    private readonly cli: CliService,
    private readonly managedBlock: ManagedBlockService,
    private readonly configFile: ConfigFileService,
  ) {}

  onModuleInit(): void {
    this.cli.program
      .command('init')
      .description('Initialize ds-orchestra in the current repository')
      .option('--force', 'Skip prompts, overwrite managed artifacts')
      .option('--yes', 'Non-interactive mode (for CI)')
      .option('--no-mcp', 'Skip MCP server registration')
      .option('--dry-run', 'Print planned changes without writing')
      .action(async (options) => {
        await this.run(process.cwd(), options);
      });
  }

  async run(
    repo: string,
    options: { force?: boolean; yes?: boolean; noMcp?: boolean; dryRun?: boolean },
  ): Promise<void> {
    const log = (msg: string): void => {
      process.stderr.write(`[ds-orchestra] ${msg}\n`);
    };

    log(`Initializing ds-orchestra in ${repo}${options.dryRun ? ' (dry-run)' : ''}`);

    // 1. Verify prerequisites
    if (!existsSync(join(repo, '.git'))) {
      log('ERROR: Not a git repository. Run `git init` first.');
      process.exit(1);
    }

    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    if (major < 20) {
      log(`ERROR: Node 20+ required. Found: ${nodeVersion}`);
      process.exit(1);
    }

    const hasApiKey = process.env['DEEPSEEK_API_KEY'] || this.configFile.get('api_key');
    if (!hasApiKey) {
      log('WARNING: DEEPSEEK_API_KEY is not set. Save it with:');
      log('  ds-orchestra config set api_key sk-your-key-here');
    }

    // 2. Detect stack
    const stack = detectStack(repo);
    log(`Detected stack: ${stack.stack}`);

    // 3. Create ds-orchestra/ directory
    const orchestrDir = join(repo, 'ds-orchestra');
    if (!options.dryRun) {
      mkdirSync(join(orchestrDir, '.runs'), { recursive: true });
    }
    log(`Created ${orchestrDir}/.runs/`);

    // 4. Write INSTRUCTIONS.md
    const instructionsContent = getInstructionsContent(stack);
    if (!options.dryRun) {
      writeFileSync(join(orchestrDir, 'INSTRUCTIONS.md'), instructionsContent, 'utf-8');
    }
    log('Wrote ds-orchestra/INSTRUCTIONS.md');

    // 5. Write config.yaml
    const configContent = getConfigContent(stack);
    if (!options.dryRun) {
      writeFileSync(join(orchestrDir, 'config.yaml'), configContent, 'utf-8');
    }
    log('Wrote ds-orchestra/config.yaml');

    // 6. Inject managed block into CLAUDE.md
    const claudeMdPath = join(repo, 'CLAUDE.md');
    const blockContent = getBlockContent();
    const result = this.managedBlock.upsert(claudeMdPath, blockContent, options.dryRun);
    if (result.modified) {
      log(`${claudeMdPath}: ${existsSync(claudeMdPath) ? 'updated' : 'created'} managed block`);
    } else {
      log(`${claudeMdPath}: managed block already up to date`);
    }

    // 7. Add .runs/ to .gitignore
    const gitignorePath = join(repo, '.gitignore');
    const gitignoreEntry = 'ds-orchestra/.runs/';
    let gitignoreModified = false;
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8');
      if (!content.includes(gitignoreEntry)) {
        if (!options.dryRun) {
          appendFileSync(gitignorePath, `\n${gitignoreEntry}\n`, 'utf-8');
        }
        gitignoreModified = true;
      }
    } else {
      if (!options.dryRun) {
        writeFileSync(gitignorePath, `${gitignoreEntry}\n`, 'utf-8');
      }
      gitignoreModified = true;
    }
    if (gitignoreModified) {
      log('.gitignore: added ds-orchestra/.runs/');
    }

    // 8. Register MCP server
    if (!options.noMcp) {
      if (options.dryRun) {
        log('Would register MCP server: claude mcp add ds-orchestra');
      } else {
        try {
          execSync('claude mcp add ds-orchestra -- ds-orchestra-mcp', {
            stdio: 'pipe',
          });
          log('Registered MCP server: claude mcp add ds-orchestra');
        } catch {
          log('NOTE: Could not register MCP server. Run manually:');
          log('  claude mcp add ds-orchestra -- ds-orchestra-mcp');
        }
      }
    }

    log('');
    log('Done! Next steps:');
    if (!process.env['DEEPSEEK_API_KEY'] && !this.configFile.get('api_key')) {
      log('  1. Save your DeepSeek API key:');
      log('     ds-orchestra config set api_key sk-your-key-here');
    }
    log('  1. Restart Claude Code to load the new MCP server');
    log('  2. Write failing tests in tests/');
    log('  3. Use ds_dispatch to delegate implementation');
  }
}

function getBlockContent(): string {
  return `
<!-- This block is managed by ds-orchestra. Do not edit manually. -->
<!-- Local overrides go in CLAUDE.md OUTSIDE this block. -->

## Delegation (ds-orchestra)

**When to delegate**: Bulk/mechanical implementation above ~200 lines with a clear acceptance command (compile + tests pass). Refactoring, boilerplate, data migrations, implementation against existing tests.

**Before dispatching**:
- Write the tests yourself in \`tests/\`. The worker CANNOT edit tests.
- \`goal\` must be a closed-form spec: exact signatures, exact behavior, edge cases.
- \`mayEdit\` must be as narrow as possible (e.g., \`src/feature-a/**\`).

**Decide before reading source files**. Use Glob/Grep/LS only until you commit to delegate. If you cannot scope the task without reading every file, implement it yourself.

**After the run**:
- Read the full diff with \`ds_diff\` before \`ds_accept\`. Never merge unaudited.
- If the worker failed because tests were wrong, fix the tests (you wrote them) and re-dispatch.

Full workflow and audit checklist: \`ds-orchestra/INSTRUCTIONS.md\`
`.trim();
}

function getInstructionsContent(stack: ReturnType<typeof detectStack>): string {
  return `# ds-orchestra — Orchestration Policy

> This file is managed by \`ds-orchestra update\`. Do not edit manually.
> Local overrides belong in \`CLAUDE.md\` outside the managed block.

## Full Workflow

1. **Write tests** — Always write the failing tests yourself in \`tests/\`.
   The worker cannot modify test files. Tests are the contract.

2. **Scope the task** — Use Glob/Grep/LS to understand what files are involved.
   Decide before reading source files. If you need to read everything to write
   the spec, the task is too complex to delegate.

3. **Dispatch** — Call \`ds_dispatch\` with:
   - \`goal\`: Closed-form spec — exact signatures, exact behavior, edge cases
   - \`acceptanceCmd\`: Shell command that exits 0 on success
   - \`mayEdit\`: Narrow glob(s) the worker can modify
   - The worker gets its own git worktree — your working tree is never touched

4. **Supervise** — Poll \`ds_status\` and \`ds_tail\` to monitor progress.
   The worker runs asynchronously. You can \`ds_abort\` at any time.

5. **Audit** — Read the full diff with \`ds_diff\`. Never skip this step.
   The worker runs at temperature 0 but can still produce incorrect code.

6. **Accept or reject** — \`ds_accept\` squash-merges the changes;
   \`ds_reject\` cleans up without merging.

## Audit Checklist

- [ ] Read the full diff — every line
- [ ] Verify tests pass (\`acceptanceExitCode === 0\`)
- [ ] Verify no test files were modified (\`testsModified\` is empty)
- [ ] Check for hardcoded values that satisfy assertions without solving the problem
- [ ] Verify the implementation matches the spec
- [ ] Check for unnecessary changes outside \`mayEdit\`

## Model Selection

- Default: \`deepseek-v4-flash\` — fast, cheap, good for routine implementation
- For complex tasks: \`deepseek-v4-pro\` — stronger reasoning, better tool-call reliability
- Configure with: \`ds-orchestra config set model deepseek-v4-pro\`
- Thinking mode is OFF by default (required for temperature=0)

## Stack Defaults

- Stack: ${stack.stack}
- Default acceptance command: \`${stack.acceptanceCmd}\`
- Allowed commands: ${stack.bashAllow.join(', ')}
`;
}

function getConfigContent(stack: ReturnType<typeof detectStack>): string {
  return `# ds-orchestra configuration
# Edit this file to customize worker behavior.

model: deepseek-v4-flash
maxConcurrent: 5
stack: ${stack.stack}

# Default neverTouch globs (worker cannot modify files matching these)
neverTouch:
  - tests/**
  - "**/*.spec.ts"
  - "**/*.test.ts"
  - "**/*.lock"
  - .git/**
  - .env*
  - "**/migrations/**"
  - package.json
  - tsconfig*.json

# Allowed bash commands
bashAllow:
${stack.bashAllow.map((c) => `  - ${c}`).join('\n')}

# Default acceptance command hint
acceptanceCmd: ${stack.acceptanceCmd}
`;
}
