import { Injectable, LoggerService } from '@nestjs/common';

/**
 * Custom NestJS logger that routes ALL output to stderr.
 *
 * stdout is reserved for the MCP JSON-RPC protocol channel.
 * A single console.log in src/ breaks the handshake with no useful error.
 * This logger enforces that separation at the infrastructure level.
 */
@Injectable()
export class StderrLogger implements LoggerService {
  private context?: string;

  setContext(context: string): void {
    this.context = context;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('LOG', message, ...optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('ERROR', message, ...optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('WARN', message, ...optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('DEBUG', message, ...optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('VERBOSE', message, ...optionalParams);
  }

  private write(level: string, message: unknown, ...rest: unknown[]): void {
    const ts = new Date().toISOString();
    const ctx = this.context ? ` [${this.context}]` : '';
    const extra = rest.length > 0 ? ` ${rest.join(' ')}` : '';
    process.stderr.write(`[${ts}] ${level}${ctx} ${String(message)}${extra}\n`);
  }
}
