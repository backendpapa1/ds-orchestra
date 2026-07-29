import { z } from 'zod';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Legacy model IDs that were permanently retired on 2026-07-24.
 * Must be rejected at config validation with a clear error message.
 */
const LEGACY_MODELS = ['deepseek-chat', 'deepseek-reasoner'] as const;

/** Allowed model IDs — must be current V4 models. */
const ALLOWED_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const;

export const configSchema = z.object({
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY is required'),

  DEEPSEEK_MODEL: z
    .string()
    .default('deepseek-v4-flash')
    .refine(
      (val) => {
        if (LEGACY_MODELS.includes(val as (typeof LEGACY_MODELS)[number])) {
          return false;
        }
        return ALLOWED_MODELS.includes(val as (typeof ALLOWED_MODELS)[number]);
      },
      (val) => {
        if (LEGACY_MODELS.includes(val as (typeof LEGACY_MODELS)[number])) {
          return {
            message: `Model '${val}' was retired on 2026-07-24. Use 'deepseek-v4-flash' or 'deepseek-v4-pro' instead.`,
          };
        }
        return {
          message: `Unknown model '${val}'. Use 'deepseek-v4-flash' or 'deepseek-v4-pro'.`,
        };
      },
    ),

  DS_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5),

  DS_STATE_DIR: z
    .string()
    .default(join(homedir(), '.ds-orchestra')),

  DS_WORKER_THINKING: z.coerce
    .boolean()
    .default(false),
});

export type ValidatedConfig = z.infer<typeof configSchema>;
