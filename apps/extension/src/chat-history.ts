/**
 * Conversation history that survives a service-worker restart.
 *
 * Before this, every command started from nothing: `runBrain` was called with no
 * `history`, so "now do the same for the next one" had no referent and the
 * assistant felt forgetful. The turns are kept in `chrome.storage.local`, which
 * is the only store an MV3 worker can rely on across evictions.
 *
 * It is deliberately bounded twice — a hard turn cap and a character budget —
 * because an unbounded history is the most expensive way to burn tokens: every
 * turn re-sends everything before it.
 */
import type { ChatMessage } from "@diggy/shared";

export const CHAT_STORAGE_KEY = "diggy:chat";

/** One stored exchange turn. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  at: number;
}

export interface ChatHistory {
  /** Every stored turn, oldest first. */
  all(): Promise<ChatTurn[]>;
  /** The last `turns` exchanges as `ChatMessage`s, ready for `runBrain`. */
  recent(turns?: number): Promise<ChatMessage[]>;
  /** Record the user's goal and the assistant's reply. */
  append(goal: string, reply: string): Promise<void>;
  clear(): Promise<void>;
}

interface StorageLocalLike {
  get(key: string): Promise<unknown>;
  set(items: Record<string, unknown>): Promise<unknown>;
  remove(key: string): Promise<void>;
}

function storage(): StorageLocalLike | undefined {
  const scope = globalThis as unknown as {
    browser?: { storage?: { local?: StorageLocalLike } };
    chrome?: { storage?: { local?: StorageLocalLike } };
  };
  return scope.browser?.storage?.local ?? scope.chrome?.storage?.local;
}

/** Defaults: at most 12 exchanges, and never more than ~6k characters of it. */
export const CHAT_MAX_TURNS = 24;
export const CHAT_MAX_CHARS = 6000;

function isTurn(value: unknown): value is ChatTurn {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Record<string, unknown>;
  return (
    (turn["role"] === "user" || turn["role"] === "assistant") &&
    typeof turn["content"] === "string" &&
    typeof turn["at"] === "number"
  );
}

/** Keep the newest turns that fit both budgets. */
export function trimTurns(
  turns: readonly ChatTurn[],
  maxTurns = CHAT_MAX_TURNS,
  maxChars = CHAT_MAX_CHARS,
): ChatTurn[] {
  const tail = turns.slice(-maxTurns);
  const kept: ChatTurn[] = [];
  let used = 0;
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    const turn = tail[index];
    if (!turn) continue;
    if (used + turn.content.length > maxChars && kept.length > 0) break;
    used += turn.content.length;
    kept.unshift(turn);
  }
  return kept;
}

export function createChatHistory(key = CHAT_STORAGE_KEY): ChatHistory {
  async function all(): Promise<ChatTurn[]> {
    const area = storage();
    if (!area) return [];
    try {
      const raw = (await area.get(key)) as Record<string, unknown>;
      const stored = raw[key];
      if (!Array.isArray(stored)) return [];
      return stored.filter(isTurn);
    } catch {
      return [];
    }
  }

  async function recent(turns = CHAT_MAX_TURNS): Promise<ChatMessage[]> {
    const kept = trimTurns(await all(), turns);
    return kept.map((turn) => ({ role: turn.role, content: turn.content }));
  }

  async function write(next: ChatTurn[]): Promise<void> {
    const area = storage();
    if (!area) return;
    try {
      await area.set({ [key]: trimTurns(next) });
    } catch {
      /* history is a convenience; never let it break a command */
    }
  }

  async function append(goal: string, reply: string): Promise<void> {
    const now = Date.now();
    const next = await all();
    if (goal.trim() !== "") next.push({ role: "user", content: goal.trim(), at: now });
    if (reply.trim() !== "") next.push({ role: "assistant", content: reply.trim(), at: now + 1 });
    await write(next);
  }

  async function clear(): Promise<void> {
    const area = storage();
    if (!area) return;
    try {
      await area.remove(key);
    } catch {
      /* nothing to clear */
    }
  }

  return { all, recent, append, clear };
}
