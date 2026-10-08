/**
 * `@diggy/forms` — public vocabulary for Smart Form Filling.
 *
 * // INTERFACE FOR INTEGRATION
 * // Consumer: apps/extension/src/field-mapper.ts, the side panel "Fill form" action.
 * // Pipeline: detect -> classify -> match -> preview -> approve -> fill (NEVER submit).
 * type FieldKind = 'fullName' | 'firstName' | 'lastName' | 'email' | 'phone' | 'dob'
 *   | 'address' | 'city' | 'state' | 'country' | 'postalCode'
 *   | 'college' | 'degree' | 'semester' | 'skills'
 *   | 'github' | 'linkedin' | 'portfolio' | 'leetcode'
 *   | 'resumeFile' | 'workType' | 'noticePeriod' | 'expectedCtc'
 *   | 'education' | 'experience' | 'projects' | 'certifications'
 *   | 'customAnswer' | 'unknown';
 *
 * interface FieldDescriptor { id; tag; type?; name?; label?; placeholder?; ariaLabel?;
 *   autocomplete?; required?; options?; element? }
 * interface Classification { kind: FieldKind; confidence: number; basis: string[] }
 * interface FillInstruction { fieldId; kind; value: string; locked: boolean;
 *   profileKey?: string; confidence: number; source: 'vault' | 'saved-answer' }
 * interface MatchQuestion { fieldId; label; reason; options: FieldKind[] }
 * interface FieldMatch { field; classification; instruction?; question? }
 * interface FormPreview { url?; total; fillable; locked; entries; questions; submit: false }
 * interface FillOutcome { filled; skipped; total; ratio; results; submitted: false }
 *
 * detectFields(root?: ParentNode): FieldDescriptor[]
 * classifyField(field: FieldDescriptor): Classification
 * matchFields(fields, profile: ProfileSchema, opts?): { matches: FieldMatch[]; questions: MatchQuestion[] }
 * buildPreview(matches, opts?): FormPreview
 * fillForm(matches, opts?, root?): Promise<FillOutcome>          // never submits
 * // END INTERFACE FOR INTEGRATION
 */
import type { FieldVisibility, ProfileSchema, VaultAPI } from '@diggy/shared';
import type { ResumeData } from './resume.js';

/** Semantic field kinds the matcher understands. */
export type FieldKind =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'dob'
  | 'address'
  | 'city'
  | 'state'
  | 'country'
  | 'postalCode'
  | 'college'
  | 'degree'
  | 'semester'
  | 'skills'
  | 'github'
  | 'linkedin'
  | 'portfolio'
  | 'leetcode'
  | 'resumeFile'
  | 'workType'
  | 'noticePeriod'
  | 'expectedCtc'
  | 'education'
  | 'experience'
  | 'projects'
  | 'certifications'
  | 'customAnswer'
  | 'unknown';

/** A detected form control. `element` never leaves the page. */
export interface FieldDescriptor {
  id: string;
  tag: 'input' | 'textarea' | 'select' | 'contenteditable';
  type?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  autocomplete?: string;
  required?: boolean;
  options?: string[];
  /** The live element (present only when detected from a DOM). */
  element?: HTMLElement;
}

export interface Classification {
  kind: FieldKind;
  /** 0..1. */
  confidence: number;
  /** Which signals produced the verdict (debug/tests). */
  basis: string[];
}

export interface FillInstruction {
  fieldId: string;
  kind: FieldKind;
  /**
   * What to write into the field. For a locked field this is the
   * `{{LOCKED:key}}` token — the plaintext is released only at fill time by the
   * vault's per-use approval gate.
   */
  value: string;
  locked: boolean;
  /** The vault field key this value came from, when applicable. */
  profileKey?: string;
  confidence: number;
  source: 'vault' | 'saved-answer';
}

export interface MatchQuestion {
  fieldId: string;
  label: string;
  reason: string;
  /** Candidate kinds the human can choose between. */
  options: FieldKind[];
}

export interface FieldMatch {
  field: FieldDescriptor;
  classification: Classification;
  instruction?: FillInstruction;
  question?: MatchQuestion;
}

export interface PreviewEntry {
  fieldId: string;
  label: string;
  kind: FieldKind;
  /** Plaintext for shared fields; the `{{LOCKED:key}}` token for locked ones. */
  value: string;
  locked: boolean;
  confidence: number;
  source: 'vault' | 'saved-answer';
}

export interface FormPreview {
  url?: string;
  /** Fillable text/select controls considered. */
  total: number;
  /** Controls with a ready instruction. */
  fillable: number;
  /** Of the fillable, how many are locked (shown as tokens). */
  locked: number;
  entries: PreviewEntry[];
  /** Controls that need a human decision before filling. */
  questions: MatchQuestion[];
  /** Always false — the preview never submits. */
  submit: false;
}

export interface FillFieldResult {
  fieldId: string;
  kind: FieldKind;
  /** The value written (token for locked fields). */
  value: string;
  locked: boolean;
  filled: boolean;
  skippedReason?: string;
}

export interface FillOutcome {
  filled: number;
  skipped: number;
  total: number;
  /** filled / total, 0 when there are no fields. */
  ratio: number;
  results: FillFieldResult[];
  /** Always false — no fill routine ever submits. */
  submitted: false;
}

/** A pattern → answer rule from the vault's saved-answers library. */
export interface SavedAnswer {
  pattern: string;
  answer: string;
}

export interface MatchOptions {
  /** Minimum confidence to accept a classification. Default 0.5. */
  minConfidence?: number;
  /** If the runner-up is within this margin, ask instead of guessing. Default 0.15. */
  ambiguityMargin?: number;
  /** Saved-answer rules used as a fallback. */
  savedAnswers?: SavedAnswer[];
  /** Résumé sections (from the decrypted vault) for education/experience/projects. */
  resume?: ResumeData;
}

export interface PreviewOptions {
  url?: string;
}

export interface FillOptions {
  /** Compute the outcome without touching the DOM. Default false. */
  dryRun?: boolean;
  /** The vault used to resolve locked tokens at fill time. */
  vault?: VaultAPI;
  /** Scope used to resolve elements when a descriptor has no live reference. */
  root?: ParentNode;
}

/** Re-exported for consumers that build previews from a vault profile. */
export type { ProfileSchema, VaultAPI, FieldVisibility };
