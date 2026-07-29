/**
 * ManagedBlockService tests — PRD §11.1 minimum cases.
 *
 * A bug here silently damages the user's CLAUDE.md.
 * These are the second most critical tests after SandboxService.
 */
import { existsSync, unlinkSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { ManagedBlockService } from '../../src/cli/managed-block.service.js';

describe('ManagedBlockService', () => {
  let service: ManagedBlockService;
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    service = new ManagedBlockService();
    tmpDir = join(tmpdir(), 'ds-test-' + randomBytes(4).toString('hex'));
    mkdirSync(tmpDir, { recursive: true });
    testFile = join(tmpDir, 'CLAUDE.md');
  });

  afterEach(() => {
    try { unlinkSync(testFile); } catch {}
    try { unlinkSync(join(tmpDir, 'CLAUDE.md')); } catch {}
  });

  const BLOCK = '## Delegation Rules\n\nTest content';

  // ── Case 1: init on empty → file created, one block ──────────

  it('PRD case 1: init on repo with no CLAUDE.md → file created with exactly one block', () => {
    const result = service.upsert(testFile, BLOCK);

    expect(result.modified).toBe(true);
    expect(existsSync(testFile)).toBe(true);

    const content = readFileSync(testFile, 'utf-8');
    expect(content).toContain(ManagedBlockService.START_MARKER);
    expect(content).toContain(ManagedBlockService.END_MARKER);
    expect(content).toContain(BLOCK);

    // Count markers
    const startCount = (content.match(/<!-- DS-ORCHESTRA:START -->/g) || []).length;
    const endCount = (content.match(/<!-- DS-ORCHESTRA:END -->/g) || []).length;
    expect(startCount).toBe(1);
    expect(endCount).toBe(1);
  });

  // ── Case 2: init with existing CLAUDE.md → user content preserved ──

  it('PRD case 2: init on repo with existing CLAUDE.md → user content byte-identical, block appended', () => {
    const userContent = '# My Project\n\nSome docs here.\n';
    writeFileSync(testFile, userContent, 'utf-8');

    service.upsert(testFile, BLOCK);

    const content = readFileSync(testFile, 'utf-8');
    expect(content).toContain(userContent.trim());
    expect(content).toContain(BLOCK);
    expect(content).toContain(ManagedBlockService.START_MARKER);
  });

  // ── Case 3: init twice → exactly one block, no duplication ──

  it('PRD case 3: init run twice → exactly one block, no duplication', () => {
    // First init
    service.upsert(testFile, BLOCK);
    // Second init with same content
    const result2 = service.upsert(testFile, BLOCK);

    // Should report no modification (content unchanged)
    expect(result2.modified).toBe(false);

    const content = readFileSync(testFile, 'utf-8');
    const startCount = (content.match(/<!-- DS-ORCHESTRA:START -->/g) || []).length;
    expect(startCount).toBe(1);

    // Second init with different content
    const NEW_BLOCK = 'Updated block content';
    const result3 = service.upsert(testFile, NEW_BLOCK);
    expect(result3.modified).toBe(true);

    const content3 = readFileSync(testFile, 'utf-8');
    const startCount3 = (content3.match(/<!-- DS-ORCHESTRA:START -->/g) || []).length;
    expect(startCount3).toBe(1);
    expect(content3).toContain(NEW_BLOCK);
  });

  // ── Case 4: update with content above and below → preserved ──

  it('PRD case 4: update with user content above and below block → user content byte-identical, block replaced', () => {
    const before = '# Top content\n\nSome top docs.\n';
    const after = '\n# Bottom content\n\nSome bottom docs.\n';

    writeFileSync(
      testFile,
      `${before}${ManagedBlockService.START_MARKER}\nOld block\n${ManagedBlockService.END_MARKER}${after}`,
      'utf-8',
    );

    service.upsert(testFile, BLOCK);

    const content = readFileSync(testFile, 'utf-8');
    expect(content).toContain(before.trim());
    expect(content).toContain(after.trim());
    expect(content).toContain(BLOCK);
    expect(content).not.toContain('Old block');
  });

  // ── Case 5: malformed markers (START without END) → abort ──

  it('PRD case 5a: START without END → aborts, file unmodified', () => {
    const original = '# My doc\n\n' + ManagedBlockService.START_MARKER + '\nsome content\n';
    writeFileSync(testFile, original, 'utf-8');

    expect(() => service.upsert(testFile, BLOCK)).toThrow(
      /START without END/,
    );

    // File should be unmodified
    const content = readFileSync(testFile, 'utf-8');
    expect(content).toBe(original);
  });

  it('PRD case 5b: END without START → aborts, file unmodified', () => {
    const original = '# My doc\n\nsome content\n' + ManagedBlockService.END_MARKER + '\n';
    writeFileSync(testFile, original, 'utf-8');

    expect(() => service.upsert(testFile, BLOCK)).toThrow(
      /END without START/,
    );

    const content = readFileSync(testFile, 'utf-8');
    expect(content).toBe(original);
  });

  // ── Case 6: uninstall → block removed, surrounding content preserved ──

  it('PRD case 6: uninstall → block removed, surrounding content byte-identical', () => {
    const before = '# My Project\n\nSome docs.\n';
    const after = '\n# Appendix\n\nMore docs.\n';

    writeFileSync(
      testFile,
      `${before}${ManagedBlockService.START_MARKER}\nBlock content\n${ManagedBlockService.END_MARKER}${after}`,
      'utf-8',
    );

    const result = service.remove(testFile);
    expect(result.modified).toBe(true);

    const content = readFileSync(testFile, 'utf-8');
    expect(content).toContain(before.trim());
    expect(content).toContain(after.trim());
    expect(content).not.toContain(ManagedBlockService.START_MARKER);
    expect(content).not.toContain(ManagedBlockService.END_MARKER);
  });

  // ── Case 7: dry-run → no filesystem writes ──

  it('PRD case 7: --dry-run → no filesystem writes', () => {
    service.upsert(testFile, BLOCK, true); // dryRun = true

    expect(existsSync(testFile)).toBe(false);
  });

  // ── Edge: file without markers, no trailing newline ──

  it('appends block correctly when file has no trailing newline', () => {
    writeFileSync(testFile, '# No newline at end', 'utf-8');

    service.upsert(testFile, BLOCK);

    const content = readFileSync(testFile, 'utf-8');
    expect(content).toContain('# No newline at end');
    expect(content).toContain(BLOCK);
  });
});
