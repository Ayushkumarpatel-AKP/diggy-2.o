/**
 * The **user-initiated** submit path.
 *
 * `controls.ts` classifies anything that would submit as the policy's
 * `submit` tool and the act layer then refuses to execute it — *the user presses
 * it*. This module is the other half of that rule: it lets the **host** press the
 * control on the user's behalf, but only from a path the agent loop cannot reach.
 *
 * It is deliberately:
 * - **not registered as a tool** — `tool-adapter.ts` never exports it, so the
 *   model has no vocabulary for submission;
 * - **not part of the message host's method list** — the extension calls it from
 *   its own `diggy:submit` handler, which only fires on a real user gesture in
 *   the bubble.
 *
 * So the invariant is intact: a submit happens because a person pressed a thing,
 * never because a model asked for it.
 */
import { isSubmitControl } from './controls.js';
import { descriptiveText, isHtmlElement } from './dom.js';

/** The control that would submit, plus the label we show the user. */
export interface SubmitControl {
  element: HTMLElement;
  label: string;
}

/** Controls that could be the submitter, in document order. */
const CANDIDATE_SELECTOR = [
  'button',
  'input[type="submit"]',
  'input[type="image"]',
  'input[type="button"]',
  '[role="button"]',
].join(', ');

function isUsable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hasAttribute('hidden')) return false;
  return true;
}

function labelFor(el: HTMLElement): string {
  const text = descriptiveText(el).trim();
  if (text !== '') return text;
  const value = el.getAttribute('value');
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return el.tagName.toLowerCase();
}

/**
 * Find the control that would submit the page (or the form around `scope`).
 *
 * Prefers a control the act layer itself would refuse (`isSubmitControl`), and
 * falls back to nothing rather than guessing — so a page with no submitter
 * reports honestly instead of clicking something arbitrary.
 */
export function findSubmitControl(scope: ParentNode = document): SubmitControl | null {
  let candidates: HTMLElement[];
  try {
    candidates = Array.from(scope.querySelectorAll(CANDIDATE_SELECTOR)).filter(
      (node): node is HTMLElement => isHtmlElement(node) && isUsable(node),
    );
  } catch {
    return null;
  }

  for (const element of candidates) {
    if (isSubmitControl(element)) return { element, label: labelFor(element) };
  }
  return null;
}

/**
 * Press the submit control. Only call this from a user-gesture handler.
 *
 * Returns a plain result rather than throwing, so the caller can report the
 * outcome in the bubble either way.
 */
export function performUserSubmit(
  control: SubmitControl | HTMLElement,
): { ok: boolean; label: string; error?: string } {
  const element = isHtmlElement(control) ? control : control.element;
  const label = labelFor(element);

  if (!element.isConnected) {
    return { ok: false, label, error: 'That button is no longer on the page.' };
  }
  if (!isUsable(element)) {
    return { ok: false, label, error: `"${label}" is disabled.` };
  }

  try {
    element.click();
    return { ok: true, label };
  } catch (error) {
    return {
      ok: false,
      label,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
