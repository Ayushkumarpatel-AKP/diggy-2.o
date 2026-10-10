/**
 * Setup — paste API keys in the side panel instead of the extension options page.
 *
 * A compact, self-contained form that lives inside the side panel and edits the
 * three credential groups (primary model, fallback model, web search). It is a
 * pure form: the host persists (no `chrome`/`browser`/`fetch` here).
 *
 * // INTERFACE FOR INTEGRATION
 * interface SetupPanelPreset { id: string; label: string; baseUrl: string; model: string;
 *   sttModel: string; needsKey: boolean }
 * interface SetupPanelProps {
 *   primary: { presetId: string; apiKey: string; baseUrl: string; model: string };
 *   fallback: { enabled: boolean; presetId: string; apiKey: string; baseUrl: string; model: string };
 *   search: { tavilyKey: string; preferLocal: boolean };
 *   presets: SetupPanelPreset[];
 *   onSave(values: {
 *     primary: { presetId: string; apiKey: string; baseUrl: string; model: string };
 *     fallback: { enabled: boolean; presetId: string; apiKey: string; baseUrl: string; model: string };
 *     search: { tavilyKey: string; preferLocal: boolean };
 *   }): void | Promise<void>;
 *   status?: string;
 *   onClose?: () => void;
 * }
 * function SetupPanel(props: SetupPanelProps): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */
import { useEffect, useState, type CSSProperties } from "react";

import { Button } from "../primitives/Button.js";
import { Card, Panel } from "../primitives/Card.js";
import { Input } from "../primitives/Input.js";
import { Pill } from "../primitives/Pill.js";

export interface SetupPanelPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  sttModel: string;
  needsKey: boolean;
}

export interface SetupPanelModelValues {
  presetId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface SetupPanelFallbackValues extends SetupPanelModelValues {
  enabled: boolean;
}

export interface SetupPanelSearchValues {
  tavilyKey: string;
  preferLocal: boolean;
}

export interface SetupPanelValues {
  primary: SetupPanelModelValues;
  fallback: SetupPanelFallbackValues;
  search: SetupPanelSearchValues;
}

export interface SetupPanelProps {
  /** Current values, never a masked placeholder — the real string, or "". */
  primary: SetupPanelModelValues;
  fallback: SetupPanelFallbackValues;
  search: SetupPanelSearchValues;
  /** Preset catalogue to populate the selects. */
  presets: SetupPanelPreset[];
  onSave(values: SetupPanelValues): void | Promise<void>;
  /** Result of the last save, e.g. "Saved" or an error. */
  status?: string;
  onClose?: () => void;
}

const fieldLabel: CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--dg-muted)",
};

const fieldWrap: CSSProperties = {
  marginTop: 12,
  minWidth: 0,
};

const hint: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--dg-muted)",
};

const checkRow: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  marginTop: 12,
  fontSize: 13,
  color: "var(--dg-ink-soft)",
  cursor: "pointer",
};

/** Hold-to-reveal control: the secret is visible only while the button is held. */
function RevealControl({
  visible,
  onReveal,
  onConceal,
}: {
  visible: boolean;
  onReveal: () => void;
  onConceal: () => void;
}) {
  return (
    <button
      type="button"
      className="dg-btn dg-btn--ghost dg-btn--sm"
      aria-pressed={visible}
      aria-label={visible ? "Hide key" : "Show key"}
      onPointerDown={onReveal}
      onPointerUp={onConceal}
      onPointerLeave={onConceal}
      onPointerCancel={onConceal}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") onReveal();
      }}
      onKeyUp={onConceal}
      onBlur={onConceal}
      style={{ flex: "0 0 auto" }}
    >
      {visible ? "Hide" : "Show"}
    </button>
  );
}

function SecretField({
  id,
  label,
  value,
  placeholder,
  visible,
  onReveal,
  onConceal,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  visible: boolean;
  onReveal: () => void;
  onConceal: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div style={fieldWrap}>
      <label style={fieldLabel} htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        trailing={<RevealControl visible={visible} onReveal={onReveal} onConceal={onConceal} />}
      />
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={fieldWrap}>
      <label style={fieldLabel} htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

function PresetSelect({
  id,
  label,
  value,
  presets,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  presets: SetupPanelPreset[];
  onChange: (presetId: string) => void;
}) {
  return (
    <div style={fieldWrap}>
      <label style={fieldLabel} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="dg-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: "100%", justifyContent: "space-between" }}
      >
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SetupPanel(props: SetupPanelProps) {
  const { presets, onSave, status, onClose } = props;
  const [primary, setPrimary] = useState<SetupPanelModelValues>(props.primary);
  const [fallback, setFallback] = useState<SetupPanelFallbackValues>(props.fallback);
  const [search, setSearch] = useState<SetupPanelSearchValues>(props.search);
  const [saving, setSaving] = useState(false);
  // Key visibility is never sticky: any fresh props re-hide every secret.
  const [showPrimary, setShowPrimary] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [showTavily, setShowTavily] = useState(false);

  useEffect(() => {
    setPrimary(props.primary);
  }, [props.primary]);
  useEffect(() => {
    setFallback(props.fallback);
  }, [props.fallback]);
  useEffect(() => {
    setSearch(props.search);
  }, [props.search]);
  useEffect(() => {
    setShowPrimary(false);
    setShowFallback(false);
    setShowTavily(false);
  }, [props.primary, props.fallback, props.search]);

  function choosePreset(
    kind: "primary" | "fallback",
    presetId: string,
  ): void {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    if (kind === "primary") {
      setPrimary((current) => ({
        ...current,
        presetId: preset.id,
        baseUrl: preset.baseUrl,
        model: preset.model,
      }));
    } else {
      setFallback((current) => ({
        ...current,
        presetId: preset.id,
        baseUrl: preset.baseUrl,
        model: preset.model,
      }));
    }
  }

  function handleSave(): void {
    const values: SetupPanelValues = { primary, fallback, search };
    const result = onSave(values);
    if (result instanceof Promise) {
      setSaving(true);
      void result.finally(() => setSaving(false));
    }
  }

  return (
    <Panel
      title="Setup"
      action={
        onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : undefined
      }
    >
      <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--dg-ink-soft)" }}>
        Paste your API keys here — no need to open the extension options page.
      </p>

      <div className="dg-stack">
        <Card padded>
          <strong style={{ fontSize: 13 }}>Primary model</strong>
          <PresetSelect
            id="dg-setup-primary-provider"
            label="Provider"
            value={primary.presetId}
            presets={presets}
            onChange={(presetId) => choosePreset("primary", presetId)}
          />
          <SecretField
            id="dg-setup-primary-key"
            label="API key"
            value={primary.apiKey}
            placeholder="Paste your key"
            visible={showPrimary}
            onReveal={() => setShowPrimary(true)}
            onConceal={() => setShowPrimary(false)}
            onChange={(apiKey) => setPrimary((current) => ({ ...current, apiKey }))}
          />
          <TextField
            id="dg-setup-primary-base"
            label="Base URL"
            value={primary.baseUrl}
            placeholder="https://"
            onChange={(baseUrl) => setPrimary((current) => ({ ...current, baseUrl }))}
          />
          <TextField
            id="dg-setup-primary-model"
            label="Chat model"
            value={primary.model}
            placeholder="model id"
            onChange={(model) => setPrimary((current) => ({ ...current, model }))}
          />
        </Card>

        <Card padded>
          <label style={{ ...checkRow, marginTop: 0 }}>
            <input
              type="checkbox"
              checked={fallback.enabled}
              onChange={(event) =>
                setFallback((current) => ({ ...current, enabled: event.target.checked }))
              }
            />
            <strong style={{ fontSize: 13, color: "var(--dg-ink)" }}>
              Enable fallback model
            </strong>
          </label>
          <p style={hint}>
            Used automatically when the primary is rate-limited, out of quota, or down — that is
            the reason to bother.
          </p>
          {fallback.enabled ? (
            <>
              <PresetSelect
                id="dg-setup-fallback-provider"
                label="Provider"
                value={fallback.presetId}
                presets={presets}
                onChange={(presetId) => choosePreset("fallback", presetId)}
              />
              <SecretField
                id="dg-setup-fallback-key"
                label="API key"
                value={fallback.apiKey}
                placeholder="Paste your key"
                visible={showFallback}
                onReveal={() => setShowFallback(true)}
                onConceal={() => setShowFallback(false)}
                onChange={(apiKey) => setFallback((current) => ({ ...current, apiKey }))}
              />
              <TextField
                id="dg-setup-fallback-base"
                label="Base URL"
                value={fallback.baseUrl}
                placeholder="https://"
                onChange={(baseUrl) => setFallback((current) => ({ ...current, baseUrl }))}
              />
              <TextField
                id="dg-setup-fallback-model"
                label="Chat model"
                value={fallback.model}
                placeholder="model id"
                onChange={(model) => setFallback((current) => ({ ...current, model }))}
              />
            </>
          ) : null}
        </Card>

        <Card padded>
          <strong style={{ fontSize: 13 }}>Web search</strong>
          <SecretField
            id="dg-setup-tavily-key"
            label="Tavily key"
            value={search.tavilyKey}
            placeholder="Paste your Tavily key"
            visible={showTavily}
            onReveal={() => setShowTavily(true)}
            onConceal={() => setShowTavily(false)}
            onChange={(tavilyKey) => setSearch((current) => ({ ...current, tavilyKey }))}
          />
          <label style={checkRow}>
            <input
              type="checkbox"
              checked={search.preferLocal}
              onChange={(event) =>
                setSearch((current) => ({ ...current, preferLocal: event.target.checked }))
              }
            />
            Prefer my local crawler
          </label>
        </Card>

        <div className="dg-inline">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {status ? (
            <span role="status" aria-live="polite" style={{ fontSize: 12 }}>
              {status}
            </span>
          ) : null}
        </div>

        <div className="dg-inline">
          <Pill tone="muted" icon="lock">
            Keys stay on this device and go only to the provider you chose.
          </Pill>
        </div>
      </div>
    </Panel>
  );
}
