import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import { tokens } from "@diggy/shared";
import "../../assets/app.css";
import {
  FALLBACK_KEY,
  normalizeSettings,
  originPattern,
  presetById,
  PROVIDER_PRESETS,
  SETTINGS_KEY,
  settingsReady,
  type FallbackSettings,
  type ProviderSettings,
} from "../../src/provider-settings.js";
import {
  connectGoogle,
  disconnectGoogle,
  googleRedirectUrl,
  googleStatus,
  type GoogleStatus,
} from "../../src/google.js";

const GOOGLE_CLIENT_ID_KEY = "diggy:google-client-id";

/** Written by this page only; read by the search fallback chain. */
const SEARCH_KEY = "diggy:search";

interface SearchSettings {
  tavilyKey: string;
  preferLocal: boolean;
}

function normalizeSearch(raw: unknown): SearchSettings {
  const value = (raw ?? {}) as Partial<SearchSettings>;
  return {
    tavilyKey: typeof value.tavilyKey === "string" ? value.tavilyKey : "",
    preferLocal: value.preferLocal === true,
  };
}

/** One tiny real request against an OpenAI-compatible endpoint. Never exposes the key. */
async function probeProvider(baseUrl: string, apiKey: string, model: string): Promise<string> {
  const base = baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  try {
    const listed = await fetch(`${base}/models`, { headers });
    if (listed.ok) {
      const data = (await listed.json()) as { data?: unknown };
      const count = Array.isArray(data.data) ? data.data.length : null;
      return count === null
        ? "Connection OK — the endpoint answered /models."
        : `Connection OK — ${count} model(s) listed.`;
    }
  } catch {
    // Fall through to the 1-token chat probe below.
  }
  const chat = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
    }),
  });
  if (!chat.ok) {
    throw new Error(
      `The endpoint answered HTTP ${chat.status} — check the key, base URL and model.`,
    );
  }
  return "Connection OK — a 1-token chat completion succeeded.";
}

/** One real Tavily search; reports how many results came back. */
async function probeSearch(key: string): Promise<string> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key.trim()}`,
    },
    body: JSON.stringify({
      query: "DIGGY connectivity probe",
      max_results: 3,
      search_depth: "basic",
    }),
  });
  if (!res.ok) {
    throw new Error(`Tavily answered HTTP ${res.status} — check the API key.`);
  }
  const data = (await res.json()) as { results?: unknown };
  const count = Array.isArray(data.results) ? data.results.length : 0;
  return `Search OK — ${count} result(s) came back.`;
}

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
  const [primaryTest, setPrimaryTest] = useState("");
  const [primaryBusy, setPrimaryBusy] = useState(false);
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const [fallbackPresetId, setFallbackPresetId] = useState("nvidia");
  const [fallbackApiKey, setFallbackApiKey] = useState("");
  const [fallbackBaseUrl, setFallbackBaseUrl] = useState(
    () => presetById("nvidia")?.baseUrl ?? "",
  );
  const [fallbackModel, setFallbackModel] = useState(() => presetById("nvidia")?.model ?? "");
  const [fallbackStatus, setFallbackStatus] = useState("");
  const [fallbackBusy, setFallbackBusy] = useState(false);
  const [tavilyKey, setTavilyKey] = useState("");
  const [preferLocal, setPreferLocal] = useState(false);
  const [searchStatus, setSearchStatus] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [google, setGoogle] = useState<GoogleStatus>({ connected: false });
  const [googleLine, setGoogleLine] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");

  useEffect(() => {
    void browser.storage.local.get(SETTINGS_KEY).then((stored) => {
      setSettings(normalizeSettings(stored[SETTINGS_KEY]));
    });
    void browser.storage.local.get(FALLBACK_KEY).then((stored) => {
      const raw = stored[FALLBACK_KEY] as Partial<FallbackSettings> | undefined;
      if (raw && typeof raw.presetId === "string" && raw.presetId) {
        const preset = presetById(raw.presetId);
        setFallbackEnabled(true);
        setFallbackPresetId(raw.presetId);
        setFallbackApiKey(typeof raw.apiKey === "string" ? raw.apiKey : "");
        setFallbackBaseUrl(
          typeof raw.baseUrl === "string" && raw.baseUrl ? raw.baseUrl : (preset?.baseUrl ?? ""),
        );
        setFallbackModel(
          typeof raw.model === "string" && raw.model ? raw.model : (preset?.model ?? ""),
        );
      }
    });
    void browser.storage.local.get(SEARCH_KEY).then((stored) => {
      const next = normalizeSearch(stored[SEARCH_KEY]);
      setTavilyKey(next.tavilyKey);
      setPreferLocal(next.preferLocal);
    });
    setRedirectUri(googleRedirectUrl());
    void browser.storage.local.get(GOOGLE_CLIENT_ID_KEY).then((stored) => {
      const value = stored[GOOGLE_CLIENT_ID_KEY];
      if (typeof value === "string") setGoogleClientId(value);
    });
    void googleStatus().then(setGoogle);
  }, []);

  function setGoogleClient(value: string): void {
    setGoogleClientId(value);
    setGoogleLine("");
    void browser.storage.local.set({ [GOOGLE_CLIENT_ID_KEY]: value });
  }

  async function connect(): Promise<void> {
    const clientId = googleClientId.trim();
    if (!clientId) return;
    setGoogleBusy(true);
    setGoogleLine("Connecting…");
    try {
      const next = await connectGoogle(clientId);
      setGoogle(next);
      setGoogleLine(next.email ? `Connected as ${next.email}` : "Connected to Google.");
    } catch (error) {
      setGoogleLine(error instanceof Error ? error.message : "Could not connect to Google.");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function disconnect(): Promise<void> {
    setGoogleBusy(true);
    try {
      await disconnectGoogle();
      setGoogle({ connected: false });
      setGoogleLine("Disconnected.");
    } catch (error) {
      setGoogleLine(error instanceof Error ? error.message : "Could not disconnect from Google.");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function copyRedirect(): Promise<void> {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setGoogleLine("Redirect URI copied.");
    } catch {
      setGoogleLine("Could not copy — select the field and copy it manually.");
    }
  }

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

  async function testPrimary(): Promise<void> {
    setPrimaryBusy(true);
    setPrimaryTest("Testing…");
    try {
      const line = await probeProvider(settings.baseUrl, settings.apiKey, settings.model);
      setPrimaryTest(`✓ ${line}`);
    } catch (error) {
      setPrimaryTest(`✗ ${error instanceof Error ? error.message : "Connection failed."}`);
    } finally {
      setPrimaryBusy(false);
    }
  }

  function chooseFallbackPreset(id: string): void {
    const next = presetById(id);
    if (!next) return;
    setFallbackPresetId(id);
    setFallbackBaseUrl(next.baseUrl);
    setFallbackModel(next.model);
    setFallbackStatus("");
  }

  async function saveFallback(): Promise<void> {
    if (!fallbackEnabled) {
      await browser.storage.local.remove(FALLBACK_KEY);
      setFallbackStatus(`Fallback disabled at ${new Date().toLocaleTimeString()}`);
      return;
    }
    const value: FallbackSettings = {
      presetId: fallbackPresetId,
      apiKey: fallbackApiKey,
      baseUrl: fallbackBaseUrl,
      model: fallbackModel,
    };
    await browser.storage.local.set({ [FALLBACK_KEY]: value });
    setFallbackStatus(`Saved at ${new Date().toLocaleTimeString()}`);
    const pattern = originPattern(fallbackBaseUrl);
    if (pattern) {
      void browser.permissions
        .request({ origins: [pattern] })
        .catch(() => undefined);
    }
  }

  async function testFallback(): Promise<void> {
    setFallbackBusy(true);
    setFallbackStatus("Testing…");
    try {
      const line = await probeProvider(fallbackBaseUrl, fallbackApiKey, fallbackModel);
      setFallbackStatus(`✓ ${line}`);
    } catch (error) {
      setFallbackStatus(`✗ ${error instanceof Error ? error.message : "Connection failed."}`);
    } finally {
      setFallbackBusy(false);
    }
  }

  async function saveSearch(): Promise<void> {
    const value: SearchSettings = { tavilyKey, preferLocal };
    await browser.storage.local.set({ [SEARCH_KEY]: value });
    setSearchStatus(`Saved at ${new Date().toLocaleTimeString()}`);
  }

  async function testSearch(): Promise<void> {
    if (!tavilyKey.trim()) {
      setSearchStatus("✗ Paste a Tavily API key first.");
      return;
    }
    setSearchBusy(true);
    setSearchStatus("Searching…");
    try {
      const line = await probeSearch(tavilyKey);
      setSearchStatus(`✓ ${line}`);
    } catch (error) {
      setSearchStatus(`✗ ${error instanceof Error ? error.message : "Search failed."}`);
    } finally {
      setSearchBusy(false);
    }
  }

  const fallbackPreset = presetById(fallbackPresetId);

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
            <button
              type="button"
              disabled={primaryBusy}
              onClick={() => void testPrimary()}
              style={{
                padding: "10px 18px",
                borderRadius: tokens.radius.pill,
                border: `1px solid ${tokens.color.line}`,
                background: tokens.color.surface,
                color: tokens.color.ink,
                font: `600 13px ${tokens.font.sans}`,
                cursor: primaryBusy ? "not-allowed" : "pointer",
                opacity: primaryBusy ? 0.5 : 1,
              }}
            >
              {primaryBusy ? "Testing…" : "Test"}
            </button>
            <span
              style={{
                fontSize: 12,
                color: primaryTest
                  ? primaryTest.startsWith("✓")
                    ? tokens.color.success
                    : tokens.color.warning
                  : status
                    ? tokens.color.success
                    : ready
                      ? tokens.color.muted
                      : tokens.color.warning,
              }}
            >
              {primaryTest || status || (ready ? "Ready" : "Add an API key to start chatting")}
            </span>
          </div>
        </section>

        <section style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 15, color: tokens.color.ink }}>Fallback model</h2>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: tokens.color.muted }}>
              <input
                id="fallback-enabled"
                type="checkbox"
                checked={fallbackEnabled}
                onChange={(event) => {
                  setFallbackEnabled(event.target.checked);
                  setFallbackStatus("");
                }}
              />
              Enabled
            </label>
          </div>
          <p style={{ margin: "0 0 14px", color: tokens.color.muted, fontSize: 12 }}>
            Used automatically when the primary is rate-limited, out of quota or down — this is
            what keeps DIGGY working on the free tiers.
          </p>

          <label style={label} htmlFor="fallback-preset">
            Provider
          </label>
          <select
            id="fallback-preset"
            style={input}
            value={fallbackPresetId}
            disabled={!fallbackEnabled}
            onChange={(event) => chooseFallbackPreset(event.target.value)}
          >
            {PROVIDER_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>

          <Field
            id="fallback-key"
            title={
              fallbackPreset?.needsKey === false
                ? "API key (not needed for this provider)"
                : "API key"
            }
            value={fallbackApiKey}
            type="password"
            placeholder={fallbackPreset?.needsKey === false ? "not required" : "paste your key"}
            hint={fallbackPreset?.hint ? `Get one at ${fallbackPreset.hint}` : undefined}
            onChange={(value) => {
              setFallbackApiKey(value);
              setFallbackStatus("");
            }}
          />
          <Field
            id="fallback-base"
            title="Base URL"
            value={fallbackBaseUrl}
            placeholder="https://api.example.com/v1"
            hint="Any OpenAI-compatible endpoint, including a local server."
            onChange={(value) => {
              setFallbackBaseUrl(value);
              setFallbackStatus("");
            }}
          />
          <Field
            id="fallback-model"
            title="Chat model"
            value={fallbackModel}
            placeholder="gpt-4o-mini"
            onChange={(value) => {
              setFallbackModel(value);
              setFallbackStatus("");
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
            <button
              type="button"
              onClick={() => void saveFallback()}
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
              {fallbackEnabled ? "Save" : "Disable"}
            </button>
            <button
              type="button"
              disabled={fallbackBusy || !fallbackEnabled}
              onClick={() => void testFallback()}
              style={{
                padding: "10px 18px",
                borderRadius: tokens.radius.pill,
                border: `1px solid ${tokens.color.line}`,
                background: tokens.color.surface,
                color: tokens.color.ink,
                font: `600 13px ${tokens.font.sans}`,
                cursor: fallbackBusy || !fallbackEnabled ? "not-allowed" : "pointer",
                opacity: fallbackBusy || !fallbackEnabled ? 0.5 : 1,
              }}
            >
              {fallbackBusy ? "Testing…" : "Test"}
            </button>
            <span
              style={{
                fontSize: 12,
                color: fallbackStatus
                  ? fallbackStatus.startsWith("✓")
                    ? tokens.color.success
                    : fallbackStatus.startsWith("✗")
                      ? tokens.color.warning
                      : tokens.color.success
                  : tokens.color.muted,
              }}
            >
              {fallbackStatus || (fallbackEnabled ? "Fallback in use when primary fails" : "Fallback off")}
            </span>
          </div>
        </section>

        <section style={card}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, color: tokens.color.ink }}>Web search</h2>
          <p style={{ margin: "0 0 14px", color: tokens.color.muted, fontSize: 12 }}>
            Search order: Tavily → local crawler → keyless Tavily.
          </p>

          <Field
            id="search-key"
            title="Tavily API key"
            value={tavilyKey}
            type="password"
            placeholder="paste your Tavily key"
            onChange={(value) => {
              setTavilyKey(value);
              setSearchStatus("");
            }}
          />

          <div style={{ marginTop: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: tokens.color.inkSoft }}>
              <input
                id="search-prefer-local"
                type="checkbox"
                checked={preferLocal}
                onChange={(event) => {
                  setPreferLocal(event.target.checked);
                  setSearchStatus("");
                }}
              />
              Prefer my local crawler (127.0.0.1:17322) over the hosted API
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
            <button
              type="button"
              onClick={() => void saveSearch()}
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
            <button
              type="button"
              disabled={searchBusy}
              onClick={() => void testSearch()}
              style={{
                padding: "10px 18px",
                borderRadius: tokens.radius.pill,
                border: `1px solid ${tokens.color.line}`,
                background: tokens.color.surface,
                color: tokens.color.ink,
                font: `600 13px ${tokens.font.sans}`,
                cursor: searchBusy ? "not-allowed" : "pointer",
                opacity: searchBusy ? 0.5 : 1,
              }}
            >
              {searchBusy ? "Searching…" : "Test search"}
            </button>
            <span
              style={{
                fontSize: 12,
                color: searchStatus
                  ? searchStatus.startsWith("✓")
                    ? tokens.color.success
                    : searchStatus.startsWith("✗")
                      ? tokens.color.warning
                      : tokens.color.success
                  : tokens.color.muted,
              }}
            >
              {searchStatus || "Search runs without a key too, with lower limits"}
            </span>
          </div>
        </section>

        <section style={card}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, color: tokens.color.ink }}>Google &amp; Apps</h2>
          <p style={{ margin: "0 0 14px", color: tokens.color.muted, fontSize: 12 }}>
            Connect Gmail and Calendar with your own OAuth client. The client id is stored only on
            this device and no client secret is used.
          </p>

          <Field
            id="google-client"
            title="Client ID"
            value={googleClientId}
            placeholder="xxxxxxxx.apps.googleusercontent.com"
            hint="Paste the OAuth client id from Google Cloud Console."
            onChange={setGoogleClient}
          />

          <div style={{ marginTop: 14 }}>
            <label style={label} htmlFor="google-redirect">
              Redirect URI (register this exactly)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                id="google-redirect"
                style={input}
                value={redirectUri}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => void copyRedirect()}
                style={{
                  padding: "10px 14px",
                  borderRadius: tokens.radius.md,
                  border: `1px solid ${tokens.color.line}`,
                  background: tokens.color.surface,
                  color: tokens.color.ink,
                  font: `600 12px ${tokens.font.sans}`,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Copy
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
            <button
              type="button"
              disabled={googleBusy || !googleClientId.trim()}
              onClick={() => void connect()}
              style={{
                padding: "10px 18px",
                borderRadius: tokens.radius.pill,
                border: `1px solid ${tokens.color.primary}`,
                background: tokens.color.primary,
                color: tokens.color.primaryInk,
                font: `600 13px ${tokens.font.sans}`,
                cursor: googleBusy || !googleClientId.trim() ? "not-allowed" : "pointer",
                opacity: googleBusy || !googleClientId.trim() ? 0.5 : 1,
              }}
            >
              {googleBusy ? "Working…" : google.connected ? "Reconnect Google" : "Connect Google"}
            </button>
            {google.connected ? (
              <button
                type="button"
                disabled={googleBusy}
                onClick={() => void disconnect()}
                style={{
                  padding: "10px 18px",
                  borderRadius: tokens.radius.pill,
                  border: `1px solid ${tokens.color.line}`,
                  background: tokens.color.surface,
                  color: tokens.color.ink,
                  font: `600 13px ${tokens.font.sans}`,
                  cursor: googleBusy ? "not-allowed" : "pointer",
                }}
              >
                Disconnect
              </button>
            ) : null}
            <span
              style={{
                fontSize: 12,
                color: google.connected ? tokens.color.success : tokens.color.muted,
              }}
            >
              {googleLine ||
                (google.connected
                  ? `Connected${google.email ? ` as ${google.email}` : ""}`
                  : "Not connected")}
            </span>
          </div>

          <ol
            style={{
              margin: "16px 0 0",
              paddingLeft: 18,
              color: tokens.color.inkSoft,
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            <li>Create a Google Cloud project.</li>
            <li>
              Enable the <strong>Gmail API</strong> and <strong>Google Calendar API</strong>.
            </li>
            <li>
              OAuth consent screen: <strong>External</strong>, <strong>Testing</strong>, add your
              own account as a <strong>Test user</strong>.
            </li>
            <li>
              Credentials → <strong>Create OAuth client ID</strong> → type{" "}
              <strong>Web application</strong>.
            </li>
            <li>Add the redirect URI above, then paste the client id here.</li>
          </ol>
          <p style={{ margin: "8px 0 0", color: tokens.color.muted, fontSize: 11 }}>
            Gmail is a restricted scope; in Testing mode it works without app review, for the test
            users you add.
          </p>
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
