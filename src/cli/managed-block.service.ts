import { Injectable } from '@nestjs/common';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * ManagedBlockService — reads, writes, and removes managed blocks in files.
 *
 * A managed block is delimited by markers:
 *   <!-- DS-ORCHESTRA:START -->
 *   ... block content ...
 *   <!-- DS-ORCHESTRA:END -->
 *
 * Everything between the markers is owned by the tool and replaced
 * wholesale on update. Everything outside is never touched.
 *
 * PRD §12.2: The managed block is a load-bearing design decision.
 * It inlines delegation rules directly in CLAUDE.md so they're always
 * in context — not just a pointer that fires too late.
 */
@Injectable()
export class ManagedBlockService {
  static readonly START_MARKER = '<!-- DS-ORCHESTRA:START -->';
  static readonly END_MARKER = '<!-- DS-ORCHESTRA:END -->';

  /**
   * Inject or update the managed block in a file.
   *
   * Cases:
   * - File doesn't exist → create with block
   * - No markers found → append block at end
   * - Both markers present (START before END) → replace content between
   * - Only one marker → THROW (malformed)
   * - END before START → THROW (malformed)
   *
   * @param dryRun — if true, don't write to disk
   * @returns whether the file was modified
   */
  upsert(filePath: string, blockContent: string, dryRun = false): { modified: boolean; path: string } {
    const existing = existsSync(filePath)
      ? readFileSync(filePath, 'utf-8')
      : '';

    const content = existing;
    const startIdx = content.indexOf(ManagedBlockService.START_MARKER);
    const endIdx = content.indexOf(ManagedBlockService.END_MARKER);

    const hasStart = startIdx !== -1;
    const hasEnd = endIdx !== -1;

    // Malformed: only one marker
    if (hasStart && !hasEnd) {
      throw new Error(
        `Malformed markers in ${filePath}: found START without END. Aborting to avoid data loss.`,
      );
    }
    if (!hasStart && hasEnd) {
      throw new Error(
        `Malformed markers in ${filePath}: found END without START. Aborting to avoid data loss.`,
      );
    }

    // Malformed: END before START
    if (hasStart && hasEnd && endIdx < startIdx) {
      throw new Error(
        `Malformed markers in ${filePath}: END marker appears before START marker. Aborting to avoid data loss.`,
      );
    }

    let newContent: string;
    let modified = false;

    if (hasStart && hasEnd) {
      // Both markers present — replace content between them
      const before = content.slice(0, startIdx + ManagedBlockService.START_MARKER.length);
      const after = content.slice(endIdx);
      const existingBlock = content.slice(
        startIdx + ManagedBlockService.START_MARKER.length,
        endIdx,
      );

      if (existingBlock.trim() === blockContent.trim()) {
        // Content unchanged — no modification needed
        return { modified: false, path: filePath };
      }

      newContent = before + '\n' + blockContent + '\n' + after;
      modified = true;
    } else {
      // No markers — append block at end
      const separator = content.endsWith('\n') ? '\n' : '\n\n';
      newContent = content + separator + ManagedBlockService.START_MARKER + '\n' + blockContent + '\n' + ManagedBlockService.END_MARKER + '\n';
      modified = true;
    }

    if (!dryRun) {
      writeFileSync(filePath, newContent, 'utf-8');
    }

    return { modified, path: filePath };
  }

  /**
   * Remove the managed block and marker lines.
   * Surrounding content is preserved byte-identical.
   */
  remove(filePath: string, dryRun = false): { modified: boolean; path: string } {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const startIdx = content.indexOf(ManagedBlockService.START_MARKER);
    const endIdx = content.indexOf(ManagedBlockService.END_MARKER);

    if (startIdx === -1 && endIdx === -1) {
      return { modified: false, path: filePath };
    }

    if ((startIdx !== -1 && endIdx === -1) || (startIdx === -1 && endIdx !== -1)) {
      throw new Error(`Malformed markers in ${filePath}: cannot safely remove.`);
    }

    // Remove from START to END inclusive
    const before = content.slice(0, startIdx);
    let after = content.slice(endIdx + ManagedBlockService.END_MARKER.length);

    // Clean up exactly one leading newline if present
    if (after.startsWith('\n')) {
      after = after.slice(1);
    }
    // Clean up trailing newline from before: strip one newline before START
    const cleanBefore = before.endsWith('\n') ? before.slice(0, -1) : before;
    // Reconstruct: separator only if both sides have content
    const separator = cleanBefore.trim() && after.trim() ? '\n' : '';
    const newContent = cleanBefore + separator + (after.trim() ? after : '');

    if (!dryRun) {
      writeFileSync(filePath, newContent || '', 'utf-8');
    }

    return { modified: true, path: filePath };
  }

  /**
   * Read the content between markers (if any).
   * Returns null if no markers found.
   */
  read(filePath: string): string | null {
    if (!existsSync(filePath)) return null;

    const content = readFileSync(filePath, 'utf-8');
    const startIdx = content.indexOf(ManagedBlockService.START_MARKER);
    const endIdx = content.indexOf(ManagedBlockService.END_MARKER);

    if (startIdx === -1 || endIdx === -1) return null;

    return content.slice(
      startIdx + ManagedBlockService.START_MARKER.length,
      endIdx,
    );
  }
}
