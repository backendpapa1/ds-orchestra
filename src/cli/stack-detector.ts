import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface StackInfo {
  stack: string;
  bashAllow: string[];
  acceptanceCmd: string;
}

/**
 * Detect the project stack by looking for known config files.
 * Returns the first match, or a generic default.
 */
export function detectStack(repo: string): StackInfo {
  const checks: Array<{ file: string; info: StackInfo }> = [
    {
      file: 'package.json',
      info: {
        stack: 'node',
        bashAllow: ['npm', 'npx', 'node', 'tsc', 'jest', 'vitest', 'eslint', 'ls', 'cat'],
        acceptanceCmd: 'npm test',
      },
    },
    {
      file: 'pyproject.toml',
      info: {
        stack: 'python',
        bashAllow: ['python', 'python3', 'pytest', 'pip', 'mypy', 'ruff', 'black'],
        acceptanceCmd: 'pytest',
      },
    },
    {
      file: 'go.mod',
      info: {
        stack: 'go',
        bashAllow: ['go', 'gofmt', 'golangci-lint', 'goimports'],
        acceptanceCmd: 'go test ./...',
      },
    },
    {
      file: 'Cargo.toml',
      info: {
        stack: 'rust',
        bashAllow: ['cargo', 'rustc', 'rustfmt', 'clippy', 'rust-analyzer'],
        acceptanceCmd: 'cargo test',
      },
    },
  ];

  for (const { file, info } of checks) {
    if (existsSync(join(repo, file))) {
      return info;
    }
  }

  // Generic default
  return {
    stack: 'generic',
    bashAllow: ['npm', 'npx', 'node', 'python', 'python3', 'make', 'ls', 'cat'],
    acceptanceCmd: 'make test',
  };
}
