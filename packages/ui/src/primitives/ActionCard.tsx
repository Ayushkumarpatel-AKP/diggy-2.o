/**
 * ChatGPT-like action preview card: shows what an approval is approving before
 * the user confirms. Built to the wave-8 frozen `ActionPreview` interface.
 *
 * // INTERFACE FOR INTEGRATION
 * type ActionPreviewKind = "submit" | "vault" | "navigate" | "openVideo" | "connect";
 * interface ActionPreview { id: string; kind: ActionPreviewKind; title: string;
 *   detail?: string; targetUrl?: string; thumbnailUrl?: string;
 *   confirmLabel?: string; denyLabel?: string }
 * type ActionCardStatus = "idle" | "running" | "failed";
 * interface ActionCardProps { preview: ActionPreview; status?: ActionCardStatus;
 *   error?: string; onApprove(): void; onDeny?(): void }
 * function ActionCard(props: ActionCardProps): JSX.Element;
 * function actionHost(targetUrl: string): string | null;
 * // END INTERFACE FOR INTEGRATION
 */
import { useState } from "react";

import { Icon, type IconName } from "../Icon.js";
import type { Tone } from "../theme.js";
import { Button } from "./Button.js";
import { Pill } from "./Pill.js";

export type ActionPreviewKind = "submit" | "vault" | "navigate" | "openVideo" | "connect";

/** The confirmation the runtime broadcasts. `kind` decides which preview to show. */
export interface ActionPreview {
  id: string;
  kind: ActionPreviewKind;
  title: string;
  detail?: string;
  targetUrl?: string;
  thumbnailUrl?: string;
  confirmLabel?: string;
  denyLabel?: string;
}

export type ActionCardStatus = "idle" | "running" | "failed";

export interface ActionCardProps {
  preview: ActionPreview;
  status?: ActionCardStatus;
  error?: string;
  onApprove: () => void;
  onDeny?: () => void;
}

const KIND_META: Record<ActionPreviewKind, { label: string; icon: IconName; tone: Tone }> = {
  submit: { label: "Needs approval", icon: "shieldWarn", tone: "warning" },
  vault: { label: "Vault", icon: "lock", tone: "violet" },
  navigate: { label: "Open link", icon: "globe", tone: "blue" },
  openVideo: { label: "Video", icon: "popout", tone: "pink" },
  connect: { label: "Connect", icon: "integrations", tone: "mint" },
};

/**
 * Host of a URL (`https://www.youtube.com/watch?v=…` → `youtube.com`).
 * Returns null when the value is not an absolute URL, so callers never
 * render a raw link.
 */
export function actionHost(targetUrl: string): string | null {
  try {
    const host = new URL(targetUrl).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

export function ActionCard({ preview, status = "idle", error, onApprove, onDeny }: ActionCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const meta = KIND_META[preview.kind];
  const host = preview.targetUrl ? actionHost(preview.targetUrl) : null;
  const showThumb = Boolean(preview.thumbnailUrl) && !imgFailed;
  const running = status === "running";
  const failed = status === "failed";
  const approveLabel = running
    ? "Working…"
    : failed
      ? "Retry"
      : (preview.confirmLabel ?? "Approve");
  const denyLabel = preview.denyLabel ?? "Deny";

  return (
    <div
      className="dg-card dg-card--pad"
      style={{ maxWidth: "100%", display: "flex", flexDirection: "column", gap: 8 }}
      role="group"
      aria-label={`Confirm: ${preview.title}`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Pill tone={meta.tone} icon={meta.icon}>
          {meta.label}
        </Pill>
        {host ? (
          <span
            className="dg-row__sub"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}
          >
            <Icon name="link" size={12} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {host}
            </span>
          </span>
        ) : null}
      </div>
      <div className="dg-row__title">
        <span>{preview.title}</span>
      </div>
      {preview.detail ? <div className="dg-row__sub">{preview.detail}</div> : null}
      {showThumb ? (
        <span
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "16 / 9",
            overflow: "hidden",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--dg-line)",
            background: "var(--dg-surface-alt)",
          }}
        >
          <img
            src={preview.thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </span>
      ) : null}
      {failed ? (
        <p role="alert" style={{ color: "var(--dg-danger)", margin: 0, fontSize: 13 }}>
          {error ?? "Something went wrong."}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="primary" onClick={onApprove} disabled={running} aria-busy={running || undefined}>
          {approveLabel}
        </Button>
        {onDeny ? (
          <Button variant="ghost" onClick={onDeny}>
            {denyLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
