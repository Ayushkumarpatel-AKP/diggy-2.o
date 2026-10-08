import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import { tokens } from "@diggy/shared";
import "../../assets/app.css";

/** Must match `PROVIDER_KEYS_STORAGE` in the background. */
const STORAGE_KEY = "diggy:providers";

interface ProviderKeys {
  groq?: string;
  nvidia?: string;
}

const label: CSSProperties = {
  display: "block",
  marginBottom: 6,
  color: tokens.color.muted,
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const input: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: tokens.radius.md,
  border: `1px solid ${tokens.color.line}`,
  background: tokens.color.surface,
  color: tokens.color.ink,
  font: `13px ${tokens.font.sans}`,
};

const card: CSSProperties = {
  background: tokens.color.surface,
  border: `1px solid ${tokens.color.line}`,
  borderRadius: tokens.radius.lg,
  boxShadow: tokens.shadow.sm,
  padding: 20,
  marginBottom: 16,
};

function Settings() {
  const [groq, setGroq] = useState("");
  const [nvidia, setNvidia] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    void browser.storage.local.get(STORAGE_KEY).then((stored) => {
      const keys = (stored[STORAGE_KEY] as ProviderKeys | undefined) ?? {};
      setGroq(keys.groq ?? "");
      setNvidia(keys.nvidia ?? "");
    });
  }, []);

  async function save(): Promise<void> {
    const keys: ProviderKeys = {};
    if (groq.trim()) keys.groq = groq.trim();
    if (nvidia.trim()) keys.nvidia = nvidia.trim();
    await browser.storage.local.set({ [STORAGE_KEY]: keys });
    setSavedAt(new Date().toLocaleTimeString());
  }

  return (
    <main style={{ background: tokens.color.bg, minHeight: "100vh", padding: 28 }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <h1 style={{ margin: 0, color: tokens.color.ink, font: `600 22px ${tokens.font.sans}` }}>
          DIGGY Settings
        </h1>
        <p style={{ margin: "6px 0 22px", color: tokens.color.muted, font: `13px ${tokens.font.sans}` }}>
          Press <strong>Ctrl+Space</strong> on any page to talk to DIGGY. It answers out loud, like a
          chat assistant.
        </p>

        <section style={card}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, color: tokens.color.ink }}>Model keys</h2>
          <p style={{ margin: "0 0 16px", color: tokens.color.muted, fontSize: 12 }}>
            Used for speech-to-text and the reply. Stored only on this device — never sent anywhere
            except the provider you choose. Groq is primary; NVIDIA NIM is the failover.
          </p>

          <label style={label} htmlFor="groq">
            Groq API key
          </label>
          <input
            id="groq"
            style={input}
            type="password"
            placeholder="gsk_…"
            value={groq}
            onChange={(event) => setGroq(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />

          <label style={{ ...label, marginTop: 16 }} htmlFor="nvidia">
            NVIDIA NIM API key (optional)
          </label>
          <input
            id="nvidia"
            style={input}
            type="password"
            placeholder="nvapi-…"
            value={nvidia}
            onChange={(event) => setNvidia(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
            <button
              type="button"
              onClick={() => void save()}
              style={{
                padding: "10px 18px",
                borderRadius: tokens.radius.pill,
                border: `1px solid ${tokens.color.primary}`,
                background: tokens.color.primary,
                color: tokens.color.primaryInk,
                fontWeight: 600,
                font: `600 13px ${tokens.font.sans}`,
                cursor: "pointer",
              }}
            >
              Save
            </button>
            {savedAt ? (
              <span style={{ color: tokens.color.success, fontSize: 12 }}>Saved {savedAt}</span>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<Settings />);
}
