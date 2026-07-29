import { Injectable, OnModuleInit } from '@nestjs/common';
import { CliService } from './cli.service.js';
import { ConfigFileService } from '../config/config-file.service.js';
import type { ConfigKey } from '../config/config-file.service.js';

const VALID_KEYS: ConfigKey[] = ['api_key', 'model', 'max_concurrent', 'state_dir', 'thinking'];

@Injectable()
export class ConfigCommand implements OnModuleInit {
  constructor(
    private readonly cli: CliService,
    private readonly configFile: ConfigFileService,
  ) {}

  onModuleInit(): void {
    const configCmd = this.cli.program
      .command('config')
      .description('Manage ds-orchestra configuration');

    configCmd
      .command('set')
      .description('Set a configuration value')
      .argument('<key>', `Config key (${VALID_KEYS.join(', ')})`)
      .argument('<value>', 'Value to set')
      .action((key: string, value: string) => {
        this.runSet(key, value);
      });

    configCmd
      .command('get')
      .description('Get a configuration value')
      .argument('<key>', `Config key (${VALID_KEYS.join(', ')})`)
      .action((key: string) => {
        this.runGet(key);
      });

    configCmd
      .command('list')
      .description('List all configuration values')
      .action(() => {
        this.runList();
      });

    configCmd
      .command('unset')
      .description('Remove a configuration value')
      .argument('<key>', `Config key (${VALID_KEYS.join(', ')})`)
      .action((key: string) => {
        this.runUnset(key);
      });
  }

  private validateKey(key: string): ConfigKey {
    if (!VALID_KEYS.includes(key as ConfigKey)) {
      process.stderr.write(
        `[ds-orchestra] Invalid config key: '${key}'\n` +
        `Valid keys: ${VALID_KEYS.join(', ')}\n`,
      );
      process.exit(1);
    }
    return key as ConfigKey;
  }

  runSet(key: string, value: string): void {
    const k = this.validateKey(key);
    const log = (msg: string) => process.stderr.write(`[ds-orchestra] ${msg}\n`);
    this.configFile.set(k, value);
    log(`Set ${k} = ${value}`);

    if (k === 'api_key') {
      log('API key saved. The MCP server will use this on next start.');
      log('Restart Claude Code for changes to take effect.');
    }
  }

  runGet(key: string): void {
    const k = this.validateKey(key);
    const value = this.configFile.get(k);
    if (value !== undefined) {
      // Mask API key in output
      const display = k === 'api_key'
        ? value.slice(0, 6) + '...' + value.slice(-4)
        : value;
      process.stdout.write(`${display}\n`);
    } else {
      process.stderr.write(`[ds-orchestra] ${k} is not set\n`);
    }
  }

  runList(): void {
    const config = this.configFile.list();
    if (Object.keys(config).length === 0) {
      process.stderr.write('[ds-orchestra] No configuration values set.\n');
      process.stderr.write('Use ds-orchestra config set <key> <value> to set values.\n');
      return;
    }

    const maxLen = Math.max(...Object.keys(config).map(k => k.length));
    for (const [key, value] of Object.entries(config)) {
      const display = key === 'api_key'
        ? value.slice(0, 6) + '...' + value.slice(-4)
        : value;
      process.stdout.write(`${key.padEnd(maxLen + 2)} ${display}\n`);
    }
  }

  runUnset(key: string): void {
    const k = this.validateKey(key);
    const log = (msg: string) => process.stderr.write(`[ds-orchestra] ${msg}\n`);
    this.configFile.unset(k);
    log(`Unset ${k}`);
  }
}
