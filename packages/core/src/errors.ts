/**
 * Provider error classification + user-facing messages.
 *
 * One place decides whether a failure is a rate limit, an auth problem, a dead
 * model, a network blip or a server hiccup. The registry uses `kind` +
 * `retryable` to decide whether to back off, skip a provider, or fail over;
 * the UI uses {@link friendlyError} to say one short human sentence. Raw status
 * codes and JSON bodies never reach the user.
 */

export type ErrorKind =
  | "rate-limit"
  | "auth"
  | "model"
  | "network"
  | "server"
  | "timeout"
  | "empty"
  | "unknown";

/** Classify a raw error/message/string into a {@link ErrorKind}. */
export function classifyError(error: unknown): ErrorKind {
  if (error instanceof ProviderError) return error.kind;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const text = raw.toLowerCase();

  if (/rate limit|429|too many requests|quota|exceeded|tokens per minute|\btpm\b|\brpd\b|billing|insufficient/.test(text)) {
    return "rate-limit";
  }
  if (/401|403|unauthor|invalid.*(api|key)|api key|forbidden|permission/.test(text)) return "auth";
  if (/404|not found|decommissioned|does not exist|model.*(invalid|unknown)|no such model/.test(text)) {
    return "model";
  }
  if (
    /failed to fetch|fetch failed|network|econnrefused|econnreset|dns|offline|socket hang up|enotfound/.test(text)
  ) {
    return "network";
  }
  if (/timeout|timed out|abort|etimedout/.test(text)) return "timeout";
  if (/\b5\d\d\b|internal server|bad gateway|service unavailable|overloaded/.test(text)) return "server";
  if (/empty (reply|response)|no content|nothing to add/.test(text)) return "empty";
  return "unknown";
}

export interface ProviderErrorOptions {
  provider: string;
  status?: number;
  kind?: ErrorKind;
  cause?: unknown;
}

/** A single provider failure, carrying everything the registry needs. */
export class ProviderError extends Error {
  readonly provider: string;
  readonly status: number | undefined;
  readonly kind: ErrorKind;

  constructor(message: string, options: ProviderErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ProviderError";
    this.provider = options.provider;
    this.status = options.status;
    this.kind = options.kind ?? classifyError(message);
  }

  /** True when retrying the *same* provider could plausibly succeed. */
  get retryable(): boolean {
    if (this.kind === "rate-limit" || this.kind === "server" || this.kind === "network" || this.kind === "timeout") {
      return true;
    }
    return false;
  }
}

export interface FriendlyErrorOptions {
  /** The provider that failed last, for a slightly more specific sentence. */
  provider?: string;
  /** True when the brain already tried the fallback provider. */
  switched?: boolean;
}

/** A short message safe to show in the chat bubble. */
export function friendlyError(error: unknown, options: FriendlyErrorOptions = {}): string {
  switch (classifyError(error)) {
    case "rate-limit":
      return options.switched
        ? "⏳ Dono brain busy hain (free limit). Ek minute ruk ke phir bolo — main turant reply karunga."
        : "⏳ Thoda load zyada hai (free limit). Ek minute ruk ke phir bolo, ya ⚙ me dusri key daal do.";
    case "auth":
      return "🔑 API key kaam nahi kar rahi. ⚙ Settings khol ke key dobara check kar lo.";
    case "model":
      return "🤖 Ye model ab available nahi hai. ⚙ Settings me model badal do (jaise openai/gpt-oss-120b).";
    case "network":
      return "🌐 Connection me dikkat lag rahi hai. Net check karke ek baar phir bolo.";
    case "timeout":
      return "🐢 Jawab aane me bahut der ho gayi. Ek baar phir bolo.";
    case "server":
      return "😴 Provider ki taraf se server busy hai. Thodi der me phir try karo.";
    case "empty":
      return "🤔 Model ne kuch jawab nahi diya — ek baar phir bol do.";
    default:
      return "😅 Kuch gadbad ho gayi. Ek baar phir bolo — na ho to ⚙ settings check kar lo.";
  }
}

/** A compact one-line summary for logs (never shown to the user). */
export function errorDetail(error: unknown, limit = 200): string {
  const raw = (error instanceof Error ? error.message : String(error ?? ""))
    .replace(/\s+/g, " ")
    .trim();
  return raw.length > limit ? `${raw.slice(0, limit)}…` : raw;
}
