/**
 * Matching: field classification + the vault profile -> {@link FillInstruction}s.
 *
 * Locked vault fields are never resolved here — the instruction carries the
 * `{{LOCKED:key}}` token, which only the vault's per-use approval gate can turn
 * into plaintext (at fill time). Ambiguous or unknown fields become
 * {@link MatchQuestion}s rather than guesses.
 */
import type { ProfileSchema, VaultField } from '@diggy/shared';
import { candidateKinds, classifyField, scoreField } from './classify.js';
import { findSavedAnswer } from './saved-answers.js';
import { formatResumeValue, type ResumeData } from './resume.js';
import type {
  FieldDescriptor,
  FieldKind,
  FieldMatch,
  FillInstruction,
  MatchOptions,
  MatchQuestion,
} from './types.js';

const LOCKED_RE = /^\{\{LOCKED:([^}]+)\}\}$/;

export const DEFAULT_MIN_CONFIDENCE = 0.5;
export const DEFAULT_AMBIGUITY_MARGIN = 0.15;

interface ProfileValue {
  value: string;
  locked: boolean;
  key: string;
}

export interface MatchResult {
  matches: FieldMatch[];
  questions: MatchQuestion[];
}

export function isLockedValue(value: unknown): value is string {
  return typeof value === 'string' && LOCKED_RE.test(value);
}

/** Kinds that map onto a same-named top-level `ProfileSchema` key. */
const KIND_KEYS: Partial<Record<FieldKind, string>> = {
  fullName: 'fullName',
  email: 'email',
  phone: 'phone',
  college: 'college',
  degree: 'degree',
  semester: 'semester',
  resumeFile: 'resumeRef',
  dob: 'dob',
  address: 'address',
  city: 'city',
  state: 'state',
  country: 'country',
  postalCode: 'postalCode',
  workType: 'workType',
  noticePeriod: 'noticePeriod',
  expectedCtc: 'expectedCtc',
};

const LINK_KINDS: Partial<Record<FieldKind, string>> = {
  github: 'github',
  linkedin: 'linkedin',
  portfolio: 'portfolio',
  leetcode: 'leetcode',
};

function fromField(field: VaultField<unknown> | undefined): ProfileValue | null {
  if (!field) return null;
  const raw = field.value;
  if (isLockedValue(raw)) return { value: raw, locked: true, key: field.key };
  if (Array.isArray(raw)) {
    const joined = raw.filter((item) => typeof item === 'string' && item.length > 0).join(', ');
    return joined ? { value: joined, locked: false, key: field.key } : null;
  }
  if (raw && typeof raw === 'object') return null;
  const text = raw === undefined || raw === null ? '' : String(raw);
  return text ? { value: text, locked: false, key: field.key } : null;
}

function customField(profile: ProfileSchema, key: string): VaultField<unknown> | undefined {
  return (profile.custom ?? []).find((field) => field.key === key);
}

function linkValue(profile: ProfileSchema, name: string): ProfileValue | null {
  const links = profile.links;
  if (!links) return null;
  if (isLockedValue(links.value)) return null; // a locked link map cannot be partially exposed
  const value = links.value[name] ?? (name === 'portfolio' ? links.value['website'] : undefined);
  return value ? { value, locked: false, key: `links.${name}` } : null;
}

function derivedName(profile: ProfileSchema, which: 'firstName' | 'lastName'): ProfileValue | null {
  const full = fromField(profile.fullName);
  if (!full) return null;
  if (full.locked) return full; // token only — never split a locked name
  const parts = full.value.trim().split(/\s+/);
  if (parts.length === 0) return null;
  const value = which === 'firstName' ? (parts[0] as string) : parts.slice(1).join(' ');
  return value ? { value, locked: false, key: 'fullName' } : null;
}

/** Resolve a classified kind to a value from the profile (or résumé data). */
export function valueForKind(
  kind: FieldKind,
  profile: ProfileSchema,
  resume?: ResumeData,
): ProfileValue | null {
  if (kind === 'skills') return fromField(profile.skills);
  if (kind in LINK_KINDS) return linkValue(profile, LINK_KINDS[kind] as string);
  if (kind === 'firstName' || kind === 'lastName') return derivedName(profile, kind);
  if (kind === 'education' || kind === 'experience' || kind === 'projects' || kind === 'certifications') {
    const text = resume ? formatResumeValue(kind, resume) : null;
    return text ? { value: text, locked: false, key: kind } : null;
  }

  const key = KIND_KEYS[kind];
  if (!key) return null;
  const top = fromField((profile as unknown as Record<string, VaultField<unknown> | undefined>)[key]);
  if (top) return top;
  return fromField(customField(profile, key));
}

/** Look for a custom vault field whose key/label the field plainly names. */
function customMatch(field: FieldDescriptor, profile: ProfileSchema): ProfileValue | null {
  const custom = profile.custom ?? [];
  if (custom.length === 0) return null;
  const haystack = [field.label, field.ariaLabel, field.placeholder, field.name]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (!haystack) return null;

  let best: { field: VaultField; score: number } | null = null;
  for (const candidate of custom) {
    const tokens = `${candidate.key} ${candidate.label}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3);
    if (tokens.length === 0) continue;
    if (!tokens.every((token) => haystack.includes(token))) continue;
    const score = tokens.length;
    if (!best || score > best.score) best = { field: candidate, score };
  }
  return best ? fromField(best.field) : null;
}

function labelOf(field: FieldDescriptor): string {
  return field.label || field.ariaLabel || field.placeholder || field.name || field.id;
}

function instruction(
  field: FieldDescriptor,
  kind: FieldKind,
  resolved: ProfileValue,
  confidence: number,
  source: FillInstruction['source'],
): FillInstruction {
  return {
    fieldId: field.id,
    kind,
    value: resolved.value,
    locked: resolved.locked,
    profileKey: resolved.key,
    confidence,
    source,
  };
}

/** Match one field against the profile. */
function matchField(
  field: FieldDescriptor,
  profile: ProfileSchema,
  options: Required<Pick<MatchOptions, 'minConfidence' | 'ambiguityMargin'>> & MatchOptions,
): FieldMatch {
  const scores = scoreField(field);
  const best = scores[0];
  const runnerUp = scores[1];
  const classification = classifyField(field);

  const ambiguous =
    best !== undefined &&
    runnerUp !== undefined &&
    best.confidence - runnerUp.confidence <= options.ambiguityMargin;

  if (best && best.confidence >= options.minConfidence && !ambiguous) {
    const resolved = valueForKind(best.kind, profile, options.resume);
    if (resolved) {
      return { field, classification, instruction: instruction(field, best.kind, resolved, best.confidence, 'vault') };
    }
  }

  // A custom vault field (e.g. a locked "Aadhaar") named by the label wins over a question.
  const custom = customMatch(field, profile);
  if (custom) {
    return {
      field,
      classification,
      instruction: instruction(field, classification.kind === 'unknown' ? 'customAnswer' : classification.kind, custom, 0.6, 'vault'),
    };
  }

  // Saved answers are the last safe fallback for an unrecognised field.
  const saved = findSavedAnswer(labelOf(field), options.savedAnswers);
  if (saved && classification.kind === 'unknown') {
    return {
      field,
      classification,
      instruction: {
        fieldId: field.id,
        kind: 'customAnswer',
        value: saved.answer,
        locked: false,
        confidence: 0.4,
        source: 'saved-answer',
      },
    };
  }

  return { field, classification, question: buildQuestion(field, ambiguous, scores.map((s) => s.kind)) };
}

function buildQuestion(field: FieldDescriptor, ambiguous: boolean, ranked: FieldKind[]): MatchQuestion {
  const options = ranked.length > 0 ? ranked.slice(0, 4) : candidateKinds(field);
  return {
    fieldId: field.id,
    label: labelOf(field),
    reason: ambiguous
      ? 'More than one profile field fits this input equally well.'
      : 'DIGGY is not confident what this input is asking for.',
    options: options.length > 0 ? options : ['fullName', 'email', 'phone', 'customAnswer'],
  };
}

/** Match a set of detected fields against the (tokenized) profile. */
export function matchFields(
  fields: FieldDescriptor[],
  profile: ProfileSchema,
  options: MatchOptions = {},
): MatchResult {
  const resolved = {
    ...options,
    minConfidence: options.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
    ambiguityMargin: options.ambiguityMargin ?? DEFAULT_AMBIGUITY_MARGIN,
  };

  const matches: FieldMatch[] = [];
  const questions: MatchQuestion[] = [];
  for (const field of fields) {
    const match = matchField(field, profile, resolved);
    matches.push(match);
    if (match.question) questions.push(match.question);
  }
  return { matches, questions };
}
