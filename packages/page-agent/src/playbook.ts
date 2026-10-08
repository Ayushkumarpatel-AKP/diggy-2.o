/**
 * Saved playbooks — the webbrain `/teach` idea: record a successful run into a
 * reusable workflow.
 *
 * A recorded playbook is **value-free**: literal user data never lands in it.
 * Typed text, field values, URLs and query strings are replaced by `{{…}}`
 * placeholders, page-specific refs are dropped, and any registered vault value
 * is scrubbed. What remains is a template of *actions* — the shape of the
 * workflow — that the user (or the agent) can replay on a page with the same
 * controls.
 *
 * The recorder only keeps actions that succeeded, so a playbook describes what
 * worked, not what was attempted.
 */
import { containsVaultValue, VAULT_SENTINEL } from '@diggy/policy';
import type { ActionResult } from '@diggy/shared';

/** One step of a saved workflow (already value-free). */
export interface PlaybookStep {
  tool: string;
  args: Record<string, unknown>;
  description?: string;
}

/** A reusable, value-free workflow. */
export interface Playbook {
  id: string;
  name: string;
  goal: string;
  steps: PlaybookStep[];
  createdAt: number;
  updatedAt: number;
  /** How many times this playbook has been replayed. */
  runs: number;
}

/** Keys whose values are user data and must be replaced by a placeholder. */
const VALUE_KEYS: ReadonlySet<string> = new Set([
  'text',
  'value',
  'password',
  'passwd',
  'secret',
  'token',
  'content',
  'body',
  'input',
  'data',
  'url',
  'href',
  'query',
]);

function placeholder(key: string): string {
  return `{{${key}}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Replace any registered vault value inside a plain string. */
function scrubString(value: string, key: string): string {
  if (containsVaultValue(value)) return placeholder(key);
  return value.includes(VAULT_SENTINEL) ? placeholder(key) : value;
}

function scrubValue(value: unknown, key: string): unknown {
  if (typeof value === 'string') return scrubString(value, key);
  if (Array.isArray(value)) return value.map((item, index) => scrubValue(item, `${key}[${index}]`));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) out[childKey] = scrubValue(child, childKey);
    return out;
  }
  return value;
}

/**
 * Strip literal user data out of an action's arguments, leaving `{{…}}`
 * placeholders. Never throws; a non-object becomes `{}`.
 */
export function valueFreeArgs(args: unknown): Record<string, unknown> {
  if (!isRecord(args)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    // A page-specific handle is meaningless on replay.
    if (key === 'ref') continue;

    if (key === 'fields' && isRecord(value)) {
      const fields: Record<string, string> = {};
      for (const fieldKey of Object.keys(value)) fields[fieldKey] = placeholder(fieldKey);
      out[key] = fields;
      continue;
    }

    if (VALUE_KEYS.has(key.toLowerCase())) {
      out[key] = placeholder(key);
      continue;
    }

    out[key] = scrubValue(value, key);
  }
  return out;
}

let idCounter = 0;

function makeId(prefix: string): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${random}`;
}

/**
 * Records successful actions as they run, then freezes them into a
 * {@link Playbook}. Call {@link record} only for actions that returned `ok`.
 */
export class PlaybookRecorder {
  private steps: PlaybookStep[] = [];
  private active = true;

  /** Begin (or resume) recording. */
  start(): void {
    this.active = true;
  }

  /** Pause recording without discarding what was captured. */
  stop(): void {
    this.active = false;
  }

  /** Is the recorder capturing? */
  isRecording(): boolean {
    return this.active;
  }

  /**
   * Capture one action. Ignored while paused, and ignored when `result` is
   * explicitly `ok: false` (a failed action is not part of the workflow).
   */
  record(tool: string, args: unknown, result?: Pick<ActionResult, 'ok'>): void {
    if (!this.active) return;
    if (result && result.ok === false) return;
    this.steps.push({ tool, args: valueFreeArgs(args) });
  }

  /** How many steps have been captured. */
  size(): number {
    return this.steps.length;
  }

  /** Forget every captured step. */
  clear(): void {
    this.steps = [];
  }

  /** Freeze the captured steps into a named, value-free playbook. */
  toPlaybook(name: string, goal = ''): Playbook {
    const at = Date.now();
    return {
      id: makeId('playbook'),
      name: typeof name === 'string' && name.trim() !== '' ? name.trim() : 'Untitled workflow',
      goal: typeof goal === 'string' ? goal : '',
      steps: this.steps.map((step) => ({ ...step, args: valueFreeArgs(step.args) })),
      createdAt: at,
      updatedAt: at,
      runs: 0,
    };
  }
}

/** Re-scrub an existing playbook (defence in depth before persisting/sharing). */
export function toValueFreePlaybook(playbook: Playbook): Playbook {
  return {
    ...playbook,
    steps: playbook.steps.map((step) => ({ ...step, args: valueFreeArgs(step.args) })),
  };
}

/**
 * Replay a saved workflow through `run` (typically `registry.invoke`). Returns
 * one {@link ActionResult} per step, in order; stops is the caller's choice (the
 * runner can throw or return `ok: false`).
 */
export async function replayPlaybook(
  playbook: Playbook,
  run: (step: PlaybookStep, index: number) => Promise<ActionResult>,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (let index = 0; index < playbook.steps.length; index += 1) {
    const step = playbook.steps[index];
    if (!step) continue;
    results.push(await run(step, index));
  }
  return results;
}
