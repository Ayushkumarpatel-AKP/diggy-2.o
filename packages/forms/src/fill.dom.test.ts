// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { VaultAPI } from '@diggy/shared';
import { detectFields, resetFieldIds } from './detect.js';
import { matchFields } from './match.js';
import { buildPreview } from './preview.js';
import { dryRun, fillForm } from './fill.js';
import { AMBIGUOUS_FIELD, EXPECTED_VALUES, FIXTURE_HTML, LOCKED_PLAINTEXT, fixtureProfile } from './fixtures.js';
import type { FieldDescriptor, FieldMatch } from './types.js';

function fakeVault(): VaultAPI {
  return {
    async getProfile() {
      return fixtureProfile();
    },
    tokenFor(key: string) {
      return `{{LOCKED:${key}}}`;
    },
    async resolveLocal(key: string) {
      return key === 'aadhaar' ? LOCKED_PLAINTEXT : null;
    },
    async setVisibility() {
      /* no-op in tests */
    },
  };
}

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

beforeEach(() => {
  document.body.innerHTML = FIXTURE_HTML;
  resetFieldIds();
});

describe('detectFields', () => {
  it('finds every text control and excludes submit / reset / hidden', () => {
    const fields = detectFields(document);
    expect(fields).toHaveLength(22);

    const names = fields.map((field) => field.name);
    expect(names).toContain('email');
    expect(names).toContain('resume');
    expect(names).not.toContain('csrf');
    expect(fields.some((field) => field.type === 'submit' || field.type === 'reset')).toBe(false);
    expect(fields.some((field) => field.type === 'hidden')).toBe(false);
  });

  it('stamps a stable field id usable for later resolution', () => {
    const [first] = detectFields(document);
    expect(first?.id).toMatch(/^diggy-field-/);
    expect(document.querySelector(`[data-diggy-field="${first?.id}"]`)).not.toBeNull();
  });
});

describe('dry run over the fixture form', () => {
  it('fills >=95% correctly, tokenizes the locked field, and asks about the ambiguous one', async () => {
    const fields = detectFields(document);
    const { matches, questions } = matchFields(fields, fixtureProfile());
    const preview = buildPreview(matches, { url: 'https://example.com/apply' });

    expect(preview.submit).toBe(false);
    expect(preview.locked).toBe(1);
    expect(JSON.stringify(preview)).not.toContain(LOCKED_PLAINTEXT);
    expect(questions.map((question) => question.fieldId)).toHaveLength(1);
    // The one question is the deliberately ambiguous control.
    const ambiguous = fields.find((field) => field.name === AMBIGUOUS_FIELD);
    expect(questions[0]?.fieldId).toBe(ambiguous?.id);

    const outcome = await dryRun(matches);
    expect(outcome.submitted).toBe(false);
    expect(outcome.ratio).toBeGreaterThanOrEqual(0.95);

    const nameById = new Map(fields.map((field) => [field.id, field.name]));
    let checked = 0;
    for (const result of outcome.results) {
      if (!result.filled) continue;
      const name = nameById.get(result.fieldId) as string;
      expect(result.value).toBe(EXPECTED_VALUES[name]);
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(21);
  });

  it('does not write to the DOM in a dry run', async () => {
    const fields = detectFields(document);
    const { matches } = matchFields(fields, fixtureProfile());
    await dryRun(matches);
    expect(input('email').value).toBe('');
    expect(input('aadhaar').value).toBe('');
  });
});

describe('real fill never submits', () => {
  it('writes approved values but triggers no submit path', async () => {
    const fields = detectFields(document);
    const { matches } = matchFields(fields, fixtureProfile());
    const form = document.getElementById('application') as HTMLFormElement;

    let submitEvents = 0;
    form.addEventListener('submit', (event) => {
      submitEvents += 1;
      event.preventDefault();
    });

    const proto = HTMLFormElement.prototype as unknown as {
      submit: () => void;
      requestSubmit: () => void;
    };
    const originalSubmit = proto.submit;
    const originalRequest = proto.requestSubmit;
    let submitCalls = 0;
    let requestSubmitCalls = 0;
    proto.submit = () => {
      submitCalls += 1;
    };
    proto.requestSubmit = () => {
      requestSubmitCalls += 1;
    };

    const submitButton = document.getElementById('submit-btn') as HTMLButtonElement;
    let buttonClicks = 0;
    submitButton.addEventListener('click', () => {
      buttonClicks += 1;
    });

    try {
      const outcome = await fillForm(matches, { vault: fakeVault() });

      expect(outcome.submitted).toBe(false);
      expect(submitEvents).toBe(0);
      expect(submitCalls).toBe(0);
      expect(requestSubmitCalls).toBe(0);
      expect(buttonClicks).toBe(0);

      expect(input('email').value).toBe('ada@example.com');
      expect(input('aadhaar').value).toBe(LOCKED_PLAINTEXT);
      expect((document.getElementById('workType') as HTMLSelectElement).value).toBe('Remote');

      // Submit / reset controls are left untouched.
      expect(input('submit-input').value).toBe('Send');
      expect(input('reset-input').value).toBe('Reset');
    } finally {
      proto.submit = originalSubmit;
      proto.requestSubmit = originalRequest;
    }
  });

  it('refuses to fill a submit surface (defence in depth)', async () => {
    const submit = input('submit-input');
    const field: FieldDescriptor = { id: 'submit-x', tag: 'input', type: 'submit', element: submit };
    const match: FieldMatch = {
      field,
      classification: { kind: 'unknown', confidence: 0, basis: [] },
      instruction: {
        fieldId: 'submit-x',
        kind: 'customAnswer',
        value: 'do-not-press',
        locked: false,
        confidence: 1,
        source: 'vault',
      },
    };

    const outcome = await fillForm([match], {});
    expect(outcome.results[0]?.skippedReason).toBe('submit-surface');
    expect(submit.value).toBe('Send');
    expect(outcome.submitted).toBe(false);
  });

  it('leaves a locked field empty when resolution is not approved', async () => {
    const fields = detectFields(document);
    const { matches } = matchFields(fields, fixtureProfile());
    // No vault at all → every locked value is unresolvable.
    const outcome = await fillForm(matches, {});
    const aadhaarId = fields.find((field) => field.name === 'aadhaar')?.id;
    const aadhaarResult = outcome.results.find((result) => result.fieldId === aadhaarId);
    expect(aadhaarResult?.skippedReason).toBe('locked-not-approved');
    expect(input('aadhaar').value).toBe('');
    expect(outcome.submitted).toBe(false);
  });
});
