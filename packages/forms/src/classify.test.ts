import { describe, expect, it } from 'vitest';
import { candidateKinds, classifyField, scoreField } from './classify.js';
import type { FieldDescriptor } from './types.js';

function field(partial: Partial<FieldDescriptor>): FieldDescriptor {
  return { id: 'f', tag: 'input', ...partial };
}

describe('classifyField', () => {
  const cases: Array<[Partial<FieldDescriptor>, string]> = [
    [{ label: 'Full name', name: 'fullName' }, 'fullName'],
    [{ label: 'First name', name: 'firstName' }, 'firstName'],
    [{ label: 'Last name', name: 'lastName' }, 'lastName'],
    [{ label: 'Email', type: 'email' }, 'email'],
    [{ label: 'Phone', type: 'tel' }, 'phone'],
    [{ label: 'Date of birth', name: 'dob' }, 'dob'],
    [{ label: 'Address' }, 'address'],
    [{ label: 'City' }, 'city'],
    [{ label: 'State' }, 'state'],
    [{ label: 'Country' }, 'country'],
    [{ label: 'PIN code', name: 'pincode' }, 'postalCode'],
    [{ label: 'College / University', name: 'college' }, 'college'],
    [{ label: 'Degree', name: 'degree' }, 'degree'],
    [{ label: 'Semester' }, 'semester'],
    [{ label: 'Skills', tag: 'textarea', name: 'skills' }, 'skills'],
    [{ label: 'GitHub', name: 'github' }, 'github'],
    [{ label: 'LinkedIn', name: 'linkedin' }, 'linkedin'],
    [{ label: 'Portfolio' }, 'portfolio'],
    [{ label: 'Resume', type: 'file', name: 'resume' }, 'resumeFile'],
  ];

  for (const [partial, expected] of cases) {
    it(`classifies ${JSON.stringify(partial)} as ${expected}`, () => {
      expect(classifyField(field(partial)).kind).toBe(expected);
    });
  }

  it('returns unknown for a field that names no profile field', () => {
    expect(classifyField(field({ label: 'Reference number', name: 'code' })).kind).toBe('unknown');
    expect(classifyField(field({ label: 'favourite colour' })).confidence).toBe(0);
  });

  it('does not confuse "Email address" with a postal address', () => {
    expect(classifyField(field({ label: 'Email address' })).kind).toBe('email');
  });

  it('weights autocomplete and type strongly', () => {
    const byType = scoreField(field({ type: 'email' }))[0];
    expect(byType?.kind).toBe('email');
    expect(byType?.confidence).toBeGreaterThanOrEqual(0.6);

    const byAutocomplete = scoreField(field({ autocomplete: 'postal-code' }))[0];
    expect(byAutocomplete?.kind).toBe('postalCode');
  });

  it('reports equal top candidates for a genuinely ambiguous label', () => {
    const scores = scoreField(field({ label: 'email or phone' }));
    expect(scores[0]?.confidence).toBe(scores[1]?.confidence);
    expect(new Set([scores[0]?.kind, scores[1]?.kind])).toEqual(new Set(['email', 'phone']));
  });

  it('candidateKinds returns the ranked shortlist', () => {
    expect(candidateKinds(field({ label: 'github profile' }))).toContain('github');
  });
});
