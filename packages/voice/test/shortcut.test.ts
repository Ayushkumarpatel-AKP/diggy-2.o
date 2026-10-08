import { describe, expect, it, vi } from "vitest";

import {
  commandIntent,
  isChordRelease,
  matchesShortcut,
  PushToTalkShortcut,
  shortcutParts,
} from "../src/shortcut.js";
import { VOICE_COMMAND_ID } from "../src/protocol.js";

const chord = (overrides: Partial<Parameters<typeof matchesShortcut>[0]> = {}) => ({
  code: "Space",
  key: " ",
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

describe("push-to-talk: press / release", () => {
  it("opens the mic on press and closes it on release", () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const ptt = new PushToTalkShortcut({ onStart, onStop });

    expect(ptt.active).toBe(false);
    expect(ptt.press()).toBe(true);
    expect(ptt.active).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);

    expect(ptt.release()).toBe(true);
    expect(ptt.active).toBe(false);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("never double-fires start or stop (races are idempotent)", () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const ptt = new PushToTalkShortcut({ onStart, onStop });

    ptt.press();
    ptt.press();
    expect(onStart).toHaveBeenCalledTimes(1);

    ptt.release();
    ptt.release();
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("toggles: press to stop when already listening", () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const ptt = new PushToTalkShortcut({ onStart, onStop });

    ptt.toggle();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(ptt.active).toBe(true);

    ptt.toggle();
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(ptt.active).toBe(false);
  });
});

describe("push-to-talk: commands API mapping", () => {
  it("maps the Ctrl+Space command id to press then release", () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const ptt = new PushToTalkShortcut({ onStart, onStop });

    ptt.handleCommand(VOICE_COMMAND_ID);
    expect(onStart).toHaveBeenCalledTimes(1);

    ptt.handleCommand(VOICE_COMMAND_ID);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated command ids", () => {
    const onStart = vi.fn();
    const ptt = new PushToTalkShortcut({ onStart });
    ptt.handleCommand("some-other-command");
    expect(onStart).not.toHaveBeenCalled();
  });

  it("computes the intent from the current activity", () => {
    expect(commandIntent(VOICE_COMMAND_ID, false)).toBe("start");
    expect(commandIntent(VOICE_COMMAND_ID, true)).toBe("stop");
    expect(commandIntent("nope", false)).toBeNull();
  });
});

describe("push-to-talk: chord matching", () => {
  it("splits a spec", () => {
    expect(shortcutParts("Ctrl+Space")).toEqual(["ctrl", "space"]);
    expect(shortcutParts("")).toEqual([]);
  });

  it("matches Ctrl+Space keydown", () => {
    expect(matchesShortcut(chord(), "Ctrl+Space")).toBe(true);
    expect(matchesShortcut(chord({ ctrlKey: false }), "Ctrl+Space")).toBe(false);
    expect(matchesShortcut(chord({ shiftKey: true }), "Ctrl+Space")).toBe(false);
  });

  it("recognises the chord release (space or the modifier key-up)", () => {
    expect(isChordRelease({ code: "Space", key: " " }, "Ctrl+Space")).toBe(true);
    expect(isChordRelease({ code: "ControlLeft", key: "Control" }, "Ctrl+Space")).toBe(true);
    expect(isChordRelease({ code: "KeyA", key: "a" }, "Ctrl+Space")).toBe(false);
  });

  it("rejects an empty spec", () => {
    expect(matchesShortcut(chord(), "")).toBe(false);
  });
});
