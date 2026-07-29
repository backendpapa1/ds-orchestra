import { Module } from '@nestjs/common';
import { WorktreeService } from './worktree.service.js';
import { GitExecutor } from './git-executor.js';

@Module({
  providers: [GitExecutor, WorktreeService],
  exports: [WorktreeService],
})
export class WorktreeModule {}
