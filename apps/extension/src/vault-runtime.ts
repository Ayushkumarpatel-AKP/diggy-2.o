/**
 * Vault runtime — the extension-side factory over `@diggy/vault`.
 *
 * The background service worker composes this (it owns the approval prompts and
 * the panel state); this module stays a leaf and never imports the background or
 * the agent runtime. Everything crypto/storage lives in `@diggy/vault` (Argon2id
 * KDF + AES-256-GCM, auto-lock, tokenizing `getProfile`, deny-by-default
 * `resolveLocal`) — this file only wires an `IndexedDbAdapter` and the lifecycle.
 *
 * Design notes:
 * - `status()` never throws: with no IndexedDB (a plain node test) or a corrupt
 *   blob it reports `{ exists: false, unlocked: false }`.
 * - Every `indexedDB` access goes through `indexedDbAvailable()` and the adapter is
 *   constructed lazily, so the module still *imports* under node.
 * - `Vault` takes its approval gate at construction, but `resolve()` receives the
 *   caller's per-use `approve` callback. The two are bridged with a single-slot
 *   `pendingApproval`: `resolve()` installs the callback just before
 *   `resolveLocal()` awaits the gate and clears it after. A missing gate denies.
 *
 * // INTERFACE FOR INTEGRATION
 * //   interface VaultRuntimeStatus { exists: boolean; unlocked: boolean }
 * //   interface VaultRuntime {
 * //     status(): Promise<VaultRuntimeStatus>;
 * //     create(passphrase: string, data: VaultData): Promise<void>;
 * //     unlock(passphrase: string): Promise<boolean>;
 * //     lock(): void;
 * //     profile(): Promise<ProfileSchema>;
 * //     resolve(key: string, approve: () => boolean | Promise<boolean>): Promise<string | null>;
 * //     onChange(listener: (unlocked: boolean) => void): () => void;
 * //   }
 * //   function createVaultRuntime(): VaultRuntime;
 * // END INTERFACE FOR INTEGRATION
 */
import type { ProfileSchema } from "@diggy/shared";
// `apps/extension/package.json` is core-owned, so — like `field-mapper.ts` reaches
// `@diggy/forms` — this module reaches the real `@diggy/vault` by relative path.
import {
  IndexedDbAdapter,
  Vault,
  type VaultData,
  type VaultOptions,
} from "@diggy/vault";

export interface VaultRuntimeStatus {
  exists: boolean;
  unlocked: boolean;
}

export interface VaultRuntime {
  status(): Promise<VaultRuntimeStatus>;
  create(passphrase: string, data: VaultData): Promise<void>;
  unlock(passphrase: string): Promise<boolean>;
  lock(): void;
  profile(): Promise<ProfileSchema>;
  resolve(key: string, approve: () => boolean | Promise<boolean>): Promise<string | null>;
  onChange(listener: (unlocked: boolean) => void): () => void;
}

/** Matches the `@diggy/vault` default, so the runtime and the package agree on the id. */
const DEFAULT_VAULT_ID = "diggy-profile";

/** Whether IndexedDB exists in this host (false in a plain node test). */
function indexedDbAvailable(): boolean {
  const scope = globalThis as unknown as { indexedDB?: unknown };
  return typeof scope.indexedDB !== "undefined";
}

export function createVaultRuntime(): VaultRuntime {
  let adapter: IndexedDbAdapter | null = null;
  let vault: Vault | null = null;
  let pendingApproval: (() => boolean | Promise<boolean>) | null = null;
  const listeners = new Set<(unlocked: boolean) => void>();

  function emit(unlocked: boolean): void {
    for (const listener of [...listeners]) {
      try {
        listener(unlocked);
      } catch {
        /* a broken listener must never break the vault */
      }
    }
  }

  /** The storage adapter, or `undefined` when IndexedDB is unavailable. */
  function store(): IndexedDbAdapter | undefined {
    if (!indexedDbAvailable()) return undefined;
    if (!adapter) adapter = new IndexedDbAdapter();
    return adapter;
  }

  /**
   * Options shared by `create` / `open`. The approval gate resolves the caller's
   * per-use callback (installed by `resolve()`) and denies when there is none.
   */
  function options(): VaultOptions {
    return {
      vaultId: DEFAULT_VAULT_ID,
      approval: () => {
        const gate = pendingApproval;
        if (!gate) return false;
        try {
          return gate();
        } catch {
          return false;
        }
      },
    };
  }

  /** Adopt a fresh `Vault` instance and forward its lock/unlock transitions. */
  function adopt(instance: Vault): void {
    vault = instance;
    instance.onChange((unlocked) => emit(unlocked));
  }

  async function status(): Promise<VaultRuntimeStatus> {
    const backing = store();
    if (!backing) return { exists: false, unlocked: false };
    try {
      const blob = await backing.load(DEFAULT_VAULT_ID);
      return { exists: Boolean(blob), unlocked: vault?.isUnlocked ?? false };
    } catch {
      return { exists: false, unlocked: false };
    }
  }

  async function create(passphrase: string, data: VaultData): Promise<void> {
    const backing = store();
    if (!backing) throw new Error("Vault storage is unavailable in this environment");
    const instance = await Vault.create(backing, passphrase, data, options());
    adopt(instance);
    emit(true);
  }

  async function unlock(passphrase: string): Promise<boolean> {
    const backing = store();
    if (!backing) return false;
    try {
      if (vault) {
        await vault.unlock(passphrase);
      } else {
        adopt(await Vault.open(backing, passphrase, options()));
      }
      emit(true);
      return true;
    } catch {
      return false;
    }
  }

  function lock(): void {
    vault?.lock();
  }

  async function profile(): Promise<ProfileSchema> {
    if (!vault || !vault.isUnlocked) return {};
    try {
      return await vault.getProfile();
    } catch {
      return {};
    }
  }

  async function resolve(
    key: string,
    approve: () => boolean | Promise<boolean>,
  ): Promise<string | null> {
    if (!vault || !vault.isUnlocked) return null;
    pendingApproval = approve;
    try {
      return await vault.resolveLocal(key);
    } catch {
      return null;
    } finally {
      pendingApproval = null;
    }
  }

  function onChange(listener: (unlocked: boolean) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { status, create, unlock, lock, profile, resolve, onChange };
}
