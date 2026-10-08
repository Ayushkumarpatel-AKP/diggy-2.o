/**
 * Screen-masking helper for any future vision path.
 *
 * Before a screenshot/vision capture, callers mark locked or sensitive input
 * regions (password fields, one-time codes, locked vault fields) and mask them
 * so a locked plaintext can never appear in a capture.
 */
import { FIELD_ATTR } from './detect.js';
import type { FieldDescriptor } from './types.js';

/** Attribute stamped on an element whose region must be masked before capture. */
export const SENSITIVE_ATTR = 'data-diggy-sensitive';

export interface MaskRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SENSITIVE_AUTOCOMPLETE = [
  'current-password',
  'new-password',
  'one-time-code',
  'cc-number',
  'cc-csc',
  'cc-exp',
];

/** A field is sensitive when it holds a password/OTP/payment value or is locked. */
export function isSensitiveField(field: FieldDescriptor): boolean {
  if (field.type === 'password') return true;
  const autocomplete = (field.autocomplete ?? '').toLowerCase();
  if (SENSITIVE_AUTOCOMPLETE.some((token) => autocomplete.startsWith(token))) return true;
  const element = field.element;
  if (element && element.hasAttribute(SENSITIVE_ATTR)) return true;
  return false;
}

/** Permanently mark an element as sensitive (so later captures mask it). */
export function markSensitive(el: HTMLElement): void {
  el.setAttribute(SENSITIVE_ATTR, 'true');
}

/** The masked region for one field, in viewport coordinates. */
export function maskRectFor(field: FieldDescriptor, padding = 6): MaskRect | null {
  const element = field.element;
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    x: Math.max(0, rect.x - padding),
    y: Math.max(0, rect.y - padding),
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/**
 * Masked regions for the sensitive fields in `fields`. Marks each element with
 * {@link SENSITIVE_ATTR} so a capture taken later stays masked.
 */
export function maskRegions(fields: Iterable<FieldDescriptor>, padding = 6): MaskRect[] {
  const rects: MaskRect[] = [];
  for (const field of fields) {
    if (!isSensitiveField(field)) continue;
    if (field.element) markSensitive(field.element);
    const rect = maskRectFor(field, padding);
    if (rect) rects.push(rect);
  }
  return rects;
}

/** The elements whose regions must be masked (for a DOM overlay approach). */
export function sensitiveElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`[${SENSITIVE_ATTR}]`));
}

/** A minimal 2D-context shape, so this stays framework-agnostic. */
export interface MaskContext {
  fillStyle: string;
  fillRect(x: number, y: number, width: number, height: number): void;
}

/** Paint the masked rectangles onto a canvas 2D context. */
export function applyMask(ctx: MaskContext, rects: readonly MaskRect[], color = '#000'): void {
  const previous = ctx.fillStyle;
  ctx.fillStyle = color;
  for (const rect of rects) {
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  ctx.fillStyle = previous;
}

/** Convenience: the query for a previously stamped sensitive field. */
export function sensitiveSelector(fieldId: string): string {
  return `[${FIELD_ATTR}="${fieldId}"][${SENSITIVE_ATTR}]`;
}
