/**
 * `@diggy/vault` — profile schema (adapted from the seed vault to the DIGGY 2.0
 * `VaultAPI` contract in `@diggy/shared`).
 *
 * The vault stores a *keyed field list* plus a résumé section. Each field carries a
 * `visibility` of `"shared"` (plaintext may be shown to consumers) or `"locked"`
 * (consumers only ever see a `{{LOCKED:<key>}}` token; the plaintext is released
 * exclusively through `Vault.resolveLocal()` after per-use approval).
 *
 * `parseVaultData` / `serializeVaultData` are the canonical (de)serialisation helpers.
 */
import { z } from 'zod';
import type { FieldVisibility, VaultField } from '@diggy/shared';

/** Everything a field value may hold: a scalar, a skill list, or a link map. */
export type FieldValue = string | string[] | Record<string, string>;

/** One stored field. `value` is the *plaintext* while at rest in the decrypted vault. */
export interface StoredField {
  key: string;
  label: string;
  value: FieldValue;
  visibility: FieldVisibility;
}

export interface SavedAnswer {
  /** A case-insensitive substring/regex source matched against a field's label. */
  pattern: string;
  answer: string;
}

export interface Project {
  name: string;
  description?: string;
  url?: string;
  tech?: string[];
}

export interface Education {
  institution: string;
  degree?: string;
  field?: string;
  startYear?: string;
  endYear?: string;
  grade?: string;
}

export interface Experience {
  company: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  location?: string;
  description?: string;
}

/** The decrypted vault payload. Never persisted in this form. */
export interface VaultData {
  fields: StoredField[];
  education: Education[];
  experience: Experience[];
  projects: Project[];
  certifications: string[];
  savedAnswers: SavedAnswer[];
}

/* ------------------------------------------------------------------ *
 * Locked-value tokens
 * ------------------------------------------------------------------ */

/** The exact placeholder consumers see for a locked field. */
export function lockedToken(key: string): string {
  return `{{LOCKED:${key}}}`;
}

const LOCKED_TOKEN_RE = /^\{\{LOCKED:([^}]+)\}\}$/;

/** If `value` is a locked token, returns the key it encodes; otherwise `null`. */
export function parseLockedToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = LOCKED_TOKEN_RE.exec(value);
  return match ? (match[1] as string) : null;
}

/** True when `value` is a locked token placeholder. */
export function isLockedToken(value: unknown): boolean {
  return parseLockedToken(value) !== null;
}

/* ------------------------------------------------------------------ *
 * Zod schema
 * ------------------------------------------------------------------ */

export const FieldVisibilitySchema = z.enum(['shared', 'locked']);

const FieldValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.record(z.string()),
]);

export const StoredFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().default(''),
  value: FieldValueSchema,
  visibility: FieldVisibilitySchema.default('shared'),
});

export const SavedAnswerSchema = z.object({
  pattern: z.string().default(''),
  answer: z.string().default(''),
});

export const ProjectSchema = z.object({
  name: z.string().default(''),
  description: z.string().optional(),
  url: z.string().optional(),
  tech: z.array(z.string()).optional(),
});

export const EducationSchema = z.object({
  institution: z.string().default(''),
  degree: z.string().optional(),
  field: z.string().optional(),
  startYear: z.string().optional(),
  endYear: z.string().optional(),
  grade: z.string().optional(),
});

export const ExperienceSchema = z.object({
  company: z.string().default(''),
  role: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  current: z.boolean().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
});

export const VaultDataSchema = z.object({
  fields: z.array(StoredFieldSchema).default([]),
  education: z.array(EducationSchema).default([]),
  experience: z.array(ExperienceSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  certifications: z.array(z.string()).default([]),
  savedAnswers: z.array(SavedAnswerSchema).default([]),
});

/** Parse + validate into a complete `VaultData` (fills defaults for missing sections). */
export function parseVaultData(input: unknown): VaultData {
  return VaultDataSchema.parse(input);
}

/** Non-throwing parse. */
export function safeParseVaultData(input: unknown) {
  return VaultDataSchema.safeParse(input);
}

/** Validate then JSON-serialize for persistence/transport. */
export function serializeVaultData(data: VaultData): string {
  return JSON.stringify(VaultDataSchema.parse(data));
}

/** A complete, empty payload. */
export function emptyVaultData(): VaultData {
  return VaultDataSchema.parse({});
}

/* ------------------------------------------------------------------ *
 * Exposure helpers
 * ------------------------------------------------------------------ */

/**
 * Projects a stored field for a consumer: locked fields have their plaintext
 * replaced by a token; shared fields pass through unchanged.
 */
export function exposeField<T = FieldValue>(field: StoredField): VaultField<T> {
  const value =
    field.visibility === 'locked' ? lockedToken(field.key) : field.value;
  return {
    key: field.key,
    label: field.label,
    value: value as unknown as T,
    visibility: field.visibility,
  };
}
