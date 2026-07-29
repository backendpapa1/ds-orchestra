import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service.js';
import { WaveScheduler } from './wave-scheduler.service.js';
import { WorktreeModule } from '../worktree/worktree.module.js';
import { SandboxModule } from '../sandbox/sandbox.module.js';
import { WorkerModule } from '../worker/worker.module.js';
import { RunRegistryModule } from '../run-registry/run-registry.module.js';

@Module({
  imports: [WorktreeModule, SandboxModule, WorkerModule, RunRegistryModule],
  providers: [WaveScheduler, OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
