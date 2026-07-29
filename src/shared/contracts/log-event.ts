import type { TaskContract } from './task-contract.js';

/**
 * Discriminated union of JSONL log event types.
 * `t` = seconds since run start.
 */

export type LogEvent =
  | StartEvent
  | StepEvent
  | WriteEvent
  | BashEvent
  | TripwireEvent
  | SubmitEvent
  | VerifyEvent;

export interface StartEvent {
  t: number;
  kind: 'start';
  contract: TaskContract;
}

export interface StepEvent {
  t: number;
  kind: 'step';
  n: number;
  tokens: { in: number; out: number };
}

export interface WriteEvent {
  t: number;
  kind: 'write';
  path: string;
  bytes: number;
}

export interface BashEvent {
  t: number;
  kind: 'bash';
  cmd: string;
  exitCode: number;
  stdoutTruncated?: string;
}

export interface TripwireEvent {
  t: number;
  kind: 'tripwire';
  reason: string;
}

export interface SubmitEvent {
  t: number;
  kind: 'submit';
  summary: string;
}

export interface VerifyEvent {
  t: number;
  kind: 'verify';
  exitCode: number;
  testsDirty: string[];
}
