import { Global, Module } from '@nestjs/common';
import { StderrLogger } from './stderr-logger.service.js';

@Global()
@Module({
  providers: [StderrLogger],
  exports: [StderrLogger],
})
export class LoggerModule {}
