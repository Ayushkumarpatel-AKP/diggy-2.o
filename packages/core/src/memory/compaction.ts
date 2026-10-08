/**
 * Smart-context compaction.
 *
 * Keeps a prompt inside the model's context window without losing the thread:
 *   - token-aware auto-compaction ({@link shouldCompact}, {@link compactMessages});
 *   - tool-result limits ({@link capToolResult}, {@link limitToolResults});
 *   - overflow recovery ({@link compactWithOverflowRecovery}) when a single
 *     compaction pass is not enough.
 *
 * Summarisation is injected as a plain function, so the whole module is
 * testable with no network and it never imports a provider.
 */
import type { ChatMessage } from "@diggy/shared";
import { CONTEXT } from "../config.js";

/** Prefix on the synthetic message that carries a folded history. */
export const CONVERSATION_SUMMARY_PREFIX = "[Earlier conversation summary]";

/** Rough token estimate from a character count (default ~4 chars/token). */
export function estimateTokens(text: unknown, charsPerToken: number = CONTEXT.charsPerToken): number {
  const cpt = typeof charsPerToken === "number" && charsPerToken > 0 ? charsPerToken : CONTEXT.charsPerToken;
  const length = typeof text === "string" ? text.length : 0;
  return Math.ceil(length / cpt);
}

/** Estimated tokens for one message. */
export function messageTokens(message: ChatMessage): number {
  return estimateTokens(message.content);
}

/** Estimated tokens for a whole conversation. */
export function totalTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const message of messages) total += messageTokens(message);
  return total;
}

/**
 * Hard-cap a tool result. Under the cap it is returned unchanged; over it the
 * head is kept and a `…[truncated N more characters]` marker is appended. The
 * result never exceeds `maxChars` (a reserve is held back for the marker).
 */
export function capToolResult(text: unknown, maxChars: number = CONTEXT.maxToolResultChars): string {
  const value = typeof text === "string" ? text : text === null || text === undefined ? "" : String(text);
  const cap =
    typeof maxChars === "number" && Number.isFinite(maxChars) && maxChars >= 0
      ? Math.floor(maxChars)
      : CONTEXT.maxToolResultChars;
  if (cap === 0) return "";
  if (value.length <= cap) return value;
  const headLength = Math.max(0, cap - CONTEXT.truncationMarkerReserve);
  const head = value.slice(0, headLength);
  const marker = `\n…[truncated ${value.length - head.length} more characters]`;
  const capped = head + marker;
  return capped.length <= cap ? capped : capped.slice(0, cap);
}

/** Apply {@link capToolResult} to every `tool` message, leaving others intact. */
export function limitToolResults(messages: ChatMessage[], maxChars?: number): ChatMessage[] {
  return messages.map((message) =>
    message.role === "tool" ? { ...message, content: capToolResult(message.content, maxChars) } : message,
  );
}

/** True when the conversation is over the token budget. */
export function shouldCompact(messages: ChatMessage[], maxTokens: number = CONTEXT.maxTokens): boolean {
  return totalTokens(messages) > maxTokens;
}

export interface CompactionOptions {
  maxTokens?: number;
  /** Trailing messages never folded away. Default {@link CONTEXT.keepRecent}. */
  keepRecent?: number;
  /** Optional summariser for the folded region. */
  summarize?: (rendered: string) => string | Promise<string>;
  summaryPrefix?: string;
}

export interface CompactionResult {
  messages: ChatMessage[];
  compacted: boolean;
  /** How many messages were folded into the summary. */
  dropped: number;
  summary: string;
  /** Estimated tokens after compaction. */
  tokens: number;
}

function renderMessage(message: ChatMessage): string {
  const label = message.name ? `${message.role} (${message.name})` : message.role;
  return `${label}: ${message.content}`;
}

function fallbackSummary(rendered: string): string {
  const max = 1_000;
  if (rendered.length <= max) return rendered;
  return `${rendered.slice(0, max)}…[compacted]`;
}

/**
 * Fold the middle of a long conversation into a synthetic summary message,
 * keeping any leading system messages and the most recent `keepRecent` turns.
 */
export async function compactMessages(
  messages: ChatMessage[],
  options: CompactionOptions = {},
): Promise<CompactionResult> {
  const maxTokens = options.maxTokens ?? CONTEXT.maxTokens;
  const keepRecent = Math.max(0, options.keepRecent ?? CONTEXT.keepRecent);
  const prefix = options.summaryPrefix ?? CONVERSATION_SUMMARY_PREFIX;
  const input = Array.isArray(messages) ? messages.slice() : [];
  const before = totalTokens(input);

  if (before <= maxTokens) {
    return { messages: input, compacted: false, dropped: 0, summary: "", tokens: before };
  }

  let lead = 0;
  while (lead < input.length && input[lead]?.role === "system") lead += 1;
  const leading = input.slice(0, lead);
  const body = input.slice(lead);

  const keep = Math.min(keepRecent, body.length);
  const recent = keep > 0 ? body.slice(body.length - keep) : [];
  const middle = body.slice(0, body.length - keep);

  if (middle.length === 0) {
    return { messages: input, compacted: false, dropped: 0, summary: "", tokens: before };
  }

  const rendered = middle.map(renderMessage).join("\n");
  const summary =
    typeof options.summarize === "function" ? await options.summarize(rendered) : fallbackSummary(rendered);
  const summaryMessage: ChatMessage = { role: "system", content: `${prefix}\n${summary}` };
  const result = [...leading, summaryMessage, ...recent];

  return {
    messages: result,
    compacted: true,
    dropped: middle.length,
    summary,
    tokens: totalTokens(result),
  };
}

/**
 * Compact, then keep compacting harder until the prompt fits. Last resort drops
 * the oldest body messages (never the leading system prompt) one at a time.
 */
export async function compactWithOverflowRecovery(
  messages: ChatMessage[],
  options: CompactionOptions = {},
): Promise<CompactionResult> {
  const maxTokens = options.maxTokens ?? CONTEXT.maxTokens;
  let keepRecent = Math.max(0, options.keepRecent ?? CONTEXT.keepRecent);
  let latest: CompactionResult = {
    messages: Array.isArray(messages) ? messages.slice() : [],
    compacted: false,
    dropped: 0,
    summary: "",
    tokens: totalTokens(Array.isArray(messages) ? messages : []),
  };

  for (let round = 0; round < 8; round += 1) {
    latest = await compactMessages(messages, { ...options, maxTokens, keepRecent });
    if (latest.tokens <= maxTokens) return latest;
    if (keepRecent === 0) break;
    keepRecent = Math.floor(keepRecent / 2);
  }

  const trimmed = fitToBudget(latest.messages, maxTokens);
  return {
    ...latest,
    messages: trimmed,
    compacted: true,
    tokens: totalTokens(trimmed),
  };
}

/**
 * Last-resort fit: drop the oldest body messages (never the leading system
 * prompt), then shrink the largest remaining message until the whole prompt is
 * under budget. Guarantees the output fits whenever `maxTokens >= 0`.
 */
function fitToBudget(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  const out = messages.map((message) => ({ ...message }));

  let lead = 0;
  while (lead < out.length && out[lead]?.role === "system") lead += 1;
  while (totalTokens(out) > maxTokens && out.length > lead + 1) {
    out.splice(lead, 1);
  }

  const budgetChars = Math.max(0, Math.floor(maxTokens * CONTEXT.charsPerToken));
  for (let guard = 0; guard < 8 && totalTokens(out) > maxTokens; guard += 1) {
    let longest = -1;
    let length = -1;
    for (let index = 0; index < out.length; index += 1) {
      const content = out[index]?.content ?? "";
      if (content.length > length) {
        length = content.length;
        longest = index;
      }
    }
    if (longest < 0) break;
    const others = totalTokens(out) - messageTokens(out[longest] as ChatMessage);
    const allowed = Math.max(0, budgetChars - others * CONTEXT.charsPerToken);
    if (length <= allowed) break;
    const target = out[longest] as ChatMessage;
    if (allowed === 0 && out.length > 1) {
      out.splice(longest, 1);
    } else {
      out[longest] = { ...target, content: target.content.slice(0, allowed) };
    }
  }

  return out;
}
