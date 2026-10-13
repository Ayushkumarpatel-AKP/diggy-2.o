/**
 * Spoken approvals.
 *
 * The panel's Allow / Not now card is replaced by voice: DIGGY speaks the
 * question and listens for a yes/no. Only an explicit spoken answer resolves it —
 * an ambiguous reply is treated as **no** (the safe reading) and a deny always
 * wins over a yes in the same sentence. Pure helpers, so the interpretation is
 * unit-tested rather than eyeballed.
 *
 * Sending stays impossible to do silently: this only supplies the *answer*; the
 * `send` tool still asks every time, and sensitive sites are still refused.
 */

/** Words that mean "go ahead". Kept deliberately narrow. */
export const APPROVAL_YES =
  /\b(yes|yeah|yep|yup|okay|ok|sure|allow|allowed|approve|approved|confirm|confirmed|proceed|continue|carry on|go ahead|go for it|do it|please do|affirmative|haan|han|theek|thik)\b/i;

/** Words that mean "stop". Handles both the straight and curly apostrophe. */
export const APPROVAL_NO =
  /\b(no|nope|nah|naw|cancel|cancelled|canceled|stop|dismiss|deny|denied|don['’]?t|do not|not now|abort|never ?mind|negative|mat|nahi|nahin)\b/i;

/**
 * Read a spoken reply into an approval.
 *
 * @returns `true` = allow, `false` = deny, `null` = not an answer (so the caller
 *   keeps listening or falls back). A deny beats a yes when both appear.
 */
export function interpretApproval(text: unknown): boolean | null {
  const said = typeof text === "string" ? text.trim().toLowerCase() : "";
  if (said === "") return null;
  if (APPROVAL_NO.test(said)) return false;
  if (APPROVAL_YES.test(said)) return true;
  return null;
}

/** The sentence DIGGY speaks before it listens. */
export function approvalQuestion(title: string, detail?: string): string {
  const head = [title, detail]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "")
    .join(" ");
  return `${head} Say yes to allow, or no to stop.`.trim();
}

/**
 * Roughly how long the spoken question takes (ms), so the microphone opens after
 * the avatar has finished speaking instead of hearing itself.
 */
export function speechDurationMs(question: string): number {
  const text = typeof question === "string" ? question : "";
  return Math.min(6000, 600 + text.length * 55);
}
