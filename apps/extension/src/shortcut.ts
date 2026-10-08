/**
 * Global CTRL+SPACE push-to-talk binding — the MV3 `commands` API + the page
 * control messages, wired to a {@link VoiceSession}.
 *
 * // INTERFACE FOR INTEGRATION
 * interface CommandsApi { onCommand: { addListener(l); removeListener(l) } }
 * interface RuntimeMessageApi { onMessage: { addListener(l); removeListener(l) } }
 * interface PushToTalkHost { press(); release(); toggle(); readonly state: string }
 * interface PushToTalkBinding { press(); release(); dispose(): void }
 * function bindPushToTalk(host: PushToTalkHost, apis: {
 *   commands?: CommandsApi; runtime?: RuntimeMessageApi; commandId?: string;
 * }): PushToTalkBinding
 * // END INTERFACE FOR INTEGRATION
 *
 * MV3 FACT: a `chrome.commands` shortcut fires once on key-down and never on
 * key-up, so the browser-level chord can only toggle. The manifest must declare
 * the `VOICE_COMMAND_ID` command (owned by core/leader in `wxt.config.ts`) for
 * `onCommand` to fire at all; a page that sees the real keydown/keyup pair uses
 * `VOICE_CONTROL.press|release` for true hold-to-talk.
 */
import {
  isVoiceControl,
  PushToTalkShortcut,
  shortcutParts,
  matchesShortcut,
  isChordRelease,
  VOICE_COMMAND_ID,
  DEFAULT_VOICE_SHORTCUT,
  VOICE_CONTROL,
} from "../../../packages/voice/src/index.js";

export {
  PushToTalkShortcut,
  shortcutParts,
  matchesShortcut,
  isChordRelease,
  VOICE_COMMAND_ID,
  DEFAULT_VOICE_SHORTCUT,
  VOICE_CONTROL,
};

/** The slice of `browser.commands` this uses (works with WXT's global `browser`). */
export interface CommandsApi {
  onCommand: {
    addListener(listener: (command: string) => void): void;
    removeListener(listener: (command: string) => void): void;
  };
}

/** The slice of `browser.runtime` this uses. */
export interface RuntimeMessageApi {
  onMessage: {
    addListener(listener: (message: unknown) => unknown): void;
    removeListener(listener: (message: unknown) => void): void;
  };
}

/** The voice surface the binding drives (a `VoiceSession` satisfies this). */
export interface PushToTalkHost {
  press(): Promise<unknown>;
  release(): Promise<unknown>;
  toggle(): Promise<unknown>;
  readonly state: string;
}

export interface PushToTalkBinding {
  press(): Promise<unknown>;
  release(): Promise<unknown>;
  dispose(): void;
}

export interface BindPushToTalkOptions {
  commands?: CommandsApi;
  runtime?: RuntimeMessageApi;
  commandId?: string;
}

/**
 * Wire the browser command + page control messages to a voice host.
 *
 * Returns a binding whose `dispose()` removes both listeners (useful for tests
 * and for a background worker that re-registers on wake).
 */
export function bindPushToTalk(
  host: PushToTalkHost,
  apis: BindPushToTalkOptions = {},
): PushToTalkBinding {
  const commandId = apis.commandId ?? VOICE_COMMAND_ID;
  const toggle = new PushToTalkShortcut({
    commandId,
    onStart: () => {
      void host.press();
    },
    onStop: () => {
      void host.release();
    },
  });

  const onCommand = (command: string): void => {
    toggle.handleCommand(command);
  };
  const onMessage = (message: unknown): unknown => {
    if (!isVoiceControl(message)) return undefined;
    if (message.type === VOICE_CONTROL.press) {
      void host.press();
      return { ok: true };
    }
    void host.release();
    return { ok: true };
  };

  apis.commands?.onCommand.addListener(onCommand);
  apis.runtime?.onMessage.addListener(onMessage);

  return {
    press: () => host.press(),
    release: () => host.release(),
    dispose() {
      apis.commands?.onCommand.removeListener(onCommand);
      apis.runtime?.onMessage.removeListener(onMessage);
    },
  };
}
