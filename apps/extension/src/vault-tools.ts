/**
 * Vault tools for the agent — the read-only half, plus a gated lookup.
 *
 * The Vault exists so DIGGY can answer "what's my email" without the user
 * retyping it, while a locked field stays locked. That shapes the tool surface:
 *
 * - `readProfile` returns only the **shared** fields. Locked ones come back as
 *   `{{LOCKED:key}}` tokens, exactly as `Vault.getProfile` produces them, so the
 *   model can see that a value exists and ask for it — but never receives it.
 * - `vaultLookup` resolves one locked field, and only after the user approves
 *   *that* use. The approval is a callback the host supplies, which is why this
 *   module cannot unilaterally release a secret.
 *
 * There is no `vaultWrite` and no bulk release: a tool that could hand over the
 * whole vault would make the per-field approval theatre.
 */
import type { AgentToolShape } from "@diggy/page-agent";
import type { ProfileSchema } from "@diggy/shared";

/** The slice of the vault runtime this module needs. */
export interface VaultAccess {
  /** Shared fields; locked ones are `{{LOCKED:key}}`. */
  profile(): Promise<ProfileSchema>;
  /** Resolve one locked field, if the user approves this use. */
  resolve(key: string, approve: () => boolean | Promise<boolean>): Promise<string | null>;
}

export interface VaultToolOptions {
  vault: VaultAccess;
  /** Ask the user to approve releasing one field. Deny by default. */
  requestApproval: (request: { key: string; label: string }) => Promise<boolean>;
}

function schema(
  name: string,
  description: string,
  properties: Record<string, { type: string; description: string }>,
  required: string[] = [],
): AgentToolShape["schema"] {
  const parameters: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) parameters["required"] = required;
  return { name, description, parameters };
}

/** Flatten the profile into `key — value` lines the model can read. */
export function renderProfile(profile: ProfileSchema): string {
  const lines: string[] = [];
  for (const [key, raw] of Object.entries(profile as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const field = raw as { label?: unknown; value?: unknown };
    const label = typeof field.label === "string" ? field.label : key;
    const value = field.value;
    if (Array.isArray(value)) {
      lines.push(`${label}: ${value.join(", ")}`);
    } else if (value && typeof value === "object") {
      const pairs = Object.entries(value as Record<string, unknown>)
        .map(([name, link]) => `${name}: ${String(link)}`)
        .join(", ");
      lines.push(`${label}: ${pairs}`);
    } else if (value !== undefined && value !== null) {
      lines.push(`${label}: ${String(value)}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "The vault is empty.";
}

export function vaultTools(options: VaultToolOptions): AgentToolShape[] {
  return [
    {
      schema: schema(
        "readProfile",
        "Read the user's saved profile — the fields they marked as shareable. Locked fields appear as {{LOCKED:key}} tokens; use vaultLookup to actually get one.",
        {},
      ),
      run: async () => {
        const profile = await options.vault.profile();
        return { ok: true, content: renderProfile(profile) };
      },
    },
    {
      schema: schema(
        "vaultLookup",
        "Get the real value of ONE locked vault field, e.g. to fill a form. The user is asked to approve each lookup, so only request the field you actually need right now.",
        {
          key: { type: "string", description: "The field key, e.g. 'phone' or 'aadhaar'." },
          reason: { type: "string", description: "One short sentence on why you need it." },
        },
        ["key"],
      ),
      run: async (args) => {
        const key = typeof args["key"] === "string" ? args["key"].trim() : "";
        if (key === "") return { ok: false, error: "A key is required." };
        const reason = typeof args["reason"] === "string" ? args["reason"].trim() : "";

        const profile = await options.vault.profile();
        const field = (profile as Record<string, unknown>)[key] as
          | { label?: unknown }
          | undefined;
        const label = typeof field?.label === "string" ? field.label : key;

        const approved = await options.requestApproval({ key, label: reason ? `${label} — ${reason}` : label });
        if (!approved) return { ok: false, error: `The user did not approve releasing "${label}".` };

        const value = await options.vault.resolve(key, () => true);
        // The approved gate has already been honoured above; resolveLocal's own
        // gate is satisfied by the callback, not bypassed.
        if (value === null) return { ok: false, error: `"${label}" is not in the vault, or the vault is locked.` };
        return { ok: true, content: `${label}: ${value}` };
      },
    },
  ];
}
