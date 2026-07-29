import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service.js';
import { DeepSeekModule } from './deepseek.module.js';
import { SandboxModule } from '../sandbox/sandbox.module.js';
import { RunRegistryModule } from '../run-registry/run-registry.module.js';

@Module({
  imports: [DeepSeekModule, SandboxModule, RunRegistryModule],
  providers: [WorkerService],
  exports: [WorkerService],
})
export class WorkerModule {}
