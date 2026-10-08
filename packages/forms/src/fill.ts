/**
 * The fill engine. Writes values the way a real user would — through the native
 * property setter plus bubbling `input`/`change` events, so React/Vue value
 * trackers observe the change — and uploads files through `DataTransfer`.
 *
 * SAFETY INVARIANTS (never relaxed):
 *  - No fill routine ever submits a form: this module contains no `.submit()`,
 *    `requestSubmit()`, or dispatched `submit` event, and it refuses to touch a
 *    submit-capable control.
 *  - Locked fields are resolved one at a time through `VaultAPI.resolveLocal()`,
 *    after per-use approval. A missing/denied resolution leaves the field empty.
 */
import type { VaultAPI } from '@diggy/shared';
import { FIELD_ATTR } from './detect.js';
import type { FieldDescriptor, FieldMatch, FillFieldResult, FillOptions, FillOutcome } from './types.js';

const LOCKED_RE = /^\{\{LOCKED:([^}]+)\}\}$/;

const SUBMIT_TYPES = new Set(['submit', 'reset', 'button', 'image']);

/** True for any control that could trigger a page submission. */
export function isSubmitSurface(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'button') return true;
  if (tag === 'input') return SUBMIT_TYPES.has((el as HTMLInputElement).type);
  return false;
}

function keyFromToken(token: string): string | null {
  const match = LOCKED_RE.exec(token);
  return match ? (match[1] as string) : null;
}

/** Dispatch a bubbling synthetic event from the element's own realm. */
function dispatch(el: HTMLElement, type: string): void {
  const view = el.ownerDocument?.defaultView as (Window & { Event?: typeof Event }) | null;
  const Ctor = view?.Event ?? (globalThis as { Event?: typeof Event }).Event;
  if (!Ctor) return;
  el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true }));
}

/** Set a field's value the way a real user would (native setter + events). */
export function setFieldValue(el: HTMLElement, value: string): boolean {
  const tag = el.tagName.toLowerCase();

  if (tag === 'select') {
    const select = el as HTMLSelectElement;
    const byValue = Array.from(select.options).find((option) => option.value === value);
    const byText = Array.from(select.options).find((option) => (option.textContent ?? '').trim() === value);
    const target = byValue ?? byText;
    if (!target) return false;
    select.value = target.value;
    dispatch(el, 'input');
    dispatch(el, 'change');
    return true;
  }

  if (tag === 'input' || tag === 'textarea') {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    if (setter) {
      try {
        setter.call(el, value);
      } catch {
        (el as HTMLInputElement).value = value;
      }
    } else {
      (el as HTMLInputElement).value = value;
    }
    dispatch(el, 'input');
    dispatch(el, 'change');
    return true;
  }

  if (el.isContentEditable) {
    el.textContent = value;
    dispatch(el, 'input');
    return true;
  }

  return false;
}

/** Attach a file (from a data URL) via `DataTransfer`. Returns false when unsupported. */
export function setFileValue(el: HTMLElement, value: string): boolean {
  const view = el.ownerDocument?.defaultView as (Window & { DataTransfer?: typeof DataTransfer; File?: typeof File }) | null;
  const DataTransferCtor = view?.DataTransfer ?? (globalThis as { DataTransfer?: typeof DataTransfer }).DataTransfer;
  const FileCtor = view?.File ?? (globalThis as { File?: typeof File }).File;
  if (!DataTransferCtor || !FileCtor) return false;

  const match = /^data:([^;]+);base64,(.*)$/.exec(value);
  if (!match) return false;
  const mime = match[1] as string;
  const bytes = Uint8Array.from(atob(match[2] as string), (char) => char.charCodeAt(0));
  const file = new FileCtor([bytes], 'resume', { type: mime });
  const transfer = new DataTransferCtor();
  transfer.items.add(file);
  (el as HTMLInputElement).files = transfer.files;
  dispatch(el, 'input');
  dispatch(el, 'change');
  return true;
}

function resolveElement(field: FieldDescriptor, root?: ParentNode): HTMLElement | null {
  if (field.element) return field.element;
  const scope = root ?? (typeof document === 'undefined' ? undefined : document);
  if (!scope) return null;
  return scope.querySelector<HTMLElement>(`[${FIELD_ATTR}="${field.id}"]`);
}

function skippedResult(match: FieldMatch, reason: string): FillFieldResult {
  return {
    fieldId: match.field.id,
    kind: match.instruction?.kind ?? match.classification.kind,
    value: '',
    locked: match.instruction?.locked ?? false,
    filled: false,
    skippedReason: reason,
  };
}

/**
 * Fill the matched fields.
 *
 * `dryRun: true` computes the outcome without touching the DOM and without
 * releasing any locked value — a locked field counts as filled with its token.
 * In a real run, a locked field is written only after `vault.resolveLocal()`
 * returns an approved plaintext.
 */
export async function fillForm(matches: FieldMatch[], options: FillOptions = {}): Promise<FillOutcome> {
  const dryRun = options.dryRun === true;
  const results: FillFieldResult[] = [];

  for (const match of matches) {
    const { instruction } = match;

    if (!instruction) {
      results.push(skippedResult(match, 'needs-answer'));
      continue;
    }

    if (dryRun) {
      results.push({
        fieldId: match.field.id,
        kind: instruction.kind,
        value: instruction.value,
        locked: instruction.locked,
        filled: true,
      });
      continue;
    }

    const element = resolveElement(match.field, options.root);
    if (!element) {
      results.push(skippedResult(match, 'element-not-found'));
      continue;
    }
    if (isSubmitSurface(element)) {
      results.push(skippedResult(match, 'submit-surface'));
      continue;
    }

    let value = instruction.value;
    if (instruction.locked) {
      const key = instruction.profileKey ?? keyFromToken(instruction.value);
      const resolved = options.vault && key ? await resolveLocked(options.vault, key) : null;
      if (resolved === null) {
        results.push(skippedResult(match, 'locked-not-approved'));
        continue;
      }
      value = resolved;
    }

    const isFile = (element as HTMLInputElement).type === 'file';
    const ok = isFile ? setFileValue(element, value) : setFieldValue(element, value);

    results.push({
      fieldId: match.field.id,
      kind: instruction.kind,
      value: instruction.locked ? instruction.value : value,
      locked: instruction.locked,
      filled: ok,
      skippedReason: ok ? undefined : 'not-writable',
    });
  }

  const filled = results.filter((result) => result.filled).length;
  const total = matches.length;
  return {
    filled,
    skipped: total - filled,
    total,
    ratio: total === 0 ? 0 : filled / total,
    results,
    submitted: false,
  };
}

async function resolveLocked(vault: VaultAPI, key: string): Promise<string | null> {
  try {
    return await vault.resolveLocal(key);
  } catch {
    return null;
  }
}

/** Convenience: a dry run that never writes and never releases a locked value. */
export function dryRun(matches: FieldMatch[], options: Omit<FillOptions, 'dryRun'> = {}): Promise<FillOutcome> {
  return fillForm(matches, { ...options, dryRun: true });
}
