/**
 * `@diggy/vault` — the `VaultAPI` implementation (DIGGY 2.0 contract).
 *
 * // INTERFACE FOR INTEGRATION
 * // Contract: @diggy/shared  packages/shared/src/contracts/vault.ts
 * interface VaultOptions {
 *   vaultId?: string;                 // default "diggy-profile"
 *   autoLockMinutes?: number;         // <= 0 disables; default 15
 *   approval?: ApprovalGate;          // per-use gate for locked values (default: deny)
 *   onAudit?: (event: AuditEvent) => void;  // NEVER receives plaintext
 *   onLock?: () => void;
 *   onUnlock?: () => void;
 * }
 * type ApprovalGate = (r: { key: string; label: string; reason: string }) => boolean | Promise<boolean>;
 * interface AuditEvent { type: AuditEventType; key?: string; visibility?: FieldVisibility; at: number }
 *
 * class Vault implements VaultAPI {
 *   static create(store: StorageAdapter, passphrase: string, data: VaultData, opts?: VaultOptions): Promise<Vault>
 *   static open(store: StorageAdapter, passphrase: string, opts?: VaultOptions): Promise<Vault>
 *   unlock(passphrase: string): Promise<void>
 *   lock(): void
 *   readonly isUnlocked: boolean
 *   // VaultAPI:
 *   getProfile(): Promise<ProfileSchema>            // locked fields are tokenized
 *   tokenFor(key: string): string                   // "{{LOCKED:key}}"
 *   resolveLocal(key: string): Promise<string|null> // unlocked + per-use approval, never logged
 *   setVisibility(key: string, visibility: FieldVisibility): Promise<void>
 *   // extras:
 *   setField(field: StoredField): Promise<void>
 *   listFieldKeys(): Promise<string[]>
 *   onChange(listener: (unlocked: boolean) => void): () => void
 * }
 * // END INTERFACE FOR INTEGRATION
 */
import type { FieldVisibility, ProfileSchema, VaultAPI } from '@diggy/shared';
import type { KdfParams } from './crypto.js';
import { VaultLock, VaultLockedError, initializeVault } from './lock.js';
import {
  exposeField,
  lockedToken,
  parseVaultData,
  type FieldValue,
  type StoredField,
  type VaultData,
} from './profile.schema.js';
import type { StorageAdapter } from './store.js';

/** A request shown to the human before a locked value is released for one fill. */
export interface ApprovalRequest {
  key: string;
  label: string;
  reason: string;
}

/** Per-use approval. Returning `false` (or throwing) denies the release. */
export type ApprovalGate = (request: ApprovalRequest) => boolean | Promise<boolean>;

export type AuditEventType =
  | 'unlock'
  | 'lock'
  | 'resolve-approved'
  | 'resolve-denied'
  | 'set-visibility'
  | 'field-set';

/** Audit records carry only keys/visibility — never a value. */
export interface AuditEvent {
  type: AuditEventType;
  key?: string;
  visibility?: FieldVisibility;
  at: number;
}

export type AuditSink = (event: AuditEvent) => void;

export interface VaultOptions {
  vaultId?: string;
  autoLockMinutes?: number;
  /** Argon2id params for a newly-created vault (tests use cheap params). */
  params?: Partial<KdfParams>;
  /** Defaults to always-deny, so a locked value can never leak without an explicit gate. */
  approval?: ApprovalGate;
  onAudit?: AuditSink;
  onLock?: () => void;
  onUnlock?: () => void;
}

/** Stored keys that map 1:1 onto the contract's `ProfileSchema`. */
const SCALAR_KEYS = [
  'fullName',
  'email',
  'phone',
  'location',
  'college',
  'degree',
  'semester',
  'resumeRef',
] as const;

const KNOWN_KEYS = new Set<string>([...SCALAR_KEYS, 'skills', 'links']);

export class Vault implements VaultAPI {
  private readonly vaultLock: VaultLock;
  private readonly approval: ApprovalGate | undefined;
  private readonly onAudit: AuditSink | undefined;
  private readonly onUnlock: (() => void) | undefined;
  private readonly listeners = new Set<(unlocked: boolean) => void>();

  private constructor(store: StorageAdapter, options: VaultOptions) {
    this.approval = options.approval;
    this.onAudit = options.onAudit;
    this.onUnlock = options.onUnlock;
    this.vaultLock = new VaultLock(store, {
      vaultId: options.vaultId,
      autoLockMinutes: options.autoLockMinutes,
      onLock: () => {
        options.onLock?.();
        this.audit({ type: 'lock' });
        this.emit(false);
      },
    });
  }

  /** Creates (or overwrites) the encrypted vault, then unlocks it. */
  static async create(
    store: StorageAdapter,
    passphrase: string,
    data: VaultData,
    options: VaultOptions = {},
  ): Promise<Vault> {
    await initializeVault(store, passphrase, data, {
      vaultId: options.vaultId,
      params: options.params,
    });
    return Vault.open(store, passphrase, options);
  }

  /** Opens an existing encrypted vault. Rejects on a wrong passphrase. */
  static async open(
    store: StorageAdapter,
    passphrase: string,
    options: VaultOptions = {},
  ): Promise<Vault> {
    const vault = new Vault(store, options);
    await vault.unlock(passphrase);
    return vault;
  }

  /** Whether the vault is currently unlocked. */
  get isUnlocked(): boolean {
    return this.vaultLock.isUnlocked;
  }

  /** The storage id this vault is persisted under. */
  get id(): string {
    return this.vaultLock.id;
  }

  /** Decrypts the vault. Rejects on a wrong passphrase and stays locked. */
  async unlock(passphrase: string): Promise<void> {
    await this.vaultLock.unlock(passphrase);
    this.audit({ type: 'unlock' });
    this.onUnlock?.();
    this.emit(true);
  }

  /** Locks the vault, wiping the in-memory key and payload. */
  lock(): void {
    this.vaultLock.lock();
  }

  /** Subscribe to lock/unlock transitions. Returns an unsubscribe function. */
  onChange(listener: (unlocked: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /* ---------------------------------------------------------------- *
   * VaultAPI
   * ---------------------------------------------------------------- */

  /**
   * The profile for consumers. Shared fields carry plaintext; locked fields carry
   * only a `{{LOCKED:key}}` token. This never calls `resolveLocal()`.
   */
  async getProfile(): Promise<ProfileSchema> {
    const data = this.vaultLock.getData();
    const profile: ProfileSchema = {};

    for (const key of SCALAR_KEYS) {
      const field = findField(data, key);
      if (field) profile[key] = exposeField<string>(field);
    }

    const skills = findField(data, 'skills');
    if (skills) profile.skills = exposeField<string[]>(skills);
    const links = findField(data, 'links');
    if (links) profile.links = exposeField<Record<string, string>>(links);

    const custom = data.fields
      .filter((field) => !KNOWN_KEYS.has(field.key))
      .map((field) => exposeField<string>(field));
    if (custom.length > 0) profile.custom = custom;

    return profile;
  }

  /** Token placeholder for a locked field, e.g. `{{LOCKED:aadhaar}}`. */
  tokenFor(key: string): string {
    return lockedToken(key);
  }

  /**
   * Resolve a token in-page at fill time, after per-use approval; never logged.
   * Returns `null` when locked, unknown, denied, or when the gate throws.
   */
  async resolveLocal(key: string): Promise<string | null> {
    if (!this.vaultLock.isUnlocked) return null;
    let field: StoredField | undefined;
    try {
      field = this.vaultLock.getField(key);
    } catch (error) {
      if (error instanceof VaultLockedError) return null;
      throw error;
    }
    if (!field) return null;

    const gate = this.approval;
    if (!gate) {
      this.audit({ type: 'resolve-denied', key });
      return null;
    }

    let approved = false;
    try {
      approved = await gate({ key, label: field.label, reason: 'fill-form' });
    } catch {
      approved = false;
    }
    if (!approved) {
      this.audit({ type: 'resolve-denied', key });
      return null;
    }

    this.audit({ type: 'resolve-approved', key });
    return stringifyValue(field.value);
  }

  /** Flip a field between `shared` and `locked`, then re-encrypt. */
  async setVisibility(key: string, visibility: FieldVisibility): Promise<void> {
    const data = this.vaultLock.getData();
    const field = findField(data, key);
    if (field) {
      field.visibility = visibility;
    } else {
      data.fields.push({ key, label: '', value: '', visibility });
    }
    await this.vaultLock.setData(data);
    this.audit({ type: 'set-visibility', key, visibility });
  }

  /* ---------------------------------------------------------------- *
   * Extras
   * ---------------------------------------------------------------- */

  /** Insert or replace a stored field, then re-encrypt. */
  async setField(field: StoredField): Promise<void> {
    const data = this.vaultLock.getData();
    const index = data.fields.findIndex((f) => f.key === field.key);
    if (index >= 0) data.fields[index] = field;
    else data.fields.push(field);
    await this.vaultLock.setData(data);
    this.audit({ type: 'field-set', key: field.key, visibility: field.visibility });
  }

  /** The stored field keys, in order. */
  async listFieldKeys(): Promise<string[]> {
    return this.vaultLock.getData().fields.map((f) => f.key);
  }

  /* ---------------------------------------------------------------- */

  private audit(event: Omit<AuditEvent, 'at'>): void {
    this.onAudit?.({ ...event, at: Date.now() });
  }

  private emit(unlocked: boolean): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(unlocked);
      } catch {
        /* a broken listener must never break the vault */
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function findField(data: VaultData, key: string): StoredField | undefined {
  return data.fields.find((field) => field.key === key);
}

/** Coerce a field value to the string `resolveLocal()` promises. */
function stringifyValue(value: FieldValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Parses an unknown payload into `VaultData` (used by callers building vaults). */
export function toVaultData(input: unknown): VaultData {
  return parseVaultData(input);
}
