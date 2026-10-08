/**
 * `@diggy/activity` — redaction pass for the Activity Center.
 *
 * Safety rule (never relaxed): locked Vault plaintext must never reach an
 * activity event. Every field that flows into `ActivityLog.record()` passes
 * through `redactInput()` first, which replaces known locked/sensitive values
 * with their `{{LOCKED:key}}` tokens.
 *
 * // INTERFACE FOR INTEGRATION
 * lockedToken(key: string): string                       // "{{LOCKED:key}}"
 * interface LockedSecret { key: string; value: string }   // value "" = key-based only
 * type SecretsInput = Record<string, string> | LockedSecret[] | (() => Record<string, string> | LockedSecret[])
 * createRedactor(secrets?: SecretsInput): Redactor
 * interface Redactor {
 *   redact<T extends RedactableInput>(input: T): T;      // title / detail / meta scrubbed
 *   containsPlaintext(value: unknown): boolean;           // test/inspection helper
 * }
 * interface RedactableInput { title: string; detail?: string; meta?: Record<string, string> }
 * // END INTERFACE FOR INTEGRATION
 */

export interface LockedSecret {
  /** Vault field key, e.g. `"aadhaar"`. */
  key: string;
  /**
   * The locked plaintext to scrub. An empty string means "key-based only":
   * any meta entry stored under this key is replaced by its token even when
   * the plaintext is unknown (vault locked).
   */
  value: string;
}

export type SecretsInput =
  | Record<string, string>
  | LockedSecret[]
  | (() => Record<string, string> | LockedSecret[]);

export interface RedactableInput {
  title: string;
  detail?: string;
  meta?: Record<string, string>;
}

/** The exact placeholder consumers see for a locked field. Mirrors `@diggy/vault`. */
export function lockedToken(key: string): string {
  return `{{LOCKED:${key}}}`;
}

const TOKEN_KEY_RE = /\{\{LOCKED:([^}]+)\}\}/g;

/** If `value` is exactly a locked token, returns the key it encodes; otherwise `null`. */
export function parseLockedToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\{\{LOCKED:([^}]+)\}\}$/.exec(value);
  return match ? (match[1] as string) : null;
}

export interface Redactor {
  redact<T extends RedactableInput>(input: T): T;
  containsPlaintext(value: unknown): boolean;
}

function normalizeSecrets(input: SecretsInput | undefined): LockedSecret[] {
  if (!input) return [];
  const resolved = typeof input === "function" ? input() : input;
  const list: LockedSecret[] = Array.isArray(resolved)
    ? resolved
    : Object.entries(resolved).map(([key, value]) => ({ key, value }));
  return list.filter((secret) => typeof secret.key === "string" && secret.key.length > 0);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a redactor over the given locked secrets. The secrets provider is
 * re-read on every `redact()` call so lock/unlock transitions take effect
 * without rebuilding the log.
 */
export function createRedactor(secrets?: SecretsInput): Redactor {
  const containsPlaintext = (value: unknown): boolean => {
    if (typeof value !== "string" || value.length === 0) return false;
    for (const secret of normalizeSecrets(secrets)) {
      if (secret.value && value.includes(secret.value)) return true;
    }
    return false;
  };

  const scrubText = (text: string, list: LockedSecret[]): string => {
    let out = text;
    // Longest values first so overlapping secrets tokenize to the outer key.
    const ordered = [...list]
      .filter((secret) => secret.value.length > 0)
      .sort((a, b) => b.value.length - a.value.length);
    for (const secret of ordered) {
      if (!out.includes(secret.value)) continue;
      out = out.replace(new RegExp(escapeRegExp(secret.value), "g"), lockedToken(secret.key));
    }
    return out;
  };

  const redact = <T extends RedactableInput>(input: T): T => {
    const list = normalizeSecrets(secrets);
    if (list.length === 0) return input;
    const byKey = new Map(list.map((secret) => [secret.key, secret] as const));

    let meta = input.meta;
    if (meta) {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(meta)) {
        const known = byKey.get(key);
        if (typeof value === "string" && parseLockedToken(value) !== null) {
          // Already a token — never touch it.
          next[key] = value;
        } else if (known && (known.value === "" || value === known.value)) {
          // Key-based redaction: a meta entry stored under a locked key is
          // sensitive even when the exact plaintext is unknown.
          next[key] = lockedToken(key);
        } else {
          next[key] = typeof value === "string" ? scrubText(value, list) : value;
        }
      }
      meta = next;
    }

    return {
      ...input,
      title: scrubText(input.title, list),
      detail: input.detail === undefined ? undefined : scrubText(input.detail, list),
      meta,
    };
  };

  return { redact, containsPlaintext };
}

/** Collects every `{{LOCKED:key}}` token key present in a value. */
export function findTokenKeys(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const keys: string[] = [];
  TOKEN_KEY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_KEY_RE.exec(value)) !== null) {
    keys.push(match[1] as string);
  }
  return keys;
}
