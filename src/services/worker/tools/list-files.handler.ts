import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskContract } from '../../../shared/contracts/task-contract.js';
import type { SandboxService } from '../../sandbox/sandbox.service.js';
import { TripwireError } from '../../../shared/utils/tripwire-error.js';

export async function handleListFiles(
  args: { path: string; pattern?: string },
  contract: TaskContract,
  sandbox: SandboxService,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const absPath = sandbox.resolveWithin(contract.workdir, args.path);

    const walk = async (dir: string, prefix: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const results: string[] = [];

      for (const entry of entries) {
        // Skip hidden files and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

        const fullPath = join(dir, entry.name);
        const relPath = join(prefix, entry.name);

        if (entry.isDirectory()) {
          results.push(`${relPath}/`);
          results.push(...(await walk(fullPath, relPath)));
        } else if (entry.isFile()) {
          try {
            const s = await stat(fullPath);
            results.push(`${relPath} (${s.size} bytes)`);
          } catch {
            results.push(relPath);
          }
        }
      }
      return results;
    };

    const listing = await walk(absPath, '');
    return {
      content: [
        {
          type: 'text',
          text: listing.length > 0 ? listing.join('\n') : `Directory ${args.path} is empty`,
        },
      ],
    };
  } catch (e) {
    if (e instanceof TripwireError) throw e;
    return {
      content: [{ type: 'text', text: `ERROR listing ${args.path}: ${(e as Error).message}` }],
    };
  }
}
