// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { ActionCard, actionHost, type ActionPreview } from "./ActionCard.js";

const flusher = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement;
let root: Root;

function setup() {
  flusher.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
}

function teardown() {
  act(() => root.unmount());
  container.remove();
  flusher.IS_REACT_ACT_ENVIRONMENT = false;
}

function renderCard(preview: ActionPreview, props: Partial<Parameters<typeof ActionCard>[0]> = {}) {
  const onApprove = vi.fn();
  const onDeny = vi.fn();
  act(() =>
    root.render(<ActionCard preview={preview} onApprove={onApprove} onDeny={onDeny} {...props} />),
  );
  return { onApprove, onDeny };
}

const base: ActionPreview = {
  id: "preview_1",
  kind: "openVideo",
  title: "Open this video?",
  detail: "You asked DIGGY to open a video.",
  targetUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&extra=9".concat("x".repeat(160)),
  thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
};

describe("actionHost", () => {
  it("returns the bare host for a long URL", () => {
    expect(actionHost(base.targetUrl ?? "")).toBe("youtube.com");
  });

  it("returns null for a non-URL string", () => {
    expect(actionHost("not a url")).toBeNull();
  });
});

describe("ActionCard", () => {
  it("shows the host and not the full URL", () => {
    setup();
    try {
      renderCard(base);
      const text = container.textContent ?? "";
      expect(text).toContain("youtube.com");
      expect(text).not.toContain("dQw4w9WgXcQ");
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
      expect(img?.getAttribute("loading")).toBe("lazy");
      expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
    } finally {
      teardown();
    }
  });

  it("Deny does not call onApprove", () => {
    setup();
    try {
      const { onApprove, onDeny } = renderCard(base);
      const deny = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Deny"),
      );
      expect(deny).toBeTruthy();
      act(() => deny?.click());
      expect(onDeny).toHaveBeenCalledTimes(1);
      expect(onApprove).not.toHaveBeenCalled();
    } finally {
      teardown();
    }
  });

  it("disables Approve with progress while running", () => {
    setup();
    try {
      renderCard(base, { status: "running" });
      const approve = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Working"),
      );
      expect(approve).toBeTruthy();
      expect((approve as HTMLButtonElement).disabled).toBe(true);
    } finally {
      teardown();
    }
  });

  it("renders the error with a retry affordance when failed", () => {
    setup();
    try {
      const { onApprove } = renderCard(base, { status: "failed", error: "Network timed out" });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("Network timed out");
      const retry = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Retry"),
      );
      expect(retry).toBeTruthy();
      act(() => retry?.click());
      expect(onApprove).toHaveBeenCalledTimes(1);
    } finally {
      teardown();
    }
  });

  it("renders no Deny button when no onDeny handler is given", () => {
    setup();
    try {
      const onApprove = vi.fn();
      act(() => root.render(<ActionCard preview={base} onApprove={onApprove} />));
      const buttons = Array.from(container.querySelectorAll("button"));
      expect(buttons).toHaveLength(1);
      expect(buttons[0]?.textContent).toContain("Approve");
    } finally {
      teardown();
    }
  });
});
