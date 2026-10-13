/**
 * Pointer-overlay tests: the pure state that decides where the cursor is and
 * what it is doing. The DOM rendering lives in the content script; this proves
 * the state transitions the overlay relies on.
 */
import { describe, expect, it } from 'vitest';
import {
  initialPointerState,
  pointerActionForTool,
  reducePointer,
} from '../src/pointer.js';

describe('pointerActionForTool', () => {
  it('maps page verbs to pointer actions', () => {
    expect(pointerActionForTool('click')).toBe('click');
    expect(pointerActionForTool('submit')).toBe('click');
    expect(pointerActionForTool('type')).toBe('type');
    expect(pointerActionForTool('fill')).toBe('type');
    expect(pointerActionForTool('scroll')).toBe('scroll');
    expect(pointerActionForTool('navigate')).toBe('nav');
    expect(pointerActionForTool('read')).toBe('move');
  });
});

describe('reducePointer', () => {
  it('starts hidden', () => {
    expect(initialPointerState().visible).toBe(false);
  });

  it('shows the pointer at an action box', () => {
    const state = reducePointer(initialPointerState(), {
      action: 'click',
      bbox: { x: 10, y: 20, width: 30, height: 12 },
      label: 'Clicking “Send”…',
    });
    expect(state.visible).toBe(true);
    expect(state.action).toBe('click');
    expect(state.bbox).toEqual({ x: 10, y: 20, width: 30, height: 12 });
    expect(state.label).toContain('Send');
    expect(state.seq).toBe(1);
  });

  it('keeps the last box when an event has none', () => {
    const first = reducePointer(initialPointerState(), {
      action: 'click',
      bbox: { x: 1, y: 2, width: 3, height: 4 },
    });
    const next = reducePointer(first, { action: 'scroll' });
    expect(next.bbox).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(next.action).toBe('scroll');
  });

  it('hides and clears the label on idle', () => {
    const shown = reducePointer(initialPointerState(), { action: 'click', label: 'x' });
    const hidden = reducePointer(shown, { action: 'idle' });
    expect(hidden.visible).toBe(false);
    expect(hidden.label).toBe('');
    expect(hidden.seq).toBe(2);
  });
});
