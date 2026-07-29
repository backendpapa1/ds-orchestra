import { readFile } from 'node:fs/promises';
import type { TaskContract } from '../../../shared/contracts/task-contract.js';
import type { SandboxService } from '../../sandbox/sandbox.service.js';
import { TripwireError } from '../../../shared/utils/tripwire-error.js';

export async function handleReadFile(
  args: { path: string },
  contract: TaskContract,
  sandbox: SandboxService,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    // Check neverTouch before reading — prevent reading secrets and test files
    sandbox.checkRead(contract, args.path);
    const absPath = sandbox.resolveWithin(contract.workdir, args.path);
    const content = await readFile(absPath, 'utf-8');
    return {
      content: [{ type: 'text', text: content }],
    };
  } catch (e) {
    if (e instanceof TripwireError) throw e;
    return {
      content: [{ type: 'text', text: `ERROR reading ${args.path}: ${(e as Error).message}` }],
    };
  }
}
