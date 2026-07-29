import { execa } from 'execa';
import type { TaskContract } from '../../../shared/contracts/task-contract.js';
import type { SandboxService } from '../../sandbox/sandbox.service.js';
import { TripwireError } from '../../../shared/utils/tripwire-error.js';
import { truncate } from '../../../shared/utils/truncator.js';

export interface BashState {
  onCommand: (cmd: string, exitCode: number, stdout: string) => void;
}

export async function handleRunBash(
  args: { command: string },
  contract: TaskContract,
  sandbox: SandboxService,
  state: BashState,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    // This throws TripwireError if the command violates the sandbox
    sandbox.checkBash(contract, args.command);

    // Execute in the worktree
    const result = await execa('bash', ['-c', args.command], {
      cwd: contract.workdir,
      timeout: 60_000,
      reject: false,
    });

    const stdout =
      typeof result.stdout === 'string' ? result.stdout : '';
    const stderr =
      typeof result.stderr === 'string' ? result.stderr : '';

    state.onCommand(args.command, result.exitCode ?? 1, stdout);

    const output = truncate(
      [
        stdout && `stdout:\n${stdout}`,
        stderr && `stderr:\n${stderr}`,
        `exit code: ${result.exitCode ?? 1}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      10_000,
    );

    return {
      content: [{ type: 'text', text: output || '(no output)' }],
    };
  } catch (e) {
    if (e instanceof TripwireError) throw e;
    return {
      content: [
        { type: 'text', text: `ERROR running command: ${(e as Error).message}` },
      ],
    };
  }
}
