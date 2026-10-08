import { describe, expect, it, vi } from "vitest";

import { attachLipSync, LipSyncFeed, VISEMES } from "../src/lipsync.js";

function settle(feed: LipSyncFeed, run: (f: LipSyncFeed) => void, steps = 200): void {
  for (let index = 0; index < steps; index += 1) run(feed);
}

describe("LipSyncFeed", () => {
  it("stays closed on silence", () => {
    const feed = new LipSyncFeed();
    settle(feed, (f) => f.update(0, 0.1));
    expect(feed.openness).toBe(0);
    for (const viseme of VISEMES) expect(feed.weights[viseme]).toBe(0);
  });

  it("opens the mouth on loud audio, within 0..1", () => {
    const feed = new LipSyncFeed();
    settle(feed, (f) => f.update(1, 0.1));
    expect(feed.openness).toBeGreaterThan(0.5);
    expect(feed.openness).toBeLessThanOrEqual(1);
    for (const viseme of VISEMES) {
      expect(feed.weights[viseme]).toBeGreaterThanOrEqual(0);
      expect(feed.weights[viseme]).toBeLessThanOrEqual(1);
    }
    expect(feed.weights.aa).toBeGreaterThan(0);
  });

  it("attacks quickly but ramps in, not instantly", () => {
    const feed = new LipSyncFeed({ attack: 5 });
    feed.update(1, 0.016); // single frame
    expect(feed.openness).toBeGreaterThan(0);
    expect(feed.openness).toBeLessThan(1);
  });

  it("shapes the mouth toward the dominant vowel band", () => {
    const low = new LipSyncFeed();
    settle(low, (f) => f.updateFromBands({ low: 1, mid: 0, high: 0 }, 0.1));
    expect(low.weights.ou).toBeGreaterThan(low.weights.ee);

    const high = new LipSyncFeed();
    settle(high, (f) => f.updateFromBands({ low: 0, mid: 0, high: 1 }, 0.1));
    expect(Math.max(high.weights.ee, high.weights.ih)).toBeGreaterThan(high.weights.ou);
  });

  it("decays back to silence", () => {
    const feed = new LipSyncFeed();
    settle(feed, (f) => f.update(1, 0.1));
    expect(feed.openness).toBeGreaterThan(0);
    settle(feed, (f) => f.update(0, 0.1));
    expect(feed.openness).toBeLessThan(0.01);
  });

  it("exposes an expression with the five viseme keys", () => {
    const feed = new LipSyncFeed();
    feed.update(1, 0.1);
    const expression = feed.toExpression();
    expect(Object.keys(expression).sort()).toEqual([...VISEMES].sort());
  });

  it("drives an avatar's expression through attachLipSync", () => {
    const feed = new LipSyncFeed();
    const setExpression = vi.fn();
    const driver = attachLipSync({ setExpression }, feed);

    driver.push(1, 0.1);
    expect(setExpression).toHaveBeenCalled();
    const first = setExpression.mock.calls.at(-1)?.[0] as Record<string, number>;
    expect(Object.keys(first).sort()).toEqual([...VISEMES].sort());

    driver.reset();
    const reset = setExpression.mock.calls.at(-1)?.[0] as Record<string, number>;
    expect(reset.aa).toBe(0);
  });
});
