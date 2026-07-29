/**
 * TripwireError — thrown when a worker violates a contract guardrail.
 *
 * Distinct from ordinary tool errors. Tool errors are returned to the worker
 * as tool results so it can recover. Tripwires terminate the run immediately.
 */
export class TripwireError extends Error {
  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'TripwireError';
  }
}
