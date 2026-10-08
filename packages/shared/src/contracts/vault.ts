/**
 * Vault contract — encrypted local profile + locked-field tokenization.
 * Locked plaintext never leaves the device; consumers only ever see tokens.
 * Owning worker: forms-vault (`packages/vault`, `packages/forms`).
 */

export type FieldVisibility = "shared" | "locked";

export interface VaultField<T = string> {
  key: string;
  label: string;
  value: T;
  visibility: FieldVisibility;
}

export interface ProfileSchema {
  fullName?: VaultField;
  email?: VaultField;
  phone?: VaultField;
  location?: VaultField;
  college?: VaultField;
  degree?: VaultField;
  semester?: VaultField;
  skills?: VaultField<string[]>;
  links?: VaultField<Record<string, string>>;
  resumeRef?: VaultField;
  custom?: VaultField[];
}

export interface VaultAPI {
  /** Shared values in plaintext; locked values are tokenized. */
  getProfile(): Promise<ProfileSchema>;
  /** Token placeholder for a locked field, e.g. "{{LOCKED:aadhaar}}". */
  tokenFor(key: string): string;
  /** Resolve a token in-page at fill time, after per-use approval; never logged. */
  resolveLocal(key: string): Promise<string | null>;
  setVisibility(key: string, visibility: FieldVisibility): Promise<void>;
}
