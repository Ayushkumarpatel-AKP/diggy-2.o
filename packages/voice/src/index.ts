/**
 * @diggy/voice — push-to-talk voice for DIGGY 2.0.
 *
 * Pure, DOM-free core (recorder host injected, no `chrome`, no `three`) so every
 * behaviour is unit-testable in Node; the extension binds it to real APIs in
 * `apps/extension/src/shortcut.ts` and `entrypoints/offscreen`.
 *
 * ============================================================================
 * INTERFACE FOR INTEGRATION
 * ============================================================================
 *   // protocol
 *   VOICE_COMMAND_ID: "toggle-voice"
 *   DEFAULT_VOICE_SHORTCUT: "Ctrl+Space"
 *   type AutoStopReason = "silence" | "max-duration" | "no-speech"
 *   type MicErrorReason  = "not-allowed" | "no-device" | "device-busy" | "unknown"
 *   interface VoiceTranscriptPayload { text: string }   // BusEvents.VoiceTranscript
 *   interface AvatarStatusPayload { text: string }       // BusEvents.AvatarStatus
 *   OFFSCREEN: { ping, start, stop, warm, silence, play, level }
 *   VOICE_CONTROL: { press, release }                    // page → background
 *
 *   // status copy + routing
 *   THINKING_MESSAGES: Record<ThinkingPhase, string>
 *   VOICE_STATUS: { listening, transcribing, thinking, speaking, ready }
 *   thinkingMessage(phase), formatThinking(text)
 *   emitAvatarStatus(bus, text), emitAvatarState(bus, state), announce(target, text)
 *
 *   // shortcut
 *   matchesShortcut(event, spec), isChordRelease(event, spec), commandIntent(id, active)
 *   class PushToTalkShortcut { active; press(); release(); toggle(); handleCommand(id) }
 *
 *   // recorder (+ silence auto-stop)
 *   class RecorderController { start(o?); stop(); cancel(); state; mimeType; stream }
 *   createDomRecorderHost(), classifyMicError(error), PREFERRED_MIME_TYPES
 *   class SilenceTracker { start(now); update(level, now): AutoStopReason | null }
 *
 *   // lip-sync
 *   VISEMES = ["aa","ih","ou","ee","oh"]
 *   class LipSyncFeed { update(level, delta); updateFromBands(bands, delta); weights; openness; toExpression() }
 *   attachLipSync(avatar, feed)
 *
 *   // STT / TTS
 *   createTranscriber(provider, opts?): Transcriber   // Provider.transcribe (Groq whisper-large-v3)
 *   decodeBase64(base64): ArrayBuffer
 *   createBrowserTts(synth, opts?): TtsEngine
 *   createProviderTts(provider, sink, opts?): TtsEngine
 *
 *   // orchestrator
 *   class VoiceSession {
 *     state; enabled; setEnabled(b);
 *     press(); release(): Promise<VoiceTranscriptResult>;
 *     toggle(); onSilence(reason); speak(text, { mood? }); cancel();
 *   }
 * ============================================================================
 */
export * from "./protocol.js";
export * from "./status.js";
export * from "./shortcut.js";
export * from "./recorder.js";
export * from "./silence.js";
export * from "./lipsync.js";
export * from "./stt.js";
export * from "./tts.js";
export * from "./session.js";
