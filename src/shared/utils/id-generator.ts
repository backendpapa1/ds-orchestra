import { randomBytes } from 'node:crypto';

/** Generate an 8-character hex task ID. */
export function generateTaskId(): string {
  return randomBytes(4).toString('hex');
}
