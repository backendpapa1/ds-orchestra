import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { ConfigFileService } from './config-file.service.js';

/**
 * Global configuration module.
 * Validates env vars + config file at bootstrap. Fails fast if invalid.
 */
@Global()
@Module({
  providers: [ConfigFileService, ConfigService],
  exports: [ConfigService, ConfigFileService],
})
export class ConfigModule {}
