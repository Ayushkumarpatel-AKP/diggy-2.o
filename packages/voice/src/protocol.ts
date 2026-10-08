/**
 * Voice wire protocol + shared constants.
 *
 * // INTERFACE FOR INTEGRATION
 * const VOICE_COMMAND_ID = "toggle-voice";
 * const DEFAULT_VOICE_SHORTCUT = "Ctrl+Space";
 * type AutoStopReason = "silence" | "max-duration" | "no-speech";
 * type MicErrorReason = "not-allowed" | "no-device" | "device-busy" | "unknown";
 * interface VoiceTranscriptPayload { text: string }        // BusEvents.VoiceTranscript
 * interface AvatarStatusPayload { text: string }            // BusEvents.AvatarStatus
 * interface AvatarStatePayload { state: AvatarState }       // BusEvents.AvatarState
 * const OFFSCREEN: { ping, start, stop, warm, silence, play, level, listening }  // message names
 * // END INTERFACE FOR INTEGRATION
 *
 * One home for every string that crosses a context boundary, so the background,
 * the offscreen recorder and the shortcut binding never disagree about a name.
 */

/**
 * The manifest command id for push-to-talk.
 *
 * A `chrome.commands` command has NO key-up event, so the browser-level chord can
 * only ever toggle. The manifest must declare this id (owned by core/leader in
 * `apps/extension/wxt.config.ts`) for `commands.onCommand` to fire.
 */
export const VOICE_COMMAND_ID = "toggle-voice";

/** Human-readable default chord, mirrored in the manifest's `suggested_key`. */
export const DEFAULT_VOICE_SHORTCUT = "Ctrl+Space";

/** Why the recorder stopped (or asks to stop) on its own. */
export type AutoStopReason = "silence" | "max-duration" | "no-speech";

/** Why `getUserMedia` failed, in terms the host can act on. */
export type MicErrorReason = "not-allowed" | "no-device" | "device-busy" | "unknown";

/** Payload for `BusEvents.VoiceTranscript`. */
export interface VoiceTranscriptPayload {
  text: string;
}

/** Payload for `BusEvents.AvatarStatus` — the 💭 line above the avatar. */
export interface AvatarStatusPayload {
  text: string;
}

/**
 * Message names between the background and the offscreen recorder/player.
 *
 * `diggy:offscreen-start|stop|warm|silence` are ported verbatim from the proven
 * seed recorder; `play`/`level` add TTS playback + a lip-sync level feed.
 */
export const OFFSCREEN = {
  ping: "diggy:offscreen-ping",
  start: "diggy:offscreen-start",
  stop: "diggy:offscreen-stop",
  warm: "diggy:offscreen-warm",
  /** Offscreen → background: silence/cap reached, please stop + transcribe. */
  silence: "diggy:offscreen-silence",
  /** Background → offscreen: play this TTS clip. */
  play: "diggy:offscreen-play",
  /** Offscreen → background: a lip-sync level/band frame. */
  level: "diggy:offscreen-level",
} as const;

export interface OffscreenStartMessage {
  type: typeof OFFSCREEN.start;
  autoStop?: boolean;
}

export interface OffscreenPlayMessage {
  type: typeof OFFSCREEN.play;
  /** Base64-encoded audio. */
  base64: string;
  mimeType?: string;
  /** Stop the previous clip first (default true). */
  interrupt?: boolean;
}

export interface OffscreenLevelMessage {
  type: typeof OFFSCREEN.level;
  /** Normalised RMS of the current waveform (0..1). */
  level: number;
  /** Coarse band energies for vowel shaping (0..1 each). */
  bands: { low: number; mid: number; high: number };
  /** Where the level came from. */
  phase: "recording" | "playback";
}

/**
 * Page → background control messages.
 *
 * A page that sees the real keydown/keyup pair (overlay, side panel) uses these
 * for true hold-to-talk, whereas the browser-level command can only toggle.
 */
export const VOICE_CONTROL = {
  press: "diggy:voice-press",
  release: "diggy:voice-release",
} as const;

export interface VoiceControlMessage {
  type: (typeof VOICE_CONTROL)[keyof typeof VOICE_CONTROL];
}

/** Guard for an incoming control message. */
export function isVoiceControl(message: unknown): message is VoiceControlMessage {
  if (typeof message !== "object" || message === null) return false;
  const type = (message as { type?: unknown }).type;
  return type === VOICE_CONTROL.press || type === VOICE_CONTROL.release;
}

