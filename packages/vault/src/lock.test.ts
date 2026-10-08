import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './store.js';
import { VaultLock, VaultLockedError, VaultNotFoundError, initializeVault } from './lock.js';
import { CHEAP_PARAMS, PII_STRINGS, TEST_PASSPHRASE, sampleVaultData } from './fixtures.js';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function provisioned(): Promise<MemoryAdapter> {
  const store = new MemoryAdapter();
  await initializeVault(store, TEST_PASSPHRASE, sampleVaultData(), { params: CHEAP_PARAMS });
  return store;
}

describe('VaultLock — unlock / lock', () => {
  it('throws when there is no vault to unlock', async () => {
    const lock = new VaultLock(new MemoryAdapter(), { autoLockMinutes: 0 });
    await expect(lock.unlock(TEST_PASSPHRASE)).rejects.toBeInstanceOf(VaultNotFoundError);
    expect(lock.isUnlocked).toBe(false);
  });

  it('rejects a wrong passphrase and stays locked', async () => {
    const lock = new VaultLock(await provisioned(), { autoLockMinutes: 0 });
    await expect(lock.unlock('nope')).rejects.toThrow();
    expect(lock.isUnlocked).toBe(false);
    expect(() => lock.getData()).toThrow(VaultLockedError);
  });

  it('re-encrypts + persists on setData, surviving a lock/unlock cycle', async () => {
    const store = await provisioned();
    const lock = new VaultLock(store, { autoLockMinutes: 0 });
    await lock.unlock(TEST_PASSPHRASE);

    const updated = sampleVaultData();
    const location = updated.fields.find((f) => f.key === 'location');
    if (location) location.value = 'Manchester, UK';

    await lock.setData(updated);

    lock.lock();
    expect(lock.isUnlocked).toBe(false);
    expect(() => lock.getData()).toThrow(VaultLockedError);

    const reopened = new VaultLock(store, { autoLockMinutes: 0 });
    await reopened.unlock(TEST_PASSPHRASE);
    expect(reopened.getData()).toEqual(updated);
  });

  it('refuses setData while locked', async () => {
    const lock = new VaultLock(await provisioned(), { autoLockMinutes: 0 });
    await expect(lock.setData(sampleVaultData())).rejects.toBeInstanceOf(VaultLockedError);
  });

  it('never persists the plaintext, the passphrase, or a key (ciphertext at rest)', async () => {
    const store = await provisioned();
    const lock = new VaultLock(store, { autoLockMinutes: 0 });
    await lock.unlock(TEST_PASSPHRASE);
    await lock.setData(sampleVaultData());

    const stored = await store.load('diggy-profile');
    expect(stored).toBeDefined();
    expect(stored?.version).toBe(1);
    expect(stored?.kdf).toBe('argon2id');

    const serialized = JSON.stringify(stored);
    for (const secret of PII_STRINGS) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain(TEST_PASSPHRASE);
    expect(store.size).toBe(1);
  });

  it('does not leave a half-initialised session after a bad unlock', async () => {
    const lock = new VaultLock(await provisioned(), { autoLockMinutes: 0 });
    await expect(lock.unlock('wrong')).rejects.toThrow();
    await lock.unlock(TEST_PASSPHRASE);
    expect(lock.isUnlocked).toBe(true);
  });
});

describe('VaultLock — auto-lock', () => {
  it('auto-locks after inactivity and fires onLock', async () => {
    let lockedCount = 0;
    const lock = new VaultLock(await provisioned(), {
      autoLockMinutes: 0.005, // ~300ms
      onLock: () => {
        lockedCount += 1;
      },
    });

    await lock.unlock(TEST_PASSPHRASE);
    expect(lock.isUnlocked).toBe(true);

    await delay(450);
    expect(lock.isUnlocked).toBe(false);
    expect(lockedCount).toBe(1);
    expect(() => lock.getData()).toThrow(VaultLockedError);
  });

  it('touch() defers auto-lock; inactivity afterwards locks', async () => {
    const lock = new VaultLock(await provisioned(), { autoLockMinutes: 0.005 });
    await lock.unlock(TEST_PASSPHRASE);

    for (let i = 0; i < 5; i += 1) {
      await delay(80);
      lock.touch();
    }
    expect(lock.isUnlocked).toBe(true);

    await delay(500);
    expect(lock.isUnlocked).toBe(false);
  });

  it('autoLockMinutes <= 0 disables auto-lock', async () => {
    const lock = new VaultLock(await provisioned(), { autoLockMinutes: 0 });
    await lock.unlock(TEST_PASSPHRASE);
    await delay(120);
    expect(lock.isUnlocked).toBe(true);

    lock.lock();
    expect(lock.isUnlocked).toBe(false);
  });

  it('does not fire onLock when locking an already-locked vault', async () => {
    let lockedCount = 0;
    const lock = new VaultLock(await provisioned(), {
      autoLockMinutes: 0,
      onLock: () => {
        lockedCount += 1;
      },
    });
    lock.lock();
    expect(lockedCount).toBe(0);

    await lock.unlock(TEST_PASSPHRASE);
    lock.lock();
    lock.lock();
    expect(lockedCount).toBe(1);
  });
});
