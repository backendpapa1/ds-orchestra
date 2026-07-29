import { Injectable } from '@nestjs/common';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/**
 * Valid config keys that can be set via `ds-orchestra config`.
 */
export type ConfigKey = 'api_key' | 'model' | 'max_concurrent' | 'state_dir' | 'thinking';

export interface DsOrchestraConfig {
  api_key?: string;
  model?: string;
  max_concurrent?: number;
  state_dir?: string;
  thinking?: boolean;
}

/**
 * ConfigFileService — reads and writes the user-global config file.
 *
 * File: ~/.ds-orchestra/config.yaml
 * Env vars take precedence over file values at runtime.
 * The config file provides persistence for credentials and preferences.
 */
@Injectable()
export class ConfigFileService {
  private readonly configDir: string;
  private readonly configPath: string;

  constructor() {
    this.configDir = process.env['DS_STATE_DIR'] ?? join(homedir(), '.ds-orchestra');
    this.configPath = join(this.configDir, 'config.yaml');
  }

  /** Read the full config file. Returns empty object if file doesn't exist. */
  read(): DsOrchestraConfig {
    if (!existsSync(this.configPath)) return {};
    try {
      const raw = readFileSync(this.configPath, 'utf-8');
      const parsed = parseYaml(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};
      return parsed as DsOrchestraConfig;
    } catch {
      return {};
    }
  }

  /** Write the full config file. Creates directory if needed. */
  write(config: DsOrchestraConfig): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
    // Filter out undefined values
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
      if (v !== undefined && v !== null) {
        cleaned[k] = v;
      }
    }
    writeFileSync(this.configPath, stringifyYaml(cleaned) + '\n', 'utf-8');
  }

  /** Get a single config value. Returns undefined if not set. */
  get(key: ConfigKey): string | undefined {
    const config = this.read();
    const value = config[key];
    return value !== undefined ? String(value) : undefined;
  }

  /** Set a single config value and persist. */
  set(key: ConfigKey, value: string): void {
    const config = this.read();
    // Coerce types: boolean for thinking, number for max_concurrent
    if (key === 'thinking') {
      config[key] = value === 'true' || value === '1';
    } else if (key === 'max_concurrent') {
      const n = parseInt(value, 10);
      config[key] = isNaN(n) ? undefined : n;
    } else {
      (config as Record<string, unknown>)[key] = value;
    }
    this.write(config);
  }

  /** Remove a config value and persist. */
  unset(key: ConfigKey): void {
    const config = this.read();
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
      if (k !== key) cleaned[k] = v;
    }
    this.write(cleaned as unknown as DsOrchestraConfig);
  }

  /** List all config values as key=value pairs. */
  list(): Record<string, string> {
    const config = this.read();
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(config)) {
      if (v !== undefined && v !== null) {
        result[k] = String(v);
      }
    }
    return result;
  }
}
