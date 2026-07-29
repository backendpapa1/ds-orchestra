import { Module } from '@nestjs/common';
import { DeepSeekClient } from './deepseek-client.service.js';

@Module({
  providers: [DeepSeekClient],
  exports: [DeepSeekClient],
})
export class DeepSeekModule {}
