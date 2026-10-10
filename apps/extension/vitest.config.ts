import { defineConfig } from "vitest/config";

/**
 * The extension's unit tests cover its own pure logic — currently the tab
 * registry's scoring, which decides which tab the user meant. Everything that
 * needs `chrome` is exercised in the e2e harness instead.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
