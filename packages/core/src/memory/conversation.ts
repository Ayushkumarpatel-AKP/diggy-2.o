/**
 * Per-tab conversation history.
 *
 * Each browser tab gets its own rolling window, so a question asked on one tab
 * does not leak into another's context. The window keeps the last N messages
 * under a character budget; persistence stays the host's job.
 */
import type { ChatMessage } from "@diggy/shared";
import { CONVERSATION } from "../config.js";

export interface ConversationOptions {
  /** Hard cap on stored messages. Default {@link CONVERSATION.maxMessages}. */
  maxMessages?: number;
  /** Soft cap on total characters across stored messages. */
  maxChars?: number;
}

/** Best-effort character estimate for a message. */
export function estimateChars(message: ChatMessage): number {
  return typeof message.content === "string" ? message.content.length : 0;
}

/** One rolling conversation window. */
export class ConversationWindow {
  private readonly store: ChatMessage[] = [];
  private readonly maxMessages: number;
  private readonly maxChars: number;

  constructor(options: ConversationOptions = {}) {
    this.maxMessages = Math.max(1, options.maxMessages ?? CONVERSATION.maxMessages);
    this.maxChars = Math.max(1, options.maxChars ?? CONVERSATION.maxChars);
  }

  get size(): number {
    return this.store.length;
  }

  /** Append a message and trim the window back to budget. */
  add(message: ChatMessage): void {
    this.store.push({ ...message });
    this.trim();
  }

  addUser(content: string): void {
    this.add({ role: "user", content });
  }

  addAssistant(content: string): void {
    this.add({ role: "assistant", content });
  }

  /** Snapshot of the current window. */
  messages(): ChatMessage[] {
    return this.store.map((message) => ({ ...message }));
  }

  clear(): void {
    this.store.length = 0;
  }

  private trim(): void {
    while ((this.store.length > this.maxMessages || this.charCount() > this.maxChars) && this.store.length > 1) {
      this.store.shift();
    }
  }

  private charCount(): number {
    let total = 0;
    for (const message of this.store) total += estimateChars(message);
    return total;
  }
}

export type TabId = string | number;

/** A window per browser tab, created on first use. */
export class TabConversationStore {
  private readonly windows = new Map<string, ConversationWindow>();
  private readonly options: ConversationOptions;

  constructor(options: ConversationOptions = {}) {
    this.options = options;
  }

  private key(tabId: TabId): string {
    return String(tabId);
  }

  /** Get (or lazily create) the window for a tab. */
  forTab(tabId: TabId): ConversationWindow {
    const key = this.key(tabId);
    let window = this.windows.get(key);
    if (!window) {
      window = new ConversationWindow(this.options);
      this.windows.set(key, window);
    }
    return window;
  }

  add(tabId: TabId, message: ChatMessage): void {
    this.forTab(tabId).add(message);
  }

  messages(tabId: TabId): ChatMessage[] {
    return this.forTab(tabId).messages();
  }

  clear(tabId: TabId): void {
    this.windows.get(this.key(tabId))?.clear();
  }

  /** Forget a tab entirely (e.g. when it closes). */
  drop(tabId: TabId): boolean {
    return this.windows.delete(this.key(tabId));
  }

  clearAll(): void {
    this.windows.clear();
  }

  /** Tab ids that have an active window. */
  tabIds(): string[] {
    return [...this.windows.keys()];
  }
}
