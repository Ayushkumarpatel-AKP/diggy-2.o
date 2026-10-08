/**
 * Versioned per-site guidance.
 *
 * Monitors observe arbitrary pages, but a handful of high-value sites (job
 * boards, exam/registration portals, release pages, storefronts) expose their
 * deadline / registration flag / price / version in a shape we can recognise
 * reliably. Each {@link SiteAdapter} is a **versioned** unit of guidance: bump
 * `version` whenever the selectors or patterns change so a change is auditable.
 *
 * Selectors are declared for callers that hold the raw DOM (the extension's
 * content script); the regex `patterns` are applied to the extracted text,
 * which is all the server-side crawler hands back.
 */

/** Extracted, kind-specific signals for a snapshot (all optional). */
export interface SiteSignals {
  /** Price in the site's minor units (e.g. paise/cents) or a plain number. */
  price?: number;
  /** Normalised deadline token (ISO date when parseable, else the raw text). */
  deadline?: string;
  /** Whether a registration/open flag is present on the page. */
  registrationOpen?: boolean;
  /** Latest release/version string. */
  version?: string;
}

/** Versioned guidance for one family of sites. */
export interface SiteAdapter {
  /** Stable identifier, e.g. `naukri`, `github-releases`. */
  id: string;
  /** Bump on any selectors/patterns change. */
  version: number;
  /** Hostname substrings this adapter applies to (matched case-insensitively). */
  match: readonly string[];
  /** CSS selectors — used when the caller holds the raw DOM. */
  selectors?: {
    container?: string;
    price?: string;
    deadline?: string;
    registration?: string;
    post?: string;
  };
  /** Regexes applied to the extracted text. The first capture group wins. */
  patterns?: {
    price?: RegExp;
    deadline?: RegExp;
    registration?: RegExp;
    version?: RegExp;
  };
  /** Human note for maintainers. */
  notes?: string;
}

/** Current schema version for the bundled adapter set. */
export const SITE_ADAPTERS_VERSION = 1;

const BUILTIN_ADAPTERS: readonly SiteAdapter[] = [
  {
    id: "naukri",
    version: 1,
    match: ["naukri.com"],
    selectors: { container: ".jobTuple", price: ".salary", deadline: ".last-date" },
    patterns: {
      deadline: /(?:last date|apply by|deadline)\s*[:\-]?\s*([0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})/i,
    },
    notes: "Job listings; salary text is not a numeric price, so price detection is off.",
  },
  {
    id: "github-releases",
    version: 1,
    match: ["github.com"],
    selectors: { container: ".release", deadline: undefined },
    patterns: {
      version: /\bv?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)\b/,
    },
    notes: "Release pages: the first semver-looking token is treated as the version.",
  },
  {
    id: "gov-exam-portal",
    version: 1,
    match: ["ssc.gov.in", "nta.ac.in", "ntaexam.nic.in", "upsc.gov.in", "ibps.in"],
    selectors: { deadline: ".deadline, .last-date", registration: ".apply-online" },
    patterns: {
      deadline: /(?:last date|closing date|registration (?:ends|closes))\s*[:\-]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i,
      registration: /\b(apply online|registration (?:is )?open|apply now)\b/i,
    },
    notes: "Exam/registration portals: deadline + 'apply online' flag drive alerts.",
  },
  {
    id: "amazon-product",
    version: 1,
    match: ["amazon.", "amazon.in", "amazon.com"],
    selectors: { container: "#productTitle", price: ".a-price .a-offscreen" },
    patterns: {
      price: /(?:₹|rs\.?|\$)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    },
    notes: "Storefront price parsing; currency prefixes are stripped before the number.",
  },
  {
    id: "generic-store",
    version: 1,
    match: ["flipkart.com", "myntra.com", "ajio.com"],
    selectors: { price: "._30jeq3, .pdp-price" },
    patterns: { price: /(?:₹|rs\.?)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/i },
    notes: "Generic Indian storefront price shape.",
  },
];

/** All bundled adapters (a copy — callers may append their own). */
export function listSiteAdapters(): SiteAdapter[] {
  return BUILTIN_ADAPTERS.map((adapter) => ({ ...adapter }));
}

/** Resolve the adapter whose `match` covers `url`'s hostname, if any. */
export function resolveSiteAdapter(
  url: string,
  adapters: readonly SiteAdapter[] = BUILTIN_ADAPTERS,
): SiteAdapter | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }
  return adapters.find((adapter) => adapter.match.some((needle) => host.includes(needle.toLowerCase())));
}

/** Parse a loosely formatted number (`₹1,23,456.78`) into a number. */
export function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return undefined;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Normalise a free-text deadline into an ISO date (`YYYY-MM-DD`) when it is
 * parseable, falling back to the collapsed original text.
 */
export function normalizeDeadline(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return undefined;
  const parsed = Date.parse(collapsed);
  if (Number.isFinite(parsed)) {
    const date = new Date(parsed);
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  const dayFirst = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(collapsed);
  if (dayFirst) {
    const [, d, m, y] = dayFirst;
    const year = y && y.length === 2 ? `20${y}` : y;
    const iso = `${year}-${(m ?? "01").padStart(2, "0")}-${(d ?? "01").padStart(2, "0")}`;
    return iso;
  }
  return collapsed;
}

function firstGroup(pattern: RegExp | undefined, text: string): string | undefined {
  if (!pattern) return undefined;
  const match = pattern.exec(text);
  if (!match) return undefined;
  return match[1] ?? match[0];
}

/**
 * Apply an adapter's patterns to extracted `text` and return the recognised
 * signals. Pure; never throws; missing adapter simply yields `{}`.
 */
export function extractSignals(
  text: string,
  adapter: SiteAdapter | undefined,
): SiteSignals {
  if (!adapter || !adapter.patterns) return {};
  const signals: SiteSignals = {};

  const price = parseNumber(firstGroup(adapter.patterns.price, text));
  if (price !== undefined) signals.price = price;

  const deadline = normalizeDeadline(firstGroup(adapter.patterns.deadline, text));
  if (deadline) signals.deadline = deadline;

  if (adapter.patterns.registration) {
    signals.registrationOpen = adapter.patterns.registration.test(text);
  }

  const version = firstGroup(adapter.patterns.version, text);
  if (version) signals.version = version;

  return signals;
}
