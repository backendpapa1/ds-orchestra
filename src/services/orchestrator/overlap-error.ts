/**
 * OverlapError — returned when two tasks' mayEdit globs intersect.
 * Machine-readable so Claude can sequence tasks instead of failing.
 */
export class OverlapError extends Error {
  constructor(
    message: string,
    public readonly conflictTaskId: string,
    public readonly intersectingGlobs: string[],
  ) {
    super(message);
    this.name = 'OverlapError';
  }
}
