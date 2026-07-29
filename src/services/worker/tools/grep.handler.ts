import { execa } from 'execa';
import type { TaskContract } from '../../../shared/contracts/task-contract.js';
import type { SandboxService } from '../../sandbox/sandbox.service.js';
import { TripwireError } from '../../../shared/utils/tripwire-error.js';
import { truncate } from '../../../shared/utils/truncator.js';

export async function handleGrep(
  args: { pattern: string; path: string },
  contract: TaskContract,
  sandbox: SandboxService,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const absPath = sandbox.resolveWithin(contract.workdir, args.path);

    // Try ripgrep first, fall back to grep -r
    let result;
    try {
      result = await execa('rg', ['--line-number', '--no-heading', args.pattern, absPath], {
        timeout: 15_000,
        reject: false,
      });
    } catch {
      result = await execa('grep', ['-rn', args.pattern, absPath], {
        timeout: 15_000,
        reject: false,
      });
    }

    const output =
      typeof result.stdout === 'string' ? result.stdout : '';
    return {
      content: [
        {
          type: 'text',
          text: output.trim()
            ? truncate(output, 20_000)
            : `No matches for "${args.pattern}" in ${args.path}`,
        },
      ],
    };
  } catch (e) {
    if (e instanceof TripwireError) throw e;
    return {
      content: [{ type: 'text', text: `ERROR searching: ${(e as Error).message}` }],
    };
  }
}
