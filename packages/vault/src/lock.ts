/**
 * `@diggy/vault` — lock / unlock lifecycle (ported from the seed vault).
 *
 * `VaultLock` owns the in-memory decrypted `VaultData` and the derived AES key.
 * It loads + decrypts a blob on `unlock`, re-encrypts on `setData`, and auto-locks
 * after a configurable period of inactivity.
 *
 * Security notes:
 *  - The derived key is held only as a non-extractable `CryptoKey` in memory and is
 *    never handed to a `StorageAdapter` (which only ever sees ciphertext).
 *  - `getData()` never touches the network and is only ever called by `Vault`, which
 *    is responsible for tokenizing locked fields before they reach a consumer.
 */
import {
  base64ToBytes,
  decryptWithKey,
  deriveAesKey,
  encryptJson,
  encryptWithKey,
  type EncryptedBlob,
  type KdfParams,
} from './crypto.js';
import { parseVaultData, type StoredField, type VaultData } from './profile.schema.js';
import type { StorageAdapter } from './store.js';

/** Base class for all vault errors. */
export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

/** Thrown when an operation requires an unlocked vault. */
export class VaultLockedError extends VaultError {
  constructor(message = 'Vault is locked') {
    super(message);
    this.name = 'VaultLockedError';
  }
}

/** Thrown when no encrypted blob exists for the requested vault id. */
export class VaultNotFoundError extends VaultError {
  constructor(message = 'No vault found') {
    super(message);
    this.name = 'VaultNotFoundError';
  }
}

export interface VaultLockOptions {
  /** Minutes of inactivity before the vault auto-locks. `<= 0` disables auto-lock. Default: 15. */
  autoLockMinutes?: number;
  /** Storage key for this vault. Default: `"profile"`. */
  vaultId?: string;
  /** Invoked whenever the vault transitions from unlocked to locked. */
  onLock?: () => void;
}

export const DEFAULT_AUTO_LOCK_MINUTES = 15;
const DEFAULT_VAULT_ID = 'diggy-profile';

export class VaultLock {
  private readonly store: StorageAdapter;
  private readonly autoLockMinutes: number;
  private readonly vaultId: string;
  private readonly onLock: (() => void) | undefined;

  // In-memory-only session state.
  private key: CryptoKey | null = null;
  private salt: Uint8Array | null = null;
  private kdfParams: KdfParams | null = null;
  private data: VaultData | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(store: StorageAdapter, options: VaultLockOptions = {}) {
    this.store = store;
    this.autoLockMinutes = options.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES;
    this.vaultId = options.vaultId ?? DEFAULT_VAULT_ID;
    this.onLock = options.onLock;
  }

  /** Whether the vault is currently unlocked (key present in memory). */
  get isUnlocked(): boolean {
    return this.key !== null;
  }

  /** The storage id this vault is persisted under. */
  get id(): string {
    return this.vaultId;
  }

  /**
   * Loads the encrypted blob and decrypts it with `passphrase`.
   * Throws `VaultNotFoundError` if no blob exists, and rejects (AES-GCM auth
   * failure) if the passphrase is wrong. On failure the vault stays locked.
   */
  async unlock(passphrase: string): Promise<void> {
    this.clearTimer();
    const blob = await this.store.load(this.vaultId);
    if (!blob) {
      throw new VaultNotFoundError(`No vault found for id "${this.vaultId}"`);
    }
    const salt = base64ToBytes(blob.salt);
    const key = await deriveAesKey(passphrase, salt, blob.params);
    // Decrypt first (this authenticates the passphrase) before mutating state.
    const decrypted = await decryptWithKey<unknown>(key, blob);
    this.key = key;
    this.salt = salt;
    this.kdfParams = { ...blob.params };
    this.data = parseVaultData(decrypted);
    this.scheduleAutoLock();
  }

  /** Locks the vault, wiping the in-memory key and payload. */
  lock(): void {
    const wasUnlocked = this.key !== null;
    this.key = null;
    this.salt = null;
    this.kdfParams = null;
    this.data = null;
    this.clearTimer();
    if (wasUnlocked) {
      this.onLock?.();
    }
  }

  /** Resets the inactivity timer (call on user activity). No-op when locked. */
  touch(): void {
    if (this.key === null) return;
    this.scheduleAutoLock();
  }

  /** Stops the timer and wipes state without firing `onLock`. */
  dispose(): void {
    this.key = null;
    this.salt = null;
    this.kdfParams = null;
    this.data = null;
    this.clearTimer();
  }

  /** Returns a defensive copy of the decrypted payload. Throws when locked. */
  getData(): VaultData {
    const { data } = this.assertUnlocked();
    this.touch();
    return structuredClone(data);
  }

  /** The plaintext stored field for `key`, or `undefined`. Throws when locked. */
  getField(key: string): StoredField | undefined {
    const { data } = this.assertUnlocked();
    this.touch();
    const field = data.fields.find((f) => f.key === key);
    return field === undefined ? undefined : structuredClone(field);
  }

  /** Validates + re-encrypts the payload under the existing key and persists it. */
  async setData(data: VaultData): Promise<void> {
    const { key, salt, params } = this.assertUnlocked();
    const normalized = parseVaultData(data);
    const blob = await encryptWithKey(key, normalized, salt, params);
    await this.store.save(this.vaultId, blob);
    this.data = normalized;
    this.touch();
  }

  /* ---------------------------------------------------------------- */

  private assertUnlocked(): { key: CryptoKey; salt: Uint8Array; params: KdfParams; data: VaultData } {
    const { key, salt, kdfParams, data } = this;
    if (key === null || salt === null || kdfParams === null || data === null) {
      throw new VaultLockedError();
    }
    return { key, salt, params: kdfParams, data };
  }

  private scheduleAutoLock(): void {
    this.clearTimer();
    const ms = this.autoLockMinutes * 60_000;
    if (!Number.isFinite(ms) || ms <= 0) return; // auto-lock disabled
    this.timer = setTimeout(() => {
      this.lock();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export interface InitializeVaultOptions {
  vaultId?: string;
  params?: Partial<KdfParams>;
}

/**
 * Creates (or overwrites) the on-disk encrypted vault for `data`.
 * Returns the ciphertext blob that was written — handy for tests.
 */
export async function initializeVault(
  store: StorageAdapter,
  passphrase: string,
  data: VaultData,
  options: InitializeVaultOptions = {},
): Promise<EncryptedBlob> {
  const vaultId = options.vaultId ?? DEFAULT_VAULT_ID;
  const normalized = parseVaultData(data);
  const blob = await encryptJson(normalized, passphrase, options.params);
  await store.save(vaultId, blob);
  return blob;
}
