import { Injectable } from '@nestjs/common';
import type { ValidatedConfig } from './config.schema.js';
import { configSchema } from './config.schema.js';
import { ConfigFileService } from './config-file.service.js';

/**
 * Typed access to validated configuration.
 *
 * Precedence (highest to lowest):
 * 1. Environment variables (DEEPSEEK_API_KEY, DEEPSEEK_MODEL, etc.)
 * 2. Config file (~/.ds-orchestra/config.yaml) — set via `ds-orchestra config set`
 * 3. Built-in defaults (model: deepseek-v4-flash, concurrency: 5, etc.)
 *
 * Fails fast at bootstrap if no API key is found in any source.
 */
@Injectable()
export class ConfigService {
  readonly config: ValidatedConfig;

  constructor(configFile: ConfigFileService) {
    // Read from config file first (lower precedence)
    const fileConfig = configFile.read();

    // Helper: env var wins if set and non-empty, otherwise config file, otherwise undefined
    const env = (key: string) => process.env[key]?.trim() || undefined;

    const raw = {
      DEEPSEEK_API_KEY: env('DEEPSEEK_API_KEY') ?? fileConfig.api_key ?? undefined,
      DEEPSEEK_MODEL: env('DEEPSEEK_MODEL') ?? fileConfig.model ?? undefined,
      DS_MAX_CONCURRENT: env('DS_MAX_CONCURRENT') ?? (
        fileConfig.max_concurrent !== undefined
          ? String(fileConfig.max_concurrent)
          : undefined
      ),
      DS_STATE_DIR: env('DS_STATE_DIR') ?? fileConfig.state_dir ?? undefined,
      DS_WORKER_THINKING: env('DS_WORKER_THINKING') ?? (
        fileConfig.thinking !== undefined
          ? String(fileConfig.thinking)
          : undefined
      ),
    };

    const result = configSchema.safeParse(raw);

    if (!result.success) {
      const errors = result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      process.stderr.write(`[ds-orchestra] Configuration error:\n${errors}\n`);
      process.stderr.write(
        'Set DEEPSEEK_API_KEY as an environment variable or run:\n' +
          '  ds-orchestra config set api_key sk-your-key-here\n',
      );
      throw new Error(`Configuration validation failed:\n${errors}`);
    }

    this.config = result.data;
  }

  /** DeepSeek API key (required). */
  get deepseekApiKey(): string {
    return this.config.DEEPSEEK_API_KEY;
  }

  /** DeepSeek model ID (default: deepseek-v4-flash). */
  get deepseekModel(): string {
    return this.config.DEEPSEEK_MODEL;
  }

  /** Maximum concurrent worker tasks (default: 5). */
  get maxConcurrent(): number {
    return this.config.DS_MAX_CONCURRENT;
  }

  /** State directory for worktrees and event logs (default: ~/.ds-orchestra). */
  get stateDir(): string {
    return this.config.DS_STATE_DIR;
  }

  /** Whether thinking mode is enabled for workers (default: false). */
  get workerThinking(): boolean {
    return this.config.DS_WORKER_THINKING;
  }
}
