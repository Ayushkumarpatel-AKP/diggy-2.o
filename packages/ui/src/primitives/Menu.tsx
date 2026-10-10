/**
 * Anchored popover menu — the first menu primitive in the repo.
 * Keyboard handling is modelled on `packages/ui/src/app/CommandPalette.tsx`:
 * ArrowUp/ArrowDown move focus, Enter selects, Escape closes.
 *
 * // INTERFACE FOR INTEGRATION
 * interface MenuItem { id: string; label: string; onSelect(): void; danger?: boolean }
 * interface MenuProps { label: string; items: MenuItem[]; align?: "left" | "right" }
 * function Menu(props: MenuProps): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { IconButton } from "./IconButton.js";

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export interface MenuProps {
  /** Accessible label for the trigger (e.g. "Watch options"). */
  label: string;
  items: MenuItem[];
  align?: "left" | "right";
}

export function Menu({ label, items, align = "left" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTrigger = () => {
    rootRef.current?.querySelector<HTMLButtonElement>("button.dg-iconbtn")?.focus();
  };

  const close = (returnFocus: boolean) => {
    if (returnFocus) focusTrigger();
    setOpen(false);
  };

  // Focus the first item when the menu opens so arrow-key users start inside.
  useEffect(() => {
    if (open) {
      const first = itemRefs.current[0];
      first?.focus();
    }
  }, [open ]);

  // Outside click closes (without stealing focus).
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);

    /*
     * Escape is bound on the document, not just on the menu. A React onKeyDown
     * only fires when focus is already inside the panel, so opening the menu and
     * pressing Escape with focus still on the trigger left it open — which is
     * both surprising and the behaviour the spec calls out.
     */
    // `globalThis.KeyboardEvent` explicitly: this file imports React's
    // KeyboardEvent type, which shadows the DOM one.
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const focusAt = (index: number) => {
    if (items.length === 0) return;
    const wrapped = (index + items.length) % items.length;
    const el = itemRefs.current[wrapped];
    el?.focus();
  };

  const focusedIndex = () =>
    itemRefs.current.findIndex((el) => el !== null && el === document.activeElement);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        focusAt(focusedIndex() + 1);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (open) focusAt(focusedIndex() - 1);
    }
  };

  const select = (item: MenuItem) => {
    item.onSelect();
    close(true);
  };

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      style={{ position: "relative", display: "inline-block" }}
    >
      <IconButton
        icon="more"
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) close(true);
          else setOpen(true);
        }}
      />
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="dg-card dg-card--pad"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            ...(align === "right" ? { right: 0 } : { left: 0 }),
            zIndex: 60,
            minWidth: 180,
            maxWidth: "min(248px, 70vw)",
            padding: 4,
          }}
        >
          {items.length === 0 ? (
            <div className="dg-empty">No actions</div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitem"
                className="dg-palette__item"
                style={{
                  width: "100%",
                  textAlign: "left",
                  ...(item.danger ? { color: "var(--dg-danger)" } : null),
                }}
                onClick={() => select(item)}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
