// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  SENSITIVE_ATTR,
  applyMask,
  isSensitiveField,
  markSensitive,
  maskRegions,
  sensitiveElements,
  type MaskContext,
} from './mask.js';
import type { FieldDescriptor } from './types.js';

function field(partial: Partial<FieldDescriptor>): FieldDescriptor {
  return { id: 'f', tag: 'input', ...partial };
}

describe('isSensitiveField', () => {
  it('flags passwords, OTP/payment autocomplete, and marked elements', () => {
    expect(isSensitiveField(field({ type: 'password' }))).toBe(true);
    expect(isSensitiveField(field({ autocomplete: 'one-time-code' }))).toBe(true);
    expect(isSensitiveField(field({ autocomplete: 'cc-number' }))).toBe(true);

    const el = document.createElement('input');
    markSensitive(el);
    expect(isSensitiveField(field({ element: el }))).toBe(true);
  });

  it('does not flag an ordinary text field', () => {
    expect(isSensitiveField(field({ label: 'Full name' }))).toBe(false);
  });
});

describe('maskRegions', () => {
  it('returns masked rects for sensitive fields and stamps the element', () => {
    const password = document.createElement('input');
    password.type = 'password';
    password.getBoundingClientRect = () =>
      ({ x: 10, y: 20, width: 100, height: 30, top: 20, left: 10, right: 110, bottom: 50, toJSON: () => ({}) }) as DOMRect;
    document.body.append(password);

    const rects = maskRegions([field({ type: 'password', element: password })], 5);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ x: 5, y: 15, width: 110, height: 40 });
    expect(password.getAttribute(SENSITIVE_ATTR)).toBe('true');
    expect(sensitiveElements(document)).toContain(password);
  });

  it('skips non-sensitive and element-less fields', () => {
    expect(maskRegions([field({ label: 'City' })])).toEqual([]);
  });
});

describe('applyMask', () => {
  it('paints the masked rectangles onto a 2D context', () => {
    const painted: Array<[number, number, number, number]> = [];
    const ctx: MaskContext = {
      fillStyle: '#000',
      fillRect(x, y, width, height) {
        painted.push([x, y, width, height]);
      },
    };
    applyMask(ctx, [{ x: 1, y: 2, width: 3, height: 4 }], '#fff');
    expect(painted).toEqual([[1, 2, 3, 4]]);
  });
});
