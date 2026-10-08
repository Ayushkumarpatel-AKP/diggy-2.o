import { describe, expect, it } from "vitest";

import { SilenceTracker } from "../src/silence.js";

describe("SilenceTracker", () => {
  it("stops after speech followed by silence", () => {
    const tracker = new SilenceTracker({ silenceMs: 1200 });
    tracker.start(0);
    expect(tracker.update(0.5, 100)).toBeNull();
    expect(tracker.hasHeardVoice).toBe(true);
    expect(tracker.update(0.001, 1000)).toBeNull();
    expect(tracker.update(0.001, 1300)).toBe("silence");
  });

  it("gives up early when nothing is ever heard", () => {
    const tracker = new SilenceTracker({ noSpeechMs: 10000 });
    tracker.start(0);
    expect(tracker.update(0.001, 9999)).toBeNull();
    expect(tracker.update(0.001, 10000)).toBe("no-speech");
  });

  it("honours the hard cap", () => {
    const tracker = new SilenceTracker({ maxMs: 60000 });
    tracker.start(0);
    expect(tracker.update(0.9, 60000)).toBe("max-duration");
  });

  it("fires at most once", () => {
    const tracker = new SilenceTracker({ maxMs: 100 });
    tracker.start(0);
    expect(tracker.update(0.9, 100)).toBe("max-duration");
    expect(tracker.update(0.9, 1000)).toBeNull();
  });

  it("resets between recordings", () => {
    const tracker = new SilenceTracker({ noSpeechMs: 100 });
    tracker.start(0);
    expect(tracker.update(0, 100)).toBe("no-speech");
    tracker.start(0);
    expect(tracker.update(0, 50)).toBeNull();
  });
});
