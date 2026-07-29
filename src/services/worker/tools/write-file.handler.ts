import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { TaskContract } from '../../../shared/contracts/task-contract.js';
import type { SandboxService } from '../../sandbox/sandbox.service.js';
import { TripwireError } from '../../../shared/utils/tripwire-error.js';

export interface WriteFileState {
  filesTouched: Set<string>;
  onWrite: (path: string, bytes: number) => void;
}

export async function handleWriteFile(
  args: { path: string; content: string },
  contract: TaskContract,
  sandbox: SandboxService,
  state: WriteFileState,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    // This throws TripwireError if the write violates the contract
    sandbox.checkWrite(contract, args.path, state.filesTouched.size);

    const absPath = sandbox.resolveWithin(contract.workdir, args.path);

    // Create parent directories if needed
    await mkdir(dirname(absPath), { recursive: true });

    // Write the file
    await writeFile(absPath, args.content, 'utf-8');

    // Track the write
    state.filesTouched.add(args.path);
    state.onWrite(args.path, Buffer.byteLength(args.content, 'utf-8'));

    return {
      content: [
        {
          type: 'text',
          text: `Wrote ${args.path} (${args.content.length} chars)`,
        },
      ],
    };
  } catch (e) {
    if (e instanceof TripwireError) throw e;
    return {
      content: [{ type: 'text', text: `ERROR writing ${args.path}: ${(e as Error).message}` }],
    };
  }
}
