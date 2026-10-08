/**
 * Test — **the confirm gate** (browser, against a real form).
 *
 * This is the load-bearing negative test: it proves a form fill run through the
 * real product modules **never submits**, and it is *not vacuous* because it first
 * establishes a control — a genuine `submit` on the very same fixture **is**
 * recorded by the page's capture-phase listener. So `submitCount === 0` after a
 * fill means the fill refused to submit, not that the counter is broken.
 *
 * It runs the *shipped* product code (`@diggy/forms` detect → match → preview →
 * fill) inside the loaded Chromium, injected as a bundle, over the fixture form.
 */
import { assert, assertEqual, openFixturePage, injectProduct } from '../harness.mjs';

export const name = 'confirm-gate';
export const description = 'a real form fill (real @diggy/forms) fills fields, is never submitted, and never fabricates a submit';
export const kind = 'browser';

const PROFILE = {
  fullName: { key: 'fullName', label: 'Full name', value: 'Ayush Sharma', visibility: 'shared' },
  email: { key: 'email', label: 'Email', value: 'ayush.sharma@example.com', visibility: 'shared' },
  phone: { key: 'phone', label: 'Phone', value: '+91 90000 00000', visibility: 'shared' },
};

export async function run(env) {
  const app = await env.launch();
  try {
    const page = await openFixturePage(app, env.fixtures.fixtureUrl('form'));

    // ── Control: a real submit on this fixture *is* recorded ────────────────
    const control = await page.evaluate(() => {
      window.__diggySubmitCount = 0;
      window.__diggySubmitted = false;
      document
        .getElementById('application')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return { count: window.__diggySubmitCount, submitted: window.__diggySubmitted };
    });
    assertEqual(control.count, 1, 'control submit must be recorded (proves the fixture counts submits)');
    assertEqual(control.submitted, true, 'control submit must set __diggySubmitted');

    // Reset, then run the product's fill pipeline.
    await page.evaluate(() => {
      window.__diggySubmitCount = 0;
      window.__diggySubmitted = false;
    });

    const injected = await injectProduct(page);
    if (injected.skipped) {
      const { SkipError } = await import('../harness.mjs');
      throw new SkipError(injected.skipped);
    }

    const result = await page.evaluate(async (profile) => {
      const { detectFields, matchFields, buildPreview, fillForm, isSubmitSurface } =
        globalThis.__DIGGY_TEST__;
      const fields = detectFields(document);
      const { matches, questions } = matchFields(fields, profile);
      const preview = buildPreview(matches);
      const outcome = await fillForm(matches);
      return {
        fieldCount: fields.length,
        detectedSubmit: fields.some((field) => field.element && isSubmitSurface(field.element)),
        previewSubmit: preview.submit,
        fillable: preview.fillable,
        outcomeSubmitted: outcome.submitted,
        filled: outcome.filled,
        questionCount: questions.length,
        fullName: document.getElementById('fullName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        why: document.getElementById('why').value,
        submitCount: window.__diggySubmitCount,
        submitted: window.__diggySubmitted,
        submitIsSurface: isSubmitSurface(document.getElementById('submit')),
      };
    }, PROFILE);

    // The form was filled…
    assert(result.filled >= 3, `expected at least 3 fields filled, got ${result.filled}`);
    assertEqual(result.fullName, PROFILE.fullName.value, 'fullName input');
    assertEqual(result.email, PROFILE.email.value, 'email input');
    assertEqual(result.phone, PROFILE.phone.value, 'phone input');
    assertEqual(result.why, '', 'unmapped textarea must stay empty');

    // …and never submitted.
    assertEqual(result.previewSubmit, false, 'preview.submit must be false');
    assertEqual(result.outcomeSubmitted, false, 'fillForm output.submitted must be false');
    assertEqual(result.submitCount, 0, 'no submit event may fire during a fill');
    assertEqual(result.submitted, false, '__diggySubmitted must stay false');

    // …and the submit control was never a fill target.
    assert(result.submitIsSurface, 'the submit button must classify as a submit surface');
    assert(!result.detectedSubmit, 'detectFields must never return the submit button as a fillable field');

    return `filled ${result.filled}/${result.fieldCount} fields (submit excluded), preview.submit=false, submitCount=0 (control proved the counter works)`;
  } finally {
    await app.close();
  }
}
