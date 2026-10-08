/**
 * Command palette (openbrowse `Alt+K`): fuzzy-ish filter, grouped results, keyboard driven.
 *
 * // INTERFACE FOR INTEGRATION
 * interface PaletteCommand { id: string; label: string; group: string; icon: IconName;
 *   hint?: string; run(): void }
 * interface CommandPaletteProps { open: boolean; onClose(): void;
 *   commands: readonly PaletteCommand[]; placeholder?: string }
 * // END INTERFACE FOR INTEGRATION
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Icon, type IconName } from "../Icon.js";

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  icon: IconName;
  hint?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: readonly PaletteCommand[];
  placeholder?: string;
}

export function CommandPalette({
  open,
  onClose,
  commands,
  placeholder = "Search or ask DIGGY…",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.group}`.toLowerCase().includes(needle),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  const runAt = (index: number) => {
    const command = filtered[index];
    if (!command) return;
    command.run();
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(1, filtered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runAt(activeIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  let lastGroup = "";

  return (
    <div className="dg-scrim" onMouseDown={onClose} role="presentation">
      <div
        className="dg-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dg-palette__head">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Command palette search"
          />
          <span className="dg-kbd">Esc</span>
        </div>
        <div className="dg-palette__list">
          {filtered.length === 0 ? (
            <div className="dg-empty">No matching commands</div>
          ) : (
            filtered.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <div key={command.id}>
                  {header ? <div className="dg-palette__group">{header}</div> : null}
                  <button
                    type="button"
                    className={
                      index === activeIndex
                        ? "dg-palette__item dg-palette__item--active"
                        : "dg-palette__item"
                    }
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runAt(index)}
                  >
                    <Icon name={command.icon} size={16} />
                    {command.label}
                    {command.hint ? <span className="dg-palette__hint">{command.hint}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
