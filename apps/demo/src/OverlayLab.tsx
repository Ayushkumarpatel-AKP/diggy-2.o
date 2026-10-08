import { useState, type ReactNode } from "react";
import {
  CommandPalette,
  DiggyLogo,
  Icon,
  Pill,
  StatusBubble,
  usePopOut,
  useStatusQueue,
  type PaletteCommand,
  type StatusPriority,
} from "@diggy/ui";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="demo-section">
      <h2 className="demo-section__title">{title}</h2>
      {children}
    </section>
  );
}

const SAMPLE_LINES: Array<{ label: string; text: string; priority: StatusPriority }> = [
  { label: "Low · log", text: "Saved a snapshot of internshala.com.", priority: 0 },
  { label: "Normal · monitoring", text: "Monitoring sih.gov.in — nothing changed yet.", priority: 1 },
  { label: "Urgent · alert", text: "SIH 2026 results page just changed!", priority: 3 },
];

export function OverlayLab() {
  const [variant, setVariant] = useState<"thought" | "speech">("speech");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const queue = useStatusQueue();
  const popOut = usePopOut({ elementId: "overlay-lab-stage", width: 400, height: 340 });

  const commands: PaletteCommand[] = [
    ...SAMPLE_LINES.map((line, index) => ({
      id: `push_${index}`,
      label: `Push: ${line.label}`,
      group: "Status queue",
      icon: "assistant" as const,
      run: () => queue.push({ text: line.text, priority: line.priority, mood: "thinking" }),
    })),
    {
      id: "collapse",
      label: queue.collapsed ? "Expand status bubble" : "Collapse status bubble",
      group: "View",
      icon: "layers" as const,
      hint: "chip",
      run: () => queue.toggleCollapse(),
    },
    {
      id: "clear",
      label: "Clear status queue",
      group: "View",
      icon: "trash" as const,
      run: () => queue.clear(),
    },
  ];

  const current = queue.current;

  return (
    <div className="demo-view">
      <Section title="Status bubble — priority queue, typewriter, collapse">
        <div className="demo-row">
          <button type="button" className="dg-btn dg-btn--soft" onClick={() => queue.push({ text: SAMPLE_LINES[1]!.text, priority: 1 })}>
            <Icon name="assistant" size={15} /> Push normal
          </button>
          <button type="button" className="dg-btn dg-btn--soft" onClick={() => queue.push({ text: SAMPLE_LINES[2]!.text, priority: 3 })}>
            <Icon name="alert" size={15} /> Push urgent
          </button>
          <button type="button" className="dg-btn dg-btn--outline" onClick={() => queue.push({ text: SAMPLE_LINES[0]!.text, priority: 0 })}>
            <Icon name="file" size={15} /> Push low
          </button>
          <button type="button" className="dg-btn dg-btn--ghost" onClick={queue.clear}>
            Clear
          </button>
          <button
            type="button"
            className="dg-btn dg-btn--outline"
            onClick={() => setVariant((value) => (value === "thought" ? "speech" : "thought"))}
          >
            Style: {variant}
          </button>
          <button type="button" className="dg-btn dg-btn--outline" onClick={queue.toggleCollapse}>
            {queue.collapsed ? "Expand" : "Collapse to 💭"}
          </button>
        </div>

        <div className="demo-overlay-stage" id="overlay-lab-stage">
          <StatusBubble
            text={current?.text ?? "DIGGY is idle — no active tasks."}
            priority={current?.priority ?? 0}
            variant={current?.style ?? variant}
            collapsed={queue.collapsed}
            onToggleCollapse={queue.toggleCollapse}
          />
        </div>

        {queue.pending.length > 0 ? (
          <div className="demo-row" style={{ marginTop: 12 }}>
            <Pill tone="muted">Queued {queue.pending.length}</Pill>
            {queue.pending.map((item) => (
              <Pill key={item.id} tone="violet" dot>
                P{item.priority} · {item.text}
              </Pill>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Command palette (Alt+K)">
        <div className="demo-row">
          <button type="button" className="dg-btn dg-btn--primary" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={15} /> Open command palette
          </button>
          <span className="demo-hint">Arrow keys navigate · Enter runs · Esc closes</span>
        </div>
      </Section>

      <Section title="Detachable panel (Alt+Space)">
        <div className="demo-row">
          <button
            type="button"
            className="dg-btn dg-btn--outline"
            onClick={() => (popOut.isOpen ? popOut.close() : void popOut.popOut())}
          >
            <Icon name="popout" size={15} /> {popOut.isOpen ? "Close pop-out" : `Pop out (${popOut.mode})`}
          </button>
          <span className="demo-hint">
            Chrome Document Picture-in-Picture, with a popup-window fallback.
          </span>
        </div>
      </Section>

      <Section title="Anchored to the avatar head">
        <div className="demo-row" style={{ alignItems: "flex-end" }}>
          <span className="dg-status__avatar">
            <DiggyLogo size={30} />
          </span>
          <span className="dg-status__avatar">
            <DiggyLogo size={30} dots={false} />
          </span>
          <span className="demo-hint">The bubble renders beside the avatar element.</span>
        </div>
      </Section>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
