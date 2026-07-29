import { Injectable } from '@nestjs/common';
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ConfigService } from '../../config/config.service.js';
import type { LogEvent } from '../../shared/contracts/log-event.js';

/**
 * Append-only JSONL event log writer.
 * Each task gets its own log file: ~/.ds-orchestra/<taskId>.jsonl
 *
 * Events are written synchronously to avoid out-of-order writes
 * in the async agent loop.
 */
@Injectable()
export class EventLogService {
  constructor(private readonly config: ConfigService) {}

  /** Write one event line to the task's JSONL log. */
  append(taskId: string, event: LogEvent): void {
    const path = this.getPath(taskId);
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(path, JSON.stringify(event) + '\n', 'utf-8');
  }

  /** Read the last n events (or all if n is omitted). */
  tail(taskId: string, n?: number): LogEvent[] {
    const path = this.getPath(taskId);
    if (!existsSync(path)) return [];

    const content = readFileSync(path, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    if (n && n < lines.length) {
      return lines.slice(-n).map((l) => JSON.parse(l) as LogEvent);
    }

    return lines.map((l) => JSON.parse(l) as LogEvent);
  }

  /** Get the path to the task's event log file. */
  getPath(taskId: string): string {
    return join(this.config.stateDir, `${taskId}.jsonl`);
  }
}
