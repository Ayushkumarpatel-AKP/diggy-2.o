/**
 * Local user memory — the preferences the user *stated*.
 *
 * Small, local, inspectable. Persistence is injected (the desktop vault or
 * `chrome.storage`), so `@diggy/core` stays storage-agnostic. Only stated facts
 * are recorded by default; the persona must never invent a preference.
 */

export type FactSource = "stated" | "inferred";

export interface UserFact {
  key: string;
  value: string;
  source: FactSource;
  updatedAt: string;
}

/** Injection point for durable storage (vault / chrome.storage / IndexedDB). */
export interface UserMemoryPersistence {
  load(): UserFact[] | Promise<UserFact[]>;
  save(facts: UserFact[]): void | Promise<void>;
}

export interface UserMemoryOptions {
  persistence?: UserMemoryPersistence;
  now?: () => Date;
}

export interface RememberOptions {
  /** Defaults to `"stated"` — this store is for stated preferences. */
  source?: FactSource;
}

/** Key/value store of user preferences, with an optional persistence backend. */
export class UserMemory {
  private readonly facts = new Map<string, UserFact>();
  private readonly persistence: UserMemoryPersistence | undefined;
  private readonly now: () => Date;
  private loaded = false;

  constructor(options: UserMemoryOptions = {}) {
    this.persistence = options.persistence;
    this.now = options.now ?? (() => new Date());
  }

  /** Load once from persistence (idempotent). */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.persistence) return;
    const stored = await this.persistence.load();
    for (const fact of stored) {
      if (fact && typeof fact.key === "string") this.facts.set(fact.key, { ...fact });
    }
  }

  /** Record a preference. Returns the stored fact. */
  async remember(key: string, value: string, options: RememberOptions = {}): Promise<UserFact> {
    await this.load();
    const fact: UserFact = {
      key: String(key),
      value: String(value),
      source: options.source ?? "stated",
      updatedAt: this.now().toISOString(),
    };
    this.facts.set(fact.key, fact);
    await this.persist();
    return { ...fact };
  }

  async recall(key: string): Promise<string | undefined> {
    await this.load();
    return this.facts.get(String(key))?.value;
  }

  async forget(key: string): Promise<boolean> {
    await this.load();
    const removed = this.facts.delete(String(key));
    if (removed) await this.persist();
    return removed;
  }

  async all(): Promise<UserFact[]> {
    await this.load();
    return [...this.facts.values()].map((fact) => ({ ...fact }));
  }

  /** Only the preferences the user stated. */
  async statedPreferences(): Promise<UserFact[]> {
    return (await this.all()).filter((fact) => fact.source === "stated");
  }

  /** Render the memory as a system-prompt context block (empty when nothing is known). */
  async toPrompt(): Promise<string> {
    const facts = await this.all();
    if (facts.length === 0) return "";
    const lines = facts.map((fact) => `- ${fact.key}: ${fact.value}`);
    return ["# What I know about the user", ...lines].join("\n");
  }

  async clear(): Promise<void> {
    await this.load();
    this.facts.clear();
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.persistence) return;
    await this.persistence.save([...this.facts.values()].map((fact) => ({ ...fact })));
  }
}

/** In-memory persistence — handy for tests and ephemeral sessions. */
export function createMemoryUserMemoryPersistence(initial?: UserFact[]): UserMemoryPersistence {
  let facts: UserFact[] = initial ? initial.map((fact) => ({ ...fact })) : [];
  return {
    load: () => facts.map((fact) => ({ ...fact })),
    save: (next) => {
      facts = next.map((fact) => ({ ...fact }));
    },
  };
}

/** Build a {@link UserMemory}, optionally backed by persistence. */
export function createUserMemory(options: UserMemoryOptions = {}): UserMemory {
  return new UserMemory(options);
}
