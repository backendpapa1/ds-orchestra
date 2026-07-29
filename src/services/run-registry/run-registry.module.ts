import { Module } from '@nestjs/common';
import { RunRegistry } from './run-registry.service.js';
import { EventLogService } from './event-log.service.js';

@Module({
  providers: [RunRegistry, EventLogService],
  exports: [RunRegistry, EventLogService],
})
export class RunRegistryModule {}
