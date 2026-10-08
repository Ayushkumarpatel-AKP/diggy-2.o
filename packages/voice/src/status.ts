/**
 * Thinking / status copy + the one place that routes it onto the bus.
 *
 * // INTERFACE FOR INTEGRATION
 * const THINKING_MESSAGES: Record<ThinkingPhase, string>;   // bare text, no 💭
 * type ThinkingPhase = "readingPage" | "lookingForUpdates" | "monitoringWebsite"
 *   | "fillingForm" | "analyzingRepository" | "searchingWeb";
 * function thinkingMessage(phase: ThinkingPhase): string;
 * function formatThinking(text: string): string;            // prefixes "💭 " once
 * const VOICE_STATUS: { listening; transcribing; thinking; speaking };
 * function emitAvatarStatus(bus: MessageBus, text: string): void;   // BusEvents.AvatarStatus
 * function emitAvatarState(bus: MessageBus, state: AvatarState): void; // BusEvents.AvatarState
 * function announce(target: { bus?: MessageBus; avatar?: Pick<AvatarAPI,"status"> }, text: string): void;
 * // END INTERFACE FOR INTEGRATION
 *
 * The 💭 glyph is a *rendering* detail: `AvatarAPI.status` and the UI `StatusBubble`
 * both draw their own icon, so the wire payload carries bare text (matching the
 * existing `background.ts` emitter). `formatThinking` exists for plain surfaces.
 */
import { BusEvents, type AvatarAPI, type AvatarState, type MessageBus } from "@diggy/shared";

import type { AvatarStatusPayload } from "./protocol.js";

/** The canonical thinking lines shown above the avatar while DIGGY works. */
export const THINKING_MESSAGES = {
  readingPage: "Reading page…",
  lookingForUpdates: "Looking for updates…",
  monitoringWebsite: "Monitoring website…",
  fillingForm: "Filling form…",
  analyzingRepository: "Analyzing repository…",
  searchingWeb: "Searching web…",
} as const;

export type ThinkingPhase = keyof typeof THINKING_MESSAGES;

/** The bare status line for a phase (the avatar/UI adds the 💭 itself). */
export function thinkingMessage(phase: ThinkingPhase): string {
  return THINKING_MESSAGES[phase];
}

/** Prefix the 💭 just once, for surfaces that render raw text. */
export function formatThinking(text: string): string {
  const clean = text.trim();
  return clean.startsWith("💭") ? clean : `💭 ${clean}`;
}

/** Voice-pipeline status lines (listening → transcribing → thinking → speaking). */
export const VOICE_STATUS = {
  listening: "Listening…",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  ready: "Ready",
} as const;

/** Emit a status line on the bus (`BusEvents.AvatarStatus`). */
export function emitAvatarStatus(bus: MessageBus, text: string): void {
  const payload: AvatarStatusPayload = { text };
  bus.emit(BusEvents.AvatarStatus, payload);
}

/** Emit an avatar animation state on the bus (`BusEvents.AvatarState`). */
export function emitAvatarState(bus: MessageBus, state: AvatarState): void {
  bus.emit(BusEvents.AvatarState, { state });
}

/**
 * Route a status line to whichever surfaces are attached.
 *
 * Both are optional: the host may hold an `AvatarAPI` (in-page renderer) or only
 * a bus (a remote context), and either alone is enough to show the line.
 */
export function announce(
  target: { bus?: MessageBus; avatar?: Pick<AvatarAPI, "status"> },
  text: string,
): void {
  target.avatar?.status(text);
  if (target.bus) emitAvatarStatus(target.bus, text);
}
