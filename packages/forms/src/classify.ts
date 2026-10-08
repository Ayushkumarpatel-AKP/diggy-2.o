/**
 * Field classification: map a detected control to a semantic {@link FieldKind}
 * with a confidence score. Pure and deterministic — no profile, no DOM writes.
 *
 * Scoring is per-signal (label / aria / placeholder / name / type / autocomplete)
 * so "Email address" does not accidentally score as a postal address.
 */
import type { Classification, FieldDescriptor, FieldKind } from './types.js';

interface Rule {
  kind: FieldKind;
  patterns: RegExp[];
  /** Exact `autocomplete` tokens that name this field outright. */
  autocompletes?: string[];
  /** Exact input `type` values that name this field outright. */
  types?: string[];
}

const RULES: Rule[] = [
  {
    kind: 'fullName',
    patterns: [/full[\s_-]?name/, /^\s*name\s*$/, /your[\s_-]?name/, /applicant[\s_-]?name/, /candidate[\s_-]?name/],
    autocompletes: ['name'],
  },
  {
    kind: 'firstName',
    patterns: [/first[\s_-]?name/, /given[\s_-]?name/],
    autocompletes: ['given-name'],
  },
  {
    kind: 'lastName',
    patterns: [/last[\s_-]?name/, /surname/, /family[\s_-]?name/],
    autocompletes: ['family-name'],
  },
  {
    kind: 'email',
    patterns: [/e-?mail/],
    autocompletes: ['email'],
    types: ['email'],
  },
  {
    kind: 'phone',
    patterns: [/phone/, /mobile/, /contact[\s_-]?no/, /whatsapp/, /telephone/],
    autocompletes: ['tel', 'tel-national'],
    types: ['tel'],
  },
  {
    kind: 'dob',
    patterns: [/dob/, /date[\s_-]?of[\s_-]?birth/, /birth[\s_-]?date/, /birthday/],
    autocompletes: ['bday'],
  },
  {
    kind: 'address',
    patterns: [/\bstreet\b/, /\bresidence\b/, /\baddress[\s_-]?line\b/, /^\s*address\s*$/, /\bmailing address\b/, /\bpermanent address\b/],
    autocompletes: ['street-address', 'address-line1'],
  },
  {
    kind: 'city',
    patterns: [/\bcity\b/, /\btown\b/, /\blocality\b/],
    autocompletes: ['address-level2'],
  },
  {
    kind: 'state',
    patterns: [/\bstate\b/, /\bprovince\b/, /\bregion\b/],
    autocompletes: ['address-level1'],
  },
  {
    kind: 'country',
    patterns: [/\bcountry\b/, /\bnationality\b/],
    autocompletes: ['country', 'country-name'],
  },
  {
    kind: 'postalCode',
    patterns: [/\bpostal\b/, /\bzip\b/, /\bpin[\s_-]?code\b/, /\bpincode\b/, /\bpost[\s_-]?code\b/],
    autocompletes: ['postal-code'],
  },
  {
    kind: 'college',
    patterns: [/\bcollege\b/, /\buniversity\b/, /\binstitution\b/, /\bschool\b/],
  },
  {
    kind: 'degree',
    patterns: [/\bdegree\b/, /\bcourse\b/, /\bprogram(me)?\b/, /\bqualification\b/],
  },
  {
    kind: 'semester',
    patterns: [/\bsemester\b/, /\byear[\s_-]?of[\s_-]?study\b/, /\bcurrent[\s_-]?year\b/],
  },
  {
    kind: 'skills',
    patterns: [/\bskills?\b/, /\btechnolog(y|ies)\b/, /\btechnical[\s_-]?skills\b/, /\bexpertise\b/],
  },
  {
    kind: 'github',
    patterns: [/github/],
  },
  {
    kind: 'linkedin',
    patterns: [/linked[\s_-]?in/],
  },
  {
    kind: 'portfolio',
    patterns: [/\bportfolio\b/, /\bwebsite\b/, /\bpersonal[\s_-]?site\b/, /\bhomepage\b/],
  },
  {
    kind: 'leetcode',
    patterns: [/leetcode/],
  },
  {
    kind: 'resumeFile',
    patterns: [/\bresume\b/, /\bcv\b/],
    types: ['file'],
  },
  {
    kind: 'workType',
    patterns: [/\bwork[\s_-]?type\b/, /\bremote\b/, /\bhybrid\b/, /\bonsite\b/, /\bwork[\s_-]?mode\b/],
  },
  {
    kind: 'noticePeriod',
    patterns: [/notice[\s_-]?period/],
  },
  {
    kind: 'expectedCtc',
    patterns: [/expected[\s_-]?ctc/, /expected[\s_-]?salary/, /current[\s_-]?ctc/, /\bctc\b/],
  },
  {
    kind: 'education',
    patterns: [/\beducation\b/, /\bqualifications\b/, /\bacademic\b/],
  },
  {
    kind: 'experience',
    patterns: [/\bexperience\b/, /\bemployment\b/, /\bwork[\s_-]?history\b/],
  },
  {
    kind: 'projects',
    patterns: [/\bprojects?\b/],
  },
  {
    kind: 'certifications',
    patterns: [/certifications?/, /\bachievements?\b/],
  },
];

export interface FieldScore {
  kind: FieldKind;
  confidence: number;
  basis: string[];
}

function textSignals(field: FieldDescriptor): string[] {
  return [field.label, field.ariaLabel, field.placeholder, field.name]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => value.toLowerCase());
}

/**
 * All candidate kinds for a field, best-first. Confidence is capped at 1 and is
 * a sum of signal weights: type +0.6, autocomplete +0.7, each matched text signal +0.5.
 */
export function scoreField(field: FieldDescriptor): FieldScore[] {
  const signals = textSignals(field);
  const type = (field.type ?? '').toLowerCase();
  const autocomplete = (field.autocomplete ?? '').toLowerCase();

  const scores: FieldScore[] = [];
  for (const rule of RULES) {
    let score = 0;
    const basis: string[] = [];

    if (rule.types && type && rule.types.includes(type)) {
      score += 0.6;
      basis.push(`type:${type}`);
    }
    if (rule.autocompletes && autocomplete && rule.autocompletes.includes(autocomplete)) {
      score += 0.7;
      basis.push(`autocomplete:${autocomplete}`);
    }
    for (const signal of signals) {
      if (rule.patterns.some((pattern) => pattern.test(signal))) {
        score += 0.5;
        basis.push(`text:${signal}`);
      }
    }

    if (score > 0) {
      scores.push({ kind: rule.kind, confidence: Math.min(1, score), basis });
    }
  }

  return scores.sort((a, b) => b.confidence - a.confidence);
}

/** The single best classification, or `unknown` with confidence 0. */
export function classifyField(field: FieldDescriptor): Classification {
  const [best] = scoreField(field);
  if (!best) return { kind: 'unknown', confidence: 0, basis: [] };
  return best;
}

/** The candidate kinds for a field, best-first (for "which of these?" prompts). */
export function candidateKinds(field: FieldDescriptor, limit = 4): FieldKind[] {
  return scoreField(field)
    .slice(0, limit)
    .map((score) => score.kind);
}
