import { Injectable } from '@nestjs/common';
import { Command } from 'commander';

@Injectable()
export class CliService {
  readonly program: Command;

  constructor() {
    this.program = new Command();
    this.program
      .name('ds-orchestra')
      .description('Delegate implementation work to DeepSeek workers under enforced constraints')
      .version('0.1.0');
  }

  async run(argv: string[]): Promise<void> {
    await this.program.parseAsync(argv);
  }
}
