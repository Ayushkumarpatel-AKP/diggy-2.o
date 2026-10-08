import { useState, type ReactNode } from "react";
import {
  AlertRow,
  AvatarChip,
  BrowserDots,
  Button,
  Card,
  DiggyLogo,
  ICON_PATHS,
  Icon,
  IconButton,
  Input,
  ListRow,
  MetricTile,
  Panel,
  Pill,
  QuickAction,
  SearchField,
  StatusBubble,
  Tabs,
  TONES,
  type IconName,
  type Severity,
} from "@diggy/ui";

const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];
const SEVERITIES: Severity[] = ["info", "low", "medium", "high", "critical"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="demo-section">
      <h2 className="demo-section__title">{title}</h2>
      {children}
    </section>
  );
}

export function ComponentGallery() {
  const [tab, setTab] = useState("one");
  const [note, setNote] = useState("Interactive demos write here.");

  return (
    <div className="demo-view">
      <p className="demo-hint" role="status" aria-live="polite">
        {note}
      </p>
      <Section title="Brand — golden-D logo & browser dots">
        <div className="demo-row">
          <DiggyLogo size={22} />
          <DiggyLogo size={30} />
          <DiggyLogo size={44} />
          <DiggyLogo size={64} />
          <DiggyLogo size={44} dots={false} />
          <span className="dg-wordmark">Diggy</span>
          <BrowserDots />
          <BrowserDots small />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="demo-row">
          <Button variant="primary" icon="plus">
            Primary
          </Button>
          <Button variant="soft" icon="sparkle">
            Soft
          </Button>
          <Button variant="outline" icon="popout">
            Outline
          </Button>
          <Button variant="ghost" icon="gear">
            Ghost
          </Button>
          <Button variant="primary" size="sm" icon="check">
            Small
          </Button>
          <Button variant="outline" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section title="Pills">
        <div className="demo-row">
          {TONES.map((tone) => (
            <Pill key={tone} tone={tone}>
              {tone}
            </Pill>
          ))}
          <Pill tone="success" dot>
            Active
          </Pill>
          <Pill outline>Outline</Pill>
          <Pill tone="blue" icon="globe">
            With icon
          </Pill>
        </div>
      </Section>

      <Section title="Metric tiles">
        <div className="dg-tiles">
          <MetricTile icon="globe" tone="blue" value={12} label="Websites Monitoring" />
          <MetricTile
            icon="bell"
            tone="pink"
            value={3}
            label="New Alerts"
            sub={{ text: "2 urgent", tone: "danger" }}
          />
          <MetricTile icon="check" tone="mint" value={5} label="Actions Completed" />
          <MetricTile icon="integrations" tone="violet" value={4} label="Integrations Active" />
        </div>
      </Section>

      <Section title="Cards & panels">
        <div className="demo-grid">
          <Card padded>Padded card</Card>
          <Card padded interactive>
            Interactive card
          </Card>
          <Panel
            title="Panel with action"
            action={
              <button className="dg-linkbtn" onClick={() => setNote("View All clicked")}>
                View All
              </button>
            }
          >
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--dg-muted)" }}>
              Panels group a titled region; cards hold content.
            </p>
          </Panel>
        </div>
      </Section>

      <Section title="List rows">
        <Panel>
          <ListRow
            icon="globe"
            tone="primary"
            title="SIH Results Portal"
            subtitle="sih.gov.in"
            tags={
              <>
                <Pill outline>Keywords</Pill>
                <Pill outline>Content Change</Pill>
              </>
            }
            trail={
              <>
                <Pill tone="success" dot>
                  Active
                </Pill>
                <IconButton icon="bell" label="Notifications" />
                <IconButton icon="more" label="More" />
              </>
            }
          />
          <ListRow
            icon="star"
            tone="violet"
            title="Interactive row (clickable)"
            subtitle="Hover to see the surface change"
            onClick={() => setNote("List row clicked")}
          />
        </Panel>
      </Section>

      <Section title="Alert rows — severities">
        <Panel>
          {SEVERITIES.map((severity) => (
            <AlertRow
              key={severity}
              icon="bell"
              tone="warning"
              title={`Alert · ${severity}`}
              subtitle="Sample subtitle for the alert row"
              time="10 min ago"
              severity={severity}
            />
          ))}
        </Panel>
      </Section>

      <Section title="Tabs">
        <div className="demo-row" style={{ alignItems: "flex-start", flexDirection: "column" }}>
          <Tabs
            items={[
              { id: "one", label: "Websites" },
              { id: "two", label: "GitHub" },
              { id: "three", label: "Others" },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Tabs
            variant="underline"
            items={[
              { id: "one", label: "All" },
              { id: "two", label: "Completed" },
              { id: "three", label: "Failed" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </Section>

      <Section title="Inputs">
        <div className="demo-grid">
          <SearchField onActivate={() => undefined} readOnly />
          <Input icon="search" placeholder="Plain input with icon" />
        </div>
      </Section>

      <Section title="Avatar chips & icon buttons">
        <div className="demo-row">
          <AvatarChip initials="AKP" name="Ayush Kumar Patel" role="Personal workspace" />
          <AvatarChip initials="AKP" size="sm" />
          <IconButton icon="gear" label="Settings" />
          <IconButton icon="popout" label="Pop out" outline />
        </div>
      </Section>

      <Section title="Quick commands">
        <div className="dg-quickgrid" style={{ maxWidth: 560 }}>
          <QuickAction icon="globe" tone="blue" label="Track this site" />
          <QuickAction icon="file" tone="violet" label="Summarize page" />
          <QuickAction icon="edit" tone="primary" label="Fill form" />
          <QuickAction icon="sparkle" tone="pink" label="Explain page" />
        </div>
      </Section>

      <Section title="Status / thought bubble">
        <div className="demo-row" style={{ alignItems: "flex-end" }}>
          <StatusBubble text="Monitoring sih.gov.in for result changes…" variant="thought" />
          <StatusBubble text="Found 3 new hackathons for you!" variant="speech" priority={2} />
          <StatusBubble text="Collapsed to a chip" collapsed priority={3} />
        </div>
      </Section>

      <Section title={`Icons (${ICON_NAMES.length})`}>
        <div className="demo-icon-grid">
          {ICON_NAMES.map((name) => (
            <span key={name} className="demo-icon-cell">
              <Icon name={name} size={20} />
              {name}
            </span>
          ))}
        </div>
      </Section>
    </div>
  );
}
