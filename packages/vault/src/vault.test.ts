import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './store.js';
import { Vault, type AuditEvent, type VaultOptions } from './vault.js';
import { lockedToken, parseLockedToken } from './profile.schema.js';
import { CHEAP_PARAMS, TEST_PASSPHRASE, sampleVaultData } from './fixtures.js';

/** Plaintext that is ONLY ever behind a `locked` field. */
const LOCKED_PII = ['1234-5678-9012', 'ABCDE1234F', '000111222333'];

async function newVault(options: VaultOptions = {}): Promise<Vault> {
  const store = new MemoryAdapter();
  return Vault.create(store, TEST_PASSPHRASE, sampleVaultData(), { params: CHEAP_PARAMS, ...options });
}

/** Collects every locked-token string anywhere in a serialized profile. */
function collectTokens(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (parseLockedToken(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTokens(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectTokens(item, out);
  }
  return out;
}

describe('Vault API — token-leak safety', () => {
  it('exposes shared values as plaintext and locked values only as tokens', async () => {
    const vault = await newVault();
    const profile = await vault.getProfile();

    expect(profile.fullName?.value).toBe('Ada Lovelace');
    expect(profile.fullName?.visibility).toBe('shared');
    expect(profile.email?.value).toBe('ada@example.com');
    expect(profile.skills?.value).toEqual(['mathematics', 'algorithms']);
    expect(profile.links?.value.github).toBe('https://github.com/ada');

    const locked = profile.custom ?? [];
    const byKey = new Map(locked.map((f) => [f.key, f]));
    expect(byKey.get('aadhaar')?.value).toBe('{{LOCKED:aadhaar}}');
    expect(byKey.get('aadhaar')?.visibility).toBe('locked');
    expect(byKey.get('pan')?.value).toBe('{{LOCKED:pan}}');
    expect(byKey.get('bank.account')?.value).toBe('{{LOCKED:bank.account}}');
  });

  it('never leaks locked plaintext to a consumer that serializes the profile', async () => {
    const vault = await newVault();
    const serialized = JSON.stringify(await vault.getProfile());

    for (const secret of LOCKED_PII) {
      expect(serialized).not.toContain(secret);
    }
    // Every locked field read back is a well-formed token.
    const tokens = collectTokens(await vault.getProfile());
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) expect(parseLockedToken(token)).toBeTruthy();
  });

  it('tokenFor() returns the exact placeholder and never the plaintext', async () => {
    const vault = await newVault();
    expect(vault.tokenFor('aadhaar')).toBe('{{LOCKED:aadhaar}}');
    for (const secret of LOCKED_PII) {
      expect(vault.tokenFor('aadhaar')).not.toContain(secret);
    }
  });

  it('denies resolveLocal() when no approval gate is configured (safe default)', async () => {
    const vault = await newVault();
    expect(await vault.resolveLocal('aadhaar')).toBeNull();
  });

  it('denies resolveLocal() when the approval gate rejects', async () => {
    const vault = await newVault({ approval: () => false });
    expect(await vault.resolveLocal('aadhaar')).toBeNull();
  });

  it('denies resolveLocal() when the approval gate throws', async () => {
    const vault = await newVault({
      approval: () => {
        throw new Error('user dismissed the dialog');
      },
    });
    expect(await vault.resolveLocal('aadhaar')).toBeNull();
  });

  it('resolves a locked value only after per-use approval, and audits without plaintext', async () => {
    const events: AuditEvent[] = [];
    let approvals = 0;
    const vault = await newVault({
      approval: () => {
        approvals += 1;
        return true;
      },
      onAudit: (event) => events.push(event),
    });

    expect(await vault.resolveLocal('aadhaar')).toBe('1234-5678-9012');
    expect(await vault.resolveLocal('pan')).toBe('ABCDE1234F');
    // One approval per use — never a blanket unlock.
    expect(approvals).toBe(2);

    const audit = JSON.stringify(events);
    for (const secret of LOCKED_PII) {
      expect(audit).not.toContain(secret);
    }
    expect(events.some((e) => e.type === 'resolve-approved' && e.key === 'aadhaar')).toBe(true);
    // Unknown key: never resolved.
    expect(await vault.resolveLocal('nope')).toBeNull();
  });

  it('refuses to resolve when the vault is locked', async () => {
    const vault = await newVault({ approval: () => true });
    vault.lock();
    expect(vault.isUnlocked).toBe(false);
    expect(await vault.resolveLocal('aadhaar')).toBeNull();
    await expect(vault.getProfile()).rejects.toThrow();
  });
});

describe('Vault API — visibility + persistence', () => {
  it('setVisibility() locks a shared field and unlocks a locked field', async () => {
    const store = new MemoryAdapter();
    const vault = await Vault.create(store, TEST_PASSPHRASE, sampleVaultData(), {
      params: CHEAP_PARAMS,
    });

    await vault.setVisibility('email', 'locked');
    const afterLock = await vault.getProfile();
    expect(afterLock.email?.value).toBe('{{LOCKED:email}}');

    await vault.setVisibility('aadhaar', 'shared');
    const afterUnlock = await vault.getProfile();
    const aadhaar = (afterUnlock.custom ?? []).find((f) => f.key === 'aadhaar');
    expect(aadhaar?.value).toBe('1234-5678-9012');
    expect(aadhaar?.visibility).toBe('shared');
  });

  it('persists changes across a lock/unlock cycle', async () => {
    const store = new MemoryAdapter();
    const vault = await Vault.create(store, TEST_PASSPHRASE, sampleVaultData(), {
      params: CHEAP_PARAMS,
    });
    await vault.setField({ key: 'portfolio', label: 'Portfolio', value: 'ada.dev', visibility: 'shared' });
    vault.lock();

    const reopened = await Vault.open(store, TEST_PASSPHRASE);
    const profile = await reopened.getProfile();
    expect((profile.custom ?? []).find((f) => f.key === 'portfolio')?.value).toBe('ada.dev');
    expect(await reopened.resolveLocal('aadhaar')).toBeNull(); // no gate → deny
  });

  it('rejects a wrong passphrase on open()', async () => {
    const store = new MemoryAdapter();
    await Vault.create(store, TEST_PASSPHRASE, sampleVaultData(), { params: CHEAP_PARAMS });
    await expect(Vault.open(store, 'not-the-passphrase')).rejects.toThrow();
  });

  it('does not write the passphrase or plaintext to storage', async () => {
    const store = new MemoryAdapter();
    const vault = await Vault.create(store, TEST_PASSPHRASE, sampleVaultData(), {
      params: CHEAP_PARAMS,
    });
    await vault.setField({ key: 'fullName', label: 'Full name', value: 'Ada Lovelace', visibility: 'shared' });

    const blob = await store.load(vault.id);
    const serialized = JSON.stringify(blob);
    expect(serialized).not.toContain(TEST_PASSPHRASE);
    for (const secret of LOCKED_PII) expect(serialized).not.toContain(secret);
  });

  it('notifies onChange on lock/unlock transitions', async () => {
    const vault = await newVault();
    const seen: boolean[] = [];
    vault.onChange((unlocked) => seen.push(unlocked));
    vault.lock();
    await vault.unlock(TEST_PASSPHRASE);
    expect(seen).toEqual([false, true]);
  });
});

describe('lockedToken helpers', () => {
  it('round-trips through parseLockedToken', () => {
    expect(parseLockedToken(lockedToken('aadhaar'))).toBe('aadhaar');
    expect(parseLockedToken('plain')).toBeNull();
  });
});
