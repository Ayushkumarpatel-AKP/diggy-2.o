import { describe, expect, it } from "vitest";

import { createMemoryStorageArea, createStorage } from "./storage.js";

type Demo = {
  theme: string;
  count: number;
};

describe("createStorage", () => {
  it("round-trips typed values through the backing area", async () => {
    const storage = createStorage<Demo>(createMemoryStorageArea());

    await storage.set("theme", "pastel");
    await storage.set("count", 3);

    expect(await storage.get("theme")).toBe("pastel");
    expect(await storage.get("count")).toBe(3);
    expect(await storage.getAll()).toEqual({ theme: "pastel", count: 3 });
  });

  it("returns undefined for missing keys and supports remove/clear", async () => {
    const storage = createStorage<Demo>(createMemoryStorageArea({ theme: "gold" }));

    expect(await storage.get("count")).toBeUndefined();

    await storage.remove("theme");
    expect(await storage.getAll()).toEqual({});

    await storage.set("count", 1);
    await storage.clear();
    expect(await storage.getAll()).toEqual({});
  });
});
