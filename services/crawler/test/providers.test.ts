import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { inject } from "./helpers.js";
import {
  EXPERIMENTAL_PROVIDER_IDS,
  experimentalProviders,
  listProviders,
  resolveProvider,
} from "../src/providers/index.js";

const ENV_KEYS = [
  "FIRECRAWL_API_KEY",
  "FIRECRAWL_API_BASE",
  "CRAWL4AI_URL",
  "BROWSER_USE_URL",
  "PYTHON_EXTRACTOR_URL",
] as const;

const EXPERIMENTAL_NAMES = [...EXPERIMENTAL_PROVIDER_IDS] as readonly string[];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("resolveProvider (no env vars)", () => {
  it("always resolves to the built-in provider", () => {
    expect(resolveProvider().name).toBe("builtin");
    expect(resolveProvider(undefined).available()).toBe(true);
  });

  it("falls back to builtin when the preferred provider is not a default provider", () => {
    expect(resolveProvider("firecrawl").name).toBe("builtin");
    expect(resolveProvider("crawl4ai").name).toBe("builtin");
    expect(resolveProvider("browser-use").name).toBe("builtin");
    expect(resolveProvider("python-sidecar").name).toBe("builtin");
    expect(resolveProvider("nope-not-real").name).toBe("builtin");
  });

  it("exposes crawl() + extract() on the builtin provider", () => {
    const provider = resolveProvider("builtin");
    expect(provider.name).toBe("builtin");
    expect(typeof provider.crawl).toBe("function");
    expect(typeof provider.extract).toBe("function");
  });
});

describe("listProviders (no env vars)", () => {
  it("lists the opt-in adapters as unavailable/experimental and builtin as available", () => {
    const rows = listProviders();
    const byName = Object.fromEntries(rows.map((p) => [p.name, p.available]));
    expect(byName).toEqual({
      firecrawl: false,
      crawl4ai: false,
      "browser-use": false,
      "python-sidecar": false,
      builtin: true,
    });

    const experimental = rows.filter((p) => p.experimental === true);
    expect(experimental.map((p) => p.name)).toEqual([...EXPERIMENTAL_PROVIDER_IDS]);
    for (const row of experimental) expect(row.available).toBe(false);
  });

  it("reports providers in a stable preference order", () => {
    expect(listProviders().map((p) => p.name)).toEqual([
      "firecrawl",
      "crawl4ai",
      "browser-use",
      "python-sidecar",
      "builtin",
    ]);
  });
});

describe("resolveProvider (with vendor env vars configured)", () => {
  it("never selects a vendor, even when its key/URL is present", () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    process.env.CRAWL4AI_URL = "http://127.0.0.1:11235";
    process.env.BROWSER_USE_URL = "http://127.0.0.1:8000";
    process.env.PYTHON_EXTRACTOR_URL = "http://127.0.0.1:17323";

    expect(resolveProvider().name).toBe("builtin");
    expect(resolveProvider("firecrawl").name).toBe("builtin");
    expect(resolveProvider("python-sidecar").name).toBe("builtin");
    expect(listProviders().find((p) => p.name === "firecrawl")?.available).toBe(false);
  });

  it("reveals the adapters only through the explicit opt-in", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    process.env.PYTHON_EXTRACTOR_URL = "http://127.0.0.1:17323";

    const optedIn = await experimentalProviders(true);
    expect(optedIn.map((p) => p.name)).toEqual([
      "firecrawl",
      "crawl4ai",
      "browser-use",
      "python-sidecar",
      "builtin",
      "reach",
    ]);
  });
});

describe("default provider surface", () => {
  it("never includes an experimental id by default", async () => {
    const defaults = await experimentalProviders(false);
    for (const provider of defaults) {
      expect(EXPERIMENTAL_NAMES).not.toContain(provider.name);
    }
    expect(defaults.map((provider) => provider.name)).toEqual(["builtin", "reach"]);
  });
});

describe("provider HTTP surface (offline)", () => {
  const app = buildServer();

  afterAll(async () => {
    await app.close();
  });

  it("GET /health lists every provider", async () => {
    const response = await inject(app, { method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      status: string;
      providers: { name: string; available: boolean; experimental?: boolean }[];
    };
    expect(body.status).toBe("ok");
    expect(body.providers.map((p) => p.name)).toEqual([
      "firecrawl",
      "crawl4ai",
      "browser-use",
      "python-sidecar",
      "builtin",
    ]);
    expect(body.providers.find((p) => p.name === "firecrawl")?.experimental).toBe(true);
  });

  it("GET /providers returns the same provider list", async () => {
    const response = await inject(app, { method: "GET", url: "/providers" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { providers: { name: string; available: boolean }[] };
    expect(body.providers).toEqual(listProviders());
  });

  it("POST /extract still handles inline HTML when a provider is requested", async () => {
    const response = await inject(app, {
      method: "POST",
      url: "/extract",
      payload: {
        html: "<html><body><article><p>Hello <b>providers</b> from inline HTML.</p></article></body></html>",
        provider: "firecrawl",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { title: string; markdown: string };
    expect(body.markdown).toContain("Hello");
    expect(body.markdown).toContain("**providers**");
  });

  it("POST /crawl rejects a request without a url", async () => {
    const response = await inject(app, { method: "POST", url: "/crawl", payload: {} });
    expect(response.statusCode).toBe(400);
  });
});
