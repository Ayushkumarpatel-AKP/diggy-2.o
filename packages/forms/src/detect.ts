/**
 * Field detection: turn a live form into a list of {@link FieldDescriptor}s.
 *
 * Deliberately excludes non-text controls (submit/reset/button/hidden/image/
 * checkbox/radio) so nothing in the fill pipeline can ever target a submit
 * surface. Structural checks (tagName) are used instead of `instanceof`, so
 * same-origin iframes and jsdom behave identically.
 */
import type { FieldDescriptor } from './types.js';

/** Attribute stamped on a detected control so its id stays stable across scans. */
export const FIELD_ATTR = 'data-diggy-field';

const FIELD_SELECTOR =
  'input:not([type="hidden"]), textarea, select, [contenteditable="true"], [contenteditable=""]';

const EXCLUDED_INPUT_TYPES = new Set(['hidden', 'submit', 'reset', 'button', 'image', 'checkbox', 'radio']);

let counter = 0;

function tagOf(el: Element): string {
  return el.tagName.toLowerCase();
}

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function isHidden(el: HTMLElement): boolean {
  if (el.hidden) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.style && el.style.display === 'none') return true;
  if (el.style && el.style.visibility === 'hidden') return true;
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    if (parent.hidden) return true;
    if (parent.style && parent.style.display === 'none') return true;
  }
  return false;
}

function isDisabled(el: HTMLElement): boolean {
  if ((el as { disabled?: boolean }).disabled === true) return true;
  return el.getAttribute('aria-disabled') === 'true';
}

function labelledByText(el: HTMLElement): string {
  const ids = el.getAttribute('aria-labelledby');
  const doc = el.ownerDocument;
  if (!ids || !doc) return '';
  return ids
    .split(/\s+/)
    .map((id) => clean(doc.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(' ');
}

function labelForText(el: HTMLElement): string {
  const id = el.getAttribute('id');
  const doc = el.ownerDocument;
  if (!id || !doc) return '';
  let nodes: NodeListOf<Element>;
  try {
    nodes = doc.querySelectorAll(`label[for="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id}"]`);
  } catch {
    return '';
  }
  return Array.from(nodes)
    .map((node) => clean(node.textContent))
    .filter(Boolean)
    .join(' ');
}

function wrappingLabelText(el: HTMLElement): string {
  const label = el.closest('label');
  if (!label) return '';
  const clone = label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input, textarea, select, button').forEach((node) => node.remove());
  return clean(clone.textContent);
}

function accessibleLabel(el: HTMLElement): string {
  const candidates = [
    labelledByText(el),
    el.getAttribute('aria-label'),
    labelForText(el),
    wrappingLabelText(el),
    el.getAttribute('placeholder'),
    el.getAttribute('title'),
  ];
  for (const candidate of candidates) {
    const text = clean(candidate);
    if (text) return text;
  }
  return '';
}

function tagKind(el: HTMLElement): FieldDescriptor['tag'] | null {
  const tag = tagOf(el);
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return tag;
  if (el.isContentEditable) return 'contenteditable';
  return null;
}

function fieldId(el: HTMLElement): string {
  const existing = el.getAttribute(FIELD_ATTR);
  if (existing) return existing;
  counter += 1;
  const id = `diggy-field-${counter}`;
  el.setAttribute(FIELD_ATTR, id);
  return id;
}

/**
 * Detect fillable controls under `root` (default `document`). Hidden, disabled
 * and non-text controls are skipped.
 */
export function detectFields(root?: ParentNode): FieldDescriptor[] {
  const scope = root ?? (typeof document === 'undefined' ? undefined : document);
  if (!scope) return [];

  const found: FieldDescriptor[] = [];
  const elements = Array.from(scope.querySelectorAll(FIELD_SELECTOR));

  for (const el of elements) {
    const element = el as HTMLElement;
    const kind = tagKind(element);
    if (!kind) continue;
    const tag = tagOf(element);
    if (tag === 'input' && EXCLUDED_INPUT_TYPES.has((element as HTMLInputElement).type)) continue;
    if (isHidden(element) || isDisabled(element)) continue;

    const descriptor: FieldDescriptor = {
      id: fieldId(element),
      tag: kind,
      element,
    };

    if (tag === 'input') {
      const input = element as HTMLInputElement;
      descriptor.type = input.type;
      if (input.name) descriptor.name = input.name;
      if (input.autocomplete) descriptor.autocomplete = input.autocomplete;
      if (input.placeholder) descriptor.placeholder = input.placeholder;
      if (input.required) descriptor.required = true;
    } else if (tag === 'textarea') {
      const textarea = element as HTMLTextAreaElement;
      if (textarea.name) descriptor.name = textarea.name;
      if (textarea.placeholder) descriptor.placeholder = textarea.placeholder;
      if (textarea.required) descriptor.required = true;
    } else if (tag === 'select') {
      const select = element as HTMLSelectElement;
      descriptor.type = select.multiple ? 'select-multiple' : 'select';
      if (select.name) descriptor.name = select.name;
      if (select.required) descriptor.required = true;
      descriptor.options = Array.from(select.options).map((option) => clean(option.textContent) || option.value);
    }

    const label = accessibleLabel(element);
    if (label) descriptor.label = label;
    if (element.getAttribute('aria-label')) descriptor.ariaLabel = clean(element.getAttribute('aria-label'));
    if (element.getAttribute('aria-required') === 'true') descriptor.required = true;

    found.push(descriptor);
  }

  return found;
}

/** Reset the id counter (test helper). */
export function resetFieldIds(): void {
  counter = 0;
}
