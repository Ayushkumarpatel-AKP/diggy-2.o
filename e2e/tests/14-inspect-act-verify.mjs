/**
 * Test — **inspect → act → verify** on a real page (browser).
 *
 * Runs the shipped `@diggy/page-agent` act layer inside Chromium over the chat
 * fixture and proves the whole reliability story end to end:
 *   - a `type` is confirmed by reading the value back (`verified`),
 *   - a click dispatches the full pointer/mouse gesture, not a bare `element.click()`,
 *   - a plain `click` still **refuses** the Send control (it is a submit control),
 *   - the message only sends through the authorized `performUserSubmit` path, and
 *   - the page shows its own "Sent ✓" marker, so success is the page's word, not ours.
 */
import { assert, assertEqual, injectProduct, openFixturePage } from '../harness.mjs';

export const name = 'inspect-act-verify';
export const description = 'real page-agent: read-back verify, real click gesture, submit refused, authorized send delivers';
export const kind = 'browser';

export async function run(env) {
  const app = await env.launch();
  try {
    const page = await openFixturePage(app, env.fixtures.fixtureUrl('chat'));
    const injected = await injectProduct(page);
    if (injected.skipped) {
      const { SkipError } = await import('../harness.mjs');
      throw new SkipError(injected.skipped);
    }

    const result = await page.evaluate(async () => {
      const { createPageAgent, findSubmitControl, performUserSubmit, isSubmitControl } =
        globalThis.__DIGGY_TEST__;
      const agent = createPageAgent();

      // Inspect: find the composer and the Send control by accessible name.
      const snapshot = agent.snapshot();
      const byName = (name) => snapshot.entries.find((entry) => entry.name === name)?.ref;
      const composerRef = byName('Message');
      const sendRef = byName('Send message');
      const probeRef = byName('Probe');

      // Act + verify: the value must read back.
      const typed = await agent.type(composerRef, 'Hello Priyanka.');
      // Capture it now — pressing Send clears the composer below.
      const composerValue = document.getElementById('composer').value;

      // A plain click must refuse the submit control.
      const refused = await agent.click(sendRef);

      // The authorized path presses it.
      const control = findSubmitControl();
      const pressed = performUserSubmit(control);

      // A real gesture on a plain button: the phases must all fire.
      window.__pointerPhases.length = 0;
      await agent.click(probeRef);

      return {
        typedOk: typed.ok,
        typedVerified: typed.verified,
        composerValue,
        sendIsSubmit: isSubmitControl(document.getElementById('send')),
        refusedOk: refused.ok,
        refusedDecision: refused.decision,
        pressedOk: pressed.ok,
        sent: window.__sent.slice(),
        statusText: document.getElementById('status').textContent,
        phases: window.__pointerPhases.slice(),
      };
    });

    assert(result.typedOk, 'type must succeed');
    assertEqual(result.typedVerified, true, 'type must be verified by read-back');
    assertEqual(result.composerValue, 'Hello Priyanka.', 'the composer must hold the typed text');

    assert(result.sendIsSubmit, 'the Send button must classify as a submit control');
    assertEqual(result.refusedOk, false, 'a plain click must refuse the submit control');
    assert(
      result.refusedDecision === 'confirm' || result.refusedDecision === 'deny',
      `the refusal must be a gate, got "${result.refusedDecision}"`,
    );

    assertEqual(result.pressedOk, true, 'the authorized submit must press the control');
    assertEqual(result.sent.length, 1, 'the message must be sent exactly once');
    assertEqual(result.sent[0], 'Hello Priyanka.', 'the sent text');
    assert(result.statusText.includes('Sent'), 'the page must show its own sent marker');

    for (const phase of ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      assert(result.phases.includes(phase), `a click must dispatch ${phase}`);
    }

    return `typed+verified "Hello Priyanka.", click refused (${result.refusedDecision}), authorized send delivered, gesture=[${result.phases.join(', ')}]`;
  } finally {
    await app.close();
  }
}
