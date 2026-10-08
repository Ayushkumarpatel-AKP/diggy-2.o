import { describe, expect, it } from "vitest";

import { tokens } from "./tokens.js";

describe("tokens", () => {
  it("exposes the gold primary from the design source of truth", () => {
    expect(tokens.color.primary).toBe("#F5B301");
    expect(tokens.color.primaryInk).toBe("#7A5A00");
  });

  it("exposes the pastel accent palette", () => {
    expect(tokens.color.blue).toBe("#4A7BF7");
    expect(tokens.color.pink).toBe("#FB7185");
    expect(tokens.color.mint).toBe("#34D399");
    expect(tokens.color.violet).toBe("#A78BFA");
  });

  it("exposes rounded-card surface tokens", () => {
    expect(tokens.radius.pill).toBe("999px");
    expect(tokens.color.surface).toBe("#FFFFFF");
    expect(Object.keys(tokens.shadow)).toEqual(["sm", "md", "lg"]);
  });
});
