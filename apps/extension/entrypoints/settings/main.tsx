import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import { tokens } from "@diggy/shared";
import "../../assets/app.css";
import {
  normalizeSettings,
  originPattern,
  presetById,
  PROVIDER_PRESETS,
  SETTINGS_KEY,
  settingsReady,
  type ProviderSettings,
} from "../../src/provider-settings.js";

const label: CSSProperties = {
  display: "block",
  marginBottom: 6,
  color: tokens.color.muted,
  fontSize: 11,
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

function Field({
  id,
  title,
  value,
  hint,
  placeholder,
  type,
  onChange,
}: {
  id: string;
  title: string;
  value: string;
  hint?: string;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <label style={label} htmlFor={id}>
        {title}
      </label>
      <input
        id={id}
        style={input}
        type={type ?? "text"}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {hint ? (
        <p style={{ margin: "6px 0 0", color: tokens.color.muted, fontSize: 11 }}>{hint}</p>
      ) : null}
    </div>
  );
}

function Settings() {
  const [settings, setSettings] = useState<ProviderSettings>(() => normalizeSettings(undefined));
  const [status, setStatus] = useState("");

  useEffect(() => {
    void browser.storage.local.get(SETTINGS_KEY).then((stored) => {
      setSettings(normalizeSettings(stored[SETTINGS_KEY]));
    });
  }, []);

  const preset = presetById(settings.presetId);
  const ready = settingsReady(settings);

  function update(partial: Partial<ProviderSettings>): void {
    setSettings((current) => ({ ...current, ...partial }));
    setStatus("");
  }

  function choosePreset(id: string): void {
    const next = presetById(id);
    if (!next) return;
    update({ presetId: id, baseUrl: next.baseUrl, model: next.model, sttModel: next.sttModel });
  }

  async function save(): Promise<void> {
    // Persist first: the settings must survive even if the permission prompt is
    // dismissed or unavailable.
    await browser.storage.local.set({ [SETTINGS_KEY]: settings });
    setStatus(`Saved at ${new Date().toLocaleTimeString()}`);

    // Fetching a provider needs host permission for its origin. Ask while we still
    // have the user's gesture (a silent request would be refused); best-effort.
    const pattern = originPattern(settings.baseUrl);
    if (pattern) {
      void browser.permissions
        .request({ origins: [pattern] })
        .catch(() => undefined);
    }
  }

  return (
    <main style={{ background: tokens.color.bg, minHeight: "100vh", padding: 28 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ margin: 0, color: tokens.color.ink, font: `600 22px ${tokens.font.sans}` }}>
          DIGGY Settings
        </h1>
        <p style={{ margin: "6px 0 22px", color: tokens.color.muted, font: `13px ${tokens.font.sans}` }}>
          Press <strong>Ctrl+Space</strong> on any page to talk to DIGGY: your words appear in the
          avatar&apos;s bubble as you speak, and the answer is spoken back in a natural voice.
        </p>

        <section style={card}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, color: tokens.color.ink }}>Model source</h2>
          <p style={{ margin: "0 0 14px", color: tokens.color.muted, fontSize: 12 }}>
            Pick any OpenAI-compatible provider. The key is stored only on this device and is sent
            to nobody except the endpoint below.
          </p>

          <label style={label} htmlFor="preset">
            Provider
          </label>
          <select
            id="preset"
            style={input}
            value={settings.presetId}
            onChange={(event) => choosePreset(event.target.value)}
          >
            {PROVIDER_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>

          <Field
            id="key"
            title={preset?.needsKey === false ? "API key (not needed for this provider)" : "API key"}
            value={settings.apiKey}
            type="password"
            placeholder={preset?.needsKey === false ? "not required" : "paste your key"}
            hint={preset?.hint ? `Get one at ${preset.hint}` : undefined}
            onChange={(value) => update({ apiKey: value })}
          />
          <Field
            id="base"
            title="Base URL"
            value={settings.baseUrl}
            placeholder="https://api.example.com/v1"
            hint="Any OpenAI-compatible endpoint, including a local server."
            onChange={(value) => update({ baseUrl: value })}
          />
          <Field
            id="model"
            title="Chat model"
            value={settings.model}
            placeholder="gpt-4o-mini"
            onChange={(value) => update({ model: value })}
          />
          <Field
            id="stt"
            title="Speech-to-text model (optional)"
            value={settings.sttModel}
            placeholder="whisper-large-v3"
            hint="Only used by the fallback recorder path."
            onChange={(value) => update({ sttModel: value })}
          />
          <Field
            id="lang"
            title="Language"
            value={settings.lang}
            placeholder="en-IN"
            hint="Language tag for dictation and the spoken reply, e.g. en-IN, en-US, hi-IN."
            onChange={(value) => update({ lang: value })}
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
                font: `600 13px ${tokens.font.sans}`,
                cursor: "pointer",
              }}
            >
              Save
            </button>
            <span
              style={{
                fontSize: 12,
                color: status ? tokens.color.success : ready ? tokens.color.muted : tokens.color.warning,
              }}
            >
              {status || (ready ? "Ready" : "Add an API key to start chatting")}
            </span>
          </div>
        </section>

        <section style={card}>
          <h2 style={{ margin: "0 0 8px", fontSize: 15, color: tokens.color.ink }}>How to use</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: tokens.color.inkSoft, fontSize: 13, lineHeight: 1.7 }}>
            <li>
              <strong>Ctrl+Space</strong> — start talking. What you say appears in the avatar bubble.
            </li>
            <li>
              <strong>Ctrl+Space again</strong> — stop; DIGGY answers out loud.
            </li>
            <li>Click the microphone button in the side panel for the same toggle.</li>
            <li>
              <strong>Summarize / Explain / Track</strong> in the side panel act on the page you are on.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<Settings />);
}
