/**
 * Gate — Monitor baseline / change / dedupe (Node, always runs).
 *
 * The Monitor Engine is DIGGY's USP, and its core guarantee is deterministic:
 * the first check only establishes a **baseline** (no event); a later change
 * raises **exactly one** event; an identical change is **deduped** by eventKey;
 * and a non-`keep` watch disarms after firing until re-armed.
 */
import { createWatchState, evaluateWatch } from '@diggy/monitor';
import { assert, assertEqual } from '../harness.mjs';

export const name = 'gate-monitor';
export const description = 'monitor establishes a baseline, fires one event per change, and dedupes by eventKey';
export const kind = 'node';

const snap = (text) => ({ url: 'https://example.com', title: 'Example', text });

export async function run() {
  const spec = { id: 'w1', url: 'https://example.com', kind: 'content_change', intervalSec: 60, createdAt: 0 };

  // 1. First check = baseline only.
  const r1 = evaluateWatch(spec, createWatchState(), snap('version one'), 1000);
  assertEqual(r1.detection, null, 'the first check must not raise an event');
  assertEqual(r1.state.baseline, true, 'the first check must set the baseline');
  assertEqual(r1.changed, false, 'the first check is not a change');

  // 2. A real change raises exactly one event, then disarms (non-keep).
  const r2 = evaluateWatch(spec, r1.state, snap('version two'), 2000);
  assert(r2.detection !== null, 'a content change must raise an event');
  assertEqual(r2.changed, true, 'the change must be reported');
  assertEqual(r2.state.armed, false, 'a non-keep watch disarms after firing');
  const eventKey = r2.detection.eventKey;

  // 3. While disarmed, further changes raise nothing.
  const r3 = evaluateWatch(spec, r2.state, snap('version three'), 3000);
  assertEqual(r3.detection, null, 'a disarmed watch must not fire again');

  // 4. Re-armed with the SAME content → deduped by eventKey.
  const rearmed = { ...r2.state, armed: true };
  const r4 = evaluateWatch(spec, rearmed, snap('version two'), 4000);
  assertEqual(r4.detection, null, 'the same change must be deduped by eventKey');

  // 5. Re-armed with genuinely new content → a fresh event.
  const r5 = evaluateWatch(spec, rearmed, snap('version four'), 5000);
  assert(r5.detection !== null, 'a new change after re-arm must fire');
  assert(r5.detection.eventKey !== eventKey, 'a different change must have a different eventKey');

  // 6. A `keep` keyword watch dedupes on transition and re-arms when it clears.
  const kw = { id: 'w2', url: 'https://example.com', kind: 'keyword', query: 'open', intervalSec: 60, keep: true, createdAt: 0 };
  const k1 = evaluateWatch(kw, createWatchState(), snap('registration closed'), 1000);
  assertEqual(k1.detection, null, 'keyword baseline is not an event');
  const k2 = evaluateWatch(kw, k1.state, snap('registration is open now'), 2000);
  assert(k2.detection !== null, 'the keyword appearing must fire once');
  const k3 = evaluateWatch(kw, k2.state, snap('registration stays open'), 3000);
  assertEqual(k3.detection, null, 'a keyword already present must not fire again');
  const k4 = evaluateWatch(kw, k3.state, snap('registration closed again'), 4000);
  assertEqual(k4.detection, null, 'the keyword clearing is not an event');
  const k5 = evaluateWatch(kw, k4.state, snap('registration open once more'), 5000);
  assert(k5.detection !== null, 'a keep watch must re-arm and fire when the keyword returns');

  return 'baseline → one event on change → disarmed → dedupe on identical change → fresh event after re-arm; keyword transition deduped and re-armed';
}
