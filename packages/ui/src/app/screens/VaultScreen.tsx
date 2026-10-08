/**
 * Vault — local profile with locked fields shown only as tokens.
 *
 * // INTERFACE FOR INTEGRATION
 * interface VaultScreenProps { onCommand(label: string, intent?: string): void }
 * // END INTERFACE FOR INTEGRATION
 */
import { useState, type ReactNode } from "react";
import type { ProfileSchema } from "@diggy/shared";

import { Icon } from "../../Icon.js";
import { Button } from "../../primitives/Button.js";
import { Panel } from "../../primitives/Card.js";
import { Pill } from "../../primitives/Pill.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { sampleProfile } from "../sampleData.js";

export interface VaultScreenProps {
  onCommand: (label: string, intent?: string) => void;
}

const SECTIONS = [
  { id: "personal", label: "Personal Info" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "resume", label: "Resume" },
  { id: "links", label: "Links" },
  { id: "custom", label: "Custom Fields" },
];

interface FieldRow {
  key: string;
  label: string;
  value: ReactNode;
  locked?: boolean;
}

function stringRow(key: keyof ProfileSchema, profile: ProfileSchema): FieldRow | null {
  const field = profile[key];
  if (!field || Array.isArray(field) || typeof field !== "object") return null;
  const value = (field as { value?: unknown }).value;
  if (Array.isArray(value) || typeof value === "object") return null;
  return {
    key: String(key),
    label: (field as { label?: string }).label ?? String(key),
    value: String(value ?? ""),
    locked: (field as { visibility?: string }).visibility === "locked",
  };
}

function rowsFor(section: string, profile: ProfileSchema): FieldRow[] {
  switch (section) {
    case "personal":
      return ["fullName", "email", "phone", "location"]
        .map((key) => stringRow(key as keyof ProfileSchema, profile))
        .filter((row): row is FieldRow => row !== null);
    case "education":
      return ["college", "degree", "semester"]
        .map((key) => stringRow(key as keyof ProfileSchema, profile))
        .filter((row): row is FieldRow => row !== null);
    case "skills": {
      const skills = profile.skills;
      if (!skills) return [];
      return [
        {
          key: "skills",
          label: skills.label,
          locked: skills.visibility === "locked",
          value: (
            <span className="dg-inline" style={{ flexWrap: "wrap", gap: 6 }}>
              {skills.value.map((skill) => (
                <Pill key={skill} tone="violet">
                  {skill}
                </Pill>
              ))}
            </span>
          ),
        },
      ];
    }
    case "resume":
      return [
        {
          key: "resumeRef",
          label: profile.resumeRef?.label ?? "Resume",
          locked: profile.resumeRef?.visibility === "locked",
          value: profile.resumeRef?.value ?? "—",
        },
      ];
    case "links": {
      const links = profile.links;
      if (!links) return [];
      return Object.entries(links.value).map(([label, url]) => ({
        key: label,
        label,
        value: url,
      }));
    }
    case "custom":
      return (profile.custom ?? []).map((field) => ({
        key: field.key,
        label: field.label,
        value: field.value,
        locked: field.visibility === "locked",
      }));
    default:
      return [];
  }
}

function FieldTable({ rows }: { rows: FieldRow[] }) {
  if (rows.length === 0) return <div className="dg-empty">Nothing stored in this section yet.</div>;
  return (
    <div className="dg-kv">
      {rows.map((row) => (
        <div key={row.key} className="dg-kv__row">
          <span className="dg-kv__key">{row.label}</span>
          <span className={row.locked ? "dg-kv__value dg-kv__value--locked" : "dg-kv__value"}>
            {row.locked ? <Icon name="lock" size={13} /> : null}
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function VaultScreen({ onCommand }: VaultScreenProps) {
  const [section, setSection] = useState("personal");
  const rows = rowsFor(section, sampleProfile);
  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  return (
    <>
      <ScreenHeader
        icon="vault"
        tone="primary"
        title="Vault"
        subtitle="Store your information for quick access and auto-fill."
      />

      <div className="dg-vault">
        <nav className="dg-vault__nav" aria-label="Vault sections">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === section ? "dg-nav__item dg-nav__item--active" : "dg-nav__item"}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <Panel
          title={active?.label ?? "Vault"}
          action={
            <Button variant="outline" size="sm" icon="edit" onClick={() => onCommand("Edit vault section")}>
              Edit
            </Button>
          }
        >
          <FieldTable rows={rows} />
          <div className="dg-inline" style={{ marginTop: 12 }}>
            <Pill tone="warning" icon="lock">
              Locked values never leave this device — prompts and logs only see tokens.
            </Pill>
          </div>
        </Panel>
      </div>
    </>
  );
}
