/**
 * Vault — the encrypted local profile, presented as a real screen.
 *
 * Presentational only: the coordinator wires it to `createVaultRuntime()` in the
 * background and passes `status` / `profile` / callbacks. Every prop (other than
 * the legacy `onCommand`) is optional, so the demo Dashboard that still renders
 * `<VaultScreen onCommand={…} />` keeps working and simply shows the create flow.
 *
 * Safety: a locked field is *always* rendered as its `{{LOCKED:<key>}}` token —
 * never the value — even if a caller accidentally passes plaintext.
 *
 * // INTERFACE FOR INTEGRATION
 * interface VaultStatusView { exists: boolean; unlocked: boolean }
 * interface VaultScreenProps {
 *   onCommand?: (label: string, intent?: string) => void;
 *   state?: ScreenState;
 *   preview?: boolean;
 *   status?: VaultStatusView;
 *   profile?: ProfileSchema | null;
 *   onUnlock?: (passphrase: string) => void | Promise<void>;
 *   onCreate?: (passphrase: string) => void | Promise<void>;
 *   onLock?: () => void;
 *   onToggleVisibility?: (key: string, visibility: FieldVisibility) => void;
 *   autoLockAt?: number;   // epoch ms; renders the countdown when unlocked
 * }
 * function VaultScreen(props: VaultScreenProps): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */
import { useEffect, useState, type ReactNode } from "react";
import type { FieldVisibility, ProfileSchema, VaultField } from "@diggy/shared";

import { Icon } from "../../Icon.js";
import { Button } from "../../primitives/Button.js";
import { Panel } from "../../primitives/Card.js";
import { IconButton } from "../../primitives/IconButton.js";
import { Input } from "../../primitives/Input.js";
import { Pill } from "../../primitives/Pill.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { StateBlock, PreviewBadge, type ScreenState } from "../ScreenState.js";

export interface VaultStatusView {
  exists: boolean;
  unlocked: boolean;
}

export interface VaultScreenProps {
  onCommand?: (label: string, intent?: string) => void;
  state?: ScreenState;
  preview?: boolean;
  status?: VaultStatusView;
  profile?: ProfileSchema | null;
  onUnlock?: (passphrase: string) => void | Promise<void>;
  onCreate?: (passphrase: string) => void | Promise<void>;
  onLock?: () => void;
  onToggleVisibility?: (key: string, visibility: FieldVisibility) => void;
  /** Epoch ms when the vault auto-locks, for the countdown. */
  autoLockAt?: number;
}

interface VaultRow {
  key: string;
  label: string;
  visibility: FieldVisibility;
  value: ReactNode;
}

interface VaultGroup {
  id: string;
  title: string;
  rows: VaultRow[];
}

const IDENTITY_KEYS = ["fullName", "email", "phone", "location"] as const;
const EDUCATION_KEYS = ["college", "degree", "semester", "resumeRef"] as const;

/** The exact token consumers see for a locked field. */
function lockedToken(key: string): string {
  return `{{LOCKED:${key}}}`;
}

/** A locked field is always tokenized here, regardless of the value passed in. */
function renderField(field: VaultField<unknown>): ReactNode {
  if (field.visibility === "locked") {
    return <code>{lockedToken(field.key)}</code>;
  }
  const value = field.value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return (
      <span className="dg-chiprow">
        {value.map((item) => (
          <Pill key={String(item)} tone="violet">
            {String(item)}
          </Pill>
        ))}
      </span>
    );
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, string>);
    if (entries.length === 0) return "—";
    return (
      <span className="dg-chiprow">
        {entries.map(([label, url]) => (
          <Pill key={label} icon="link" title={String(url)}>
            {label}
          </Pill>
        ))}
      </span>
    );
  }
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > 0 ? text : "—";
}

function scalarField(profile: ProfileSchema, key: string): VaultField<unknown> | undefined {
  return (profile as unknown as Record<string, VaultField<unknown> | undefined>)[key];
}

function scalarRow(profile: ProfileSchema, key: string): VaultRow | null {
  const field = scalarField(profile, key);
  if (!field) return null;
  return {
    key: field.key || key,
    label: field.label || key,
    visibility: field.visibility,
    value: renderField(field),
  };
}

function isRow(row: VaultRow | null): row is VaultRow {
  return row !== null;
}

/** Group the schema into identity / education / links / custom buckets. */
function buildGroups(profile: ProfileSchema): VaultGroup[] {
  const groups: VaultGroup[] = [];

  const identity = IDENTITY_KEYS.map((key) => scalarRow(profile, key)).filter(isRow);
  if (profile.skills) {
    identity.push({
      key: profile.skills.key,
      label: profile.skills.label || "Skills",
      visibility: profile.skills.visibility,
      value: renderField(profile.skills),
    });
  }
  if (identity.length > 0) groups.push({ id: "identity", title: "Identity", rows: identity });

  const education = EDUCATION_KEYS.map((key) => scalarRow(profile, key)).filter(isRow);
  if (education.length > 0) groups.push({ id: "education", title: "Education", rows: education });

  if (profile.links) {
    groups.push({
      id: "links",
      title: "Links",
      rows: [
        {
          key: profile.links.key,
          label: profile.links.label || "Links",
          visibility: profile.links.visibility,
          value: renderField(profile.links),
        },
      ],
    });
  }

  const custom = (profile.custom ?? []).map<VaultRow>((field) => ({
    key: field.key,
    label: field.label || field.key,
    visibility: field.visibility,
    value: renderField(field),
  }));
  if (custom.length > 0) groups.push({ id: "custom", title: "Custom", rows: custom });

  return groups;
}

function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

export function VaultScreen({
  onCommand,
  state = "ready",
  preview = true,
  status,
  profile,
  onUnlock,
  onCreate,
  onLock,
  onToggleVisibility,
  autoLockAt,
}: VaultScreenProps) {
  const vaultStatus: VaultStatusView = status ?? { exists: false, unlocked: false };
  const data = profile ?? {};

  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (vaultStatus.unlocked) {
      setPassphrase("");
      setBusy(false);
    }
  }, [vaultStatus.unlocked]);

  useEffect(() => {
    if (!autoLockAt || !vaultStatus.unlocked) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((autoLockAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [autoLockAt, vaultStatus.unlocked]);

  const handleUnlock = onUnlock ?? (() => onCommand?.("Unlock vault"));
  const handleCreate = onCreate ?? (() => onCommand?.("Create vault"));

  async function submit(): Promise<void> {
    if (passphrase.length === 0 || busy) return;
    setBusy(true);
    try {
      if (vaultStatus.exists) await handleUnlock(passphrase);
      else await handleCreate(passphrase);
    } finally {
      setBusy(false);
    }
  }

  const groups = vaultStatus.unlocked ? buildGroups(data) : [];
  const isEmpty = vaultStatus.unlocked && groups.length === 0;

  return (
    <>
      <ScreenHeader
        icon="vault"
        tone="primary"
        title="Vault"
        subtitle="Store your information for quick access and auto-fill."
      >
        {preview ? <PreviewBadge /> : null}
        {vaultStatus.unlocked ? (
          <>
            {remaining !== null ? (
              <Pill tone="warning" icon="clock">
                Auto-locks in {formatRemaining(remaining)}
              </Pill>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              icon="lock"
              onClick={() => (onLock ? onLock() : onCommand?.("Lock vault"))}
            >
              Lock now
            </Button>
          </>
        ) : null}
      </ScreenHeader>

      {state !== "ready" ? (
        <Panel>
          <StateBlock
            state={state}
            icon="vault"
            title={
              state === "loading"
                ? "Opening your vault…"
                : state === "empty"
                  ? "Your vault is empty"
                  : "Couldn’t open your vault"
            }
            message={
              state === "empty"
                ? "Add your details to auto-fill forms without retyping them."
                : state === "error"
                  ? "The vault didn’t respond. Try again."
                  : undefined
            }
            onRetry={() => onCommand?.("Retry vault")}
          />
        </Panel>
      ) : !vaultStatus.unlocked ? (
        <Panel title={vaultStatus.exists ? "Unlock your vault" : "Create your vault"}>
          <p style={{ color: "var(--dg-muted)", margin: "0 0 12px", fontSize: 12.5 }}>
            DIGGY can fill forms with this and answer questions from it. Locked fields need your
            approval each time.
          </p>
          <Input
            icon="lock"
            type="password"
            value={passphrase}
            autoComplete="off"
            aria-label="Vault passphrase"
            placeholder={vaultStatus.exists ? "Enter your passphrase" : "Choose a passphrase"}
            onChange={(event) => setPassphrase(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
          />
          <div className="dg-inline" style={{ marginTop: 12 }}>
            <Button
              variant="primary"
              icon={vaultStatus.exists ? "lock" : "plus"}
              disabledReason={
                passphrase.length === 0
                  ? "Enter a passphrase first"
                  : busy
                    ? "Working…"
                    : undefined
              }
              onClick={() => void submit()}
            >
              {vaultStatus.exists ? "Unlock" : "Create vault"}
            </Button>
            <Pill tone="warning" icon="shieldWarn">
              Encrypted on this device — locked values never leave it.
            </Pill>
          </div>
        </Panel>
      ) : isEmpty ? (
        <Panel>
          <StateBlock
            state="empty"
            icon="vault"
            title="Your vault is empty"
            message="Add your details to auto-fill forms without retyping them."
          />
        </Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((group) => (
            <Panel key={group.id} title={group.title}>
              <div className="dg-kv">
                {group.rows.map((row) => {
                  const locked = row.visibility === "locked";
                  return (
                    <div
                      key={row.key}
                      className="dg-kv__row"
                      style={onToggleVisibility ? { gridTemplateColumns: "132px 1fr auto" } : undefined}
                    >
                      <span className="dg-kv__key">{row.label}</span>
                      <span className={locked ? "dg-kv__value dg-kv__value--locked" : "dg-kv__value"}>
                        {locked ? <Icon name="lock" size={13} /> : null}
                        {row.value}
                      </span>
                      {onToggleVisibility ? (
                        <IconButton
                          icon={locked ? "eye" : "lock"}
                          label={locked ? `Make ${row.label} shared` : `Lock ${row.label}`}
                          onClick={() =>
                            onToggleVisibility(row.key, locked ? "shared" : "locked")
                          }
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Panel>
          ))}
          <div className="dg-inline">
            <Pill tone="warning" icon="lock">
              Locked values never leave this device — prompts and logs only see tokens.
            </Pill>
          </div>
        </div>
      )}
    </>
  );
}
