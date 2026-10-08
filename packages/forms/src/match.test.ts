import { describe, expect, it } from 'vitest';
import { matchFields } from './match.js';
import { buildPreview } from './preview.js';
import { fixtureProfile, LOCKED_PLAINTEXT } from './fixtures.js';
import type { FieldDescriptor } from './types.js';

function field(partial: Partial<FieldDescriptor>): FieldDescriptor {
  return { id: partial.name ?? 'f', tag: 'input', ...partial };
}

describe('matchFields', () => {
  const profile = fixtureProfile();

  it('maps a shared field to its plaintext value', () => {
    const { matches } = matchFields([field({ label: 'Full name', name: 'fullName' })], profile);
    expect(matches[0]?.instruction?.value).toBe('Ada Lovelace');
    expect(matches[0]?.instruction?.locked).toBe(false);
  });

  it('tokenizes a locked field and never exposes its plaintext', () => {
    const { matches } = matchFields([field({ label: 'Aadhaar number', name: 'aadhaar' })], profile);
    const instruction = matches[0]?.instruction;
    expect(instruction?.locked).toBe(true);
    expect(instruction?.value).toBe('{{LOCKED:aadhaar}}');
    expect(instruction?.profileKey).toBe('aadhaar');
    expect(JSON.stringify(matches)).not.toContain(LOCKED_PLAINTEXT);
  });

  it('joins skills and pulls links out of the profile', () => {
    const { matches } = matchFields(
      [
        field({ label: 'Skills', tag: 'textarea', name: 'skills' }),
        field({ label: 'GitHub', name: 'github' }),
        field({ label: 'Portfolio', name: 'portfolio' }),
      ],
      profile,
    );
    expect(matches[0]?.instruction?.value).toBe('mathematics, algorithms');
    expect(matches[1]?.instruction?.value).toBe('https://github.com/ada');
    expect(matches[2]?.instruction?.value).toBe('https://ada.dev');
  });

  it('derives first/last name from the shared full name', () => {
    const { matches } = matchFields(
      [field({ label: 'First name', name: 'firstName' }), field({ label: 'Last name', name: 'lastName' })],
      profile,
    );
    expect(matches[0]?.instruction?.value).toBe('Ada');
    expect(matches[1]?.instruction?.value).toBe('Lovelace');
  });

  it('asks instead of guessing for an ambiguous or unknown field', () => {
    const { matches, questions } = matchFields(
      [field({ label: 'Reference number', name: 'code' })],
      profile,
    );
    expect(matches[0]?.instruction).toBeUndefined();
    expect(questions).toHaveLength(1);
    expect(questions[0]?.fieldId).toBe('code');
    expect(questions[0]?.options.length).toBeGreaterThan(0);
  });

  it('falls back to a saved answer for an unrecognised question', () => {
    const { matches } = matchFields(
      [field({ label: 'Why do you want this job?', tag: 'textarea', name: 'why' })],
      profile,
      { savedAnswers: [{ pattern: 'why do you want', answer: 'To compute.' }] },
    );
    expect(matches[0]?.instruction?.source).toBe('saved-answer');
    expect(matches[0]?.instruction?.value).toBe('To compute.');
  });

  it('prefers a question over a low-confidence guess', () => {
    const { matches } = matchFields(
      [field({ label: 'Miscellaneous', name: 'misc' })],
      profile,
      { minConfidence: 0.9 },
    );
    expect(matches[0]?.question).toBeDefined();
  });
});

describe('buildPreview', () => {
  it('counts locked entries and never submits', () => {
    const profile = fixtureProfile();
    const { matches } = matchFields(
      [field({ label: 'Email', name: 'email', type: 'email' }), field({ label: 'Aadhaar number', name: 'aadhaar' })],
      profile,
    );
    const preview = buildPreview(matches, { url: 'https://example.com/apply' });
    expect(preview.submit).toBe(false);
    expect(preview.fillable).toBe(2);
    expect(preview.locked).toBe(1);
    expect(JSON.stringify(preview)).not.toContain(LOCKED_PLAINTEXT);
  });
});
