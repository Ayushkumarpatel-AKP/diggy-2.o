/**
 * field-mapper.ts — binds the Smart Form Filling pipeline (`@diggy/forms`) to the
 * encrypted Vault profile for the extension.
 *
 * Two surfaces:
 *  1. `buildHeuristicPlan` — the deterministic, offline rule table ported from the
 *     seed repo. No LLM, no DOM writes; useful when nothing else is configured.
 *  2. `planFromProfile` / `planPage` — the full detect -> classify -> match ->
 *     preview pipeline. Locked fields are carried as `{{LOCKED:key}}` tokens only;
 *     the plaintext is resolved later, at fill time, by the vault's approval gate.
 *
 * NOTE: `apps/extension/package.json` is core-owned, so this module reaches
 * `@diggy/forms` by relative path (the same approach the UI worker used for
 * `@diggy/ui`). When core next touches the package manifest, adding
 * `"@diggy/forms": "workspace:*"` lets these become bare imports.
 *
 * // INTERFACE FOR INTEGRATION
 * import type { ProfileSchema, VaultAPI } from "@diggy/shared";
 * import type { FieldDescriptor, FillInstruction, FieldMatch, MatchQuestion, FormPreview } from "@diggy/forms";
 * buildHeuristicPlan(fields: FieldDescriptor[], profile: ProfileSchema): FillInstruction[]
 * planFromProfile(fields, profile, options?): { matches; questions; preview }
 * planPage(root?, options?): Promise<{ fields; matches; questions; preview }>   // uses document
 * fillPlanned(matches, opts?): Promise<FillOutcome>                              // never submits
 * // END INTERFACE FOR INTEGRATION
 */
import type { ProfileSchema, VaultAPI } from "@diggy/shared";
import {
  buildPreview,
  detectFields,
  dryRun,
  fillForm,
  matchFields,
} from "../../../packages/forms/src/index.js";
import type {
  FieldDescriptor,
  FieldMatch,
  FillInstruction,
  FillOutcome,
  FormPreview,
  MatchOptions,
  MatchQuestion,
} from "../../../packages/forms/src/index.js";

/* ------------------------------------------------------------------ *
 * Offline heuristic rule table (ported from the seed field-mapper)
 * ------------------------------------------------------------------ */

interface Rule {
  key: string;
  test: RegExp;
  value: (profile: ProfileSchema) => string | undefined;
}

function top(profile: ProfileSchema, key: keyof ProfileSchema): string | undefined {
  const field = profile[key];
  if (!field || typeof field !== "object" || !("value" in field)) return undefined;
  const value = field.value;
  return typeof value === "string" ? value : undefined;
}

function customValue(profile: ProfileSchema, key: string): string | undefined {
  const field = (profile.custom ?? []).find((candidate) => candidate.key === key);
  const value = field?.value;
  return typeof value === "string" ? value : undefined;
}

function link(profile: ProfileSchema, name: string): string | undefined {
  const links = profile.links?.value;
  if (!links || typeof links !== "object") return undefined;
  return links[name] ?? (name === "portfolio" ? links["website"] : undefined);
}

const RULES: Rule[] = [
  { key: "fullName", test: /(full[\s_-]?name|^\s*name\s*$|your name|applicant name)/i, value: (p) => top(p, "fullName") },
  { key: "email", test: /(e-?mail)/i, value: (p) => top(p, "email") },
  { key: "phone", test: /(phone|mobile|contact[\s_-]?no|whatsapp)/i, value: (p) => top(p, "phone") },
  { key: "dob", test: /(dob|birth)/i, value: (p) => customValue(p, "dob") },
  { key: "address", test: /(^address$|address[\s_-]?line|street|residence)/i, value: (p) => customValue(p, "address") },
  { key: "city", test: /(city|town|locality)/i, value: (p) => customValue(p, "city") },
  { key: "state", test: /(state|province|region)/i, value: (p) => customValue(p, "state") },
  { key: "country", test: /(country|nationality)/i, value: (p) => customValue(p, "country") },
  { key: "postalCode", test: /(postal|zip|pin[\s_-]?code|pincode)/i, value: (p) => customValue(p, "postalCode") },
  { key: "college", test: /(college|university|institution|school)/i, value: (p) => top(p, "college") },
  { key: "degree", test: /(degree|course|program)/i, value: (p) => top(p, "degree") },
  { key: "semester", test: /(semester|year of study)/i, value: (p) => top(p, "semester") },
  { key: "github", test: /github/i, value: (p) => link(p, "github") },
  { key: "linkedin", test: /linked[\s_-]?in/i, value: (p) => link(p, "linkedin") },
  { key: "portfolio", test: /(portfolio|website|personal[\s_-]?site|homepage)/i, value: (p) => link(p, "portfolio") },
  { key: "leetcode", test: /leetcode/i, value: (p) => link(p, "leetcode") },
  { key: "workType", test: /(work[\s_-]?type|remote|hybrid|onsite)/i, value: (p) => customValue(p, "workType") },
  { key: "noticePeriod", test: /(notice[\s_-]?period)/i, value: (p) => customValue(p, "noticePeriod") },
  { key: "expectedCtc", test: /(expected[\s_-]?ctc|expected[\s_-]?salary|current[\s_-]?ctc)/i, value: (p) => customValue(p, "expectedCtc") },
];

function fieldText(field: FieldDescriptor): string {
  return `${field.label ?? ""} ${field.ariaLabel ?? ""} ${field.placeholder ?? ""} ${field.name ?? ""}`.trim();
}

/** Best-effort fill plan from the offline rule table. Values may be locked tokens. */
export function buildHeuristicPlan(fields: FieldDescriptor[], profile: ProfileSchema): FillInstruction[] {
  const instructions: FillInstruction[] = [];
  const used = new Set<string>();

  for (const field of fields) {
    if (field.tag === "select") continue;
    const text = fieldText(field);
    if (!text) continue;

    for (const rule of RULES) {
      if (used.has(rule.key) || !rule.test.test(text)) continue;
      const value = rule.value(profile);
      if (!value) continue;
      instructions.push({
        fieldId: field.id,
        kind: rule.key as FillInstruction["kind"],
        value,
        locked: /^\{\{LOCKED:/.test(value),
        profileKey: rule.key,
        confidence: 0.5,
        source: "vault",
      });
      used.add(rule.key);
      break;
    }
  }

  return instructions;
}

/* ------------------------------------------------------------------ *
 * Full pipeline
 * ------------------------------------------------------------------ */

export interface FieldPlan {
  matches: FieldMatch[];
  questions: MatchQuestion[];
  preview: FormPreview;
}

/** Detect -> classify -> match -> preview against a (tokenized) vault profile. */
export function planFromProfile(
  fields: FieldDescriptor[],
  profile: ProfileSchema,
  options: MatchOptions & { url?: string } = {},
): FieldPlan {
  const { url, ...matchOptions } = options;
  const { matches, questions } = matchFields(fields, profile, matchOptions);
  return { matches, questions, preview: buildPreview(matches, { url }) };
}

/** Detect the current page's fields, read the vault profile, and plan a fill. */
export async function planPage(
  vault: VaultAPI,
  options: MatchOptions & { url?: string; root?: ParentNode } = {},
): Promise<FieldPlan & { fields: FieldDescriptor[] }> {
  const fields = detectFields(options.root);
  const profile = await vault.getProfile();
  const plan = planFromProfile(fields, profile, {
    ...options,
    url: options.url ?? (typeof location !== "undefined" ? location.href : undefined),
  });
  return { fields, ...plan };
}

/** Execute a plan. Never submits — see `@diggy/forms` `fillForm`. */
export function fillPlanned(
  matches: FieldMatch[],
  options: { dryRun?: boolean; vault?: VaultAPI; root?: ParentNode } = {},
): Promise<FillOutcome> {
  return options.dryRun ? dryRun(matches, options) : fillForm(matches, options);
}
