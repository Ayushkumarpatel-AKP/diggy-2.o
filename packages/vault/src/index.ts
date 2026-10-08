/**
 * `@diggy/vault` — public barrel.
 *
 * Encrypted profile vault: Argon2id KDF + AES-256-GCM, IndexedDB storage, an
 * auto-locking in-memory session, and the tokenizing `VaultAPI` surface.
 */
export * from './crypto.js';
export * from './profile.schema.js';
export * from './store.js';
export * from './lock.js';
export * from './vault.js';
