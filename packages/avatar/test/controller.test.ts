import { describe, expect, it, vi } from "vitest";

import { AvatarController } from "../src/controller.js";

describe("AvatarController (implements AvatarAPI)", () => {
  it("exposes every AvatarAPI method and reacts to play('thinking')", () => {
    const controller = new AvatarController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.play("thinking");
    expect(controller.getSnapshot().state).toBe("thinking");
    expect(listener).toHaveBeenCalled();

    controller.status("Monitoring website…");
    expect(controller.getSnapshot().status).toBe("Monitoring website…");

    controller.say("On it!", "success");
    expect(controller.getSnapshot().status).toBe("On it!");
    expect(controller.getSnapshot().state).toBe("success");

    controller.lookAt("cursor");
    expect(controller.getSnapshot().lookAt).toBe("cursor");

    controller.setExpression({ Smile: 1 });
    expect(controller.getSnapshot().expression).toEqual({ Smile: 1 });

    controller.setVisible(false);
    expect(controller.getSnapshot().visible).toBe(false);

    unsubscribe();
    const before = listener.mock.calls.length;
    controller.play("happy");
    expect(listener.mock.calls.length).toBe(before);
  });

  it("auto-returns transient states to idle via tick()", () => {
    const controller = new AvatarController();
    controller.play("celebration");
    expect(controller.getSnapshot().state).toBe("celebration");
    controller.tick(5);
    expect(controller.getSnapshot().state).toBe("idle");
  });

  it("does not emit a snapshot when a lower-priority play is rejected", () => {
    const controller = new AvatarController();
    controller.play("celebration");
    const snapshot = controller.getSnapshot();
    controller.play("walk");
    expect(controller.getSnapshot()).toBe(snapshot);
    expect(controller.getSnapshot().state).toBe("celebration");
  });

  it("reports and switches to the VRM fallback", () => {
    const controller = new AvatarController();
    expect(controller.mode()).toBe("fbx");
    controller.useVrmFallback(new Error("Chiori.fbx 404"));
    expect(controller.mode()).toBe("vrm");
    expect(controller.getSnapshot().fallbackReason).toBe("Chiori.fbx 404");
  });

  it("records a capability report", () => {
    const controller = new AvatarController();
    controller.setCapability({
      source: "fbx",
      bones: ["head"],
      expressions: ["Smile"],
      clips: ["standing-idle"],
      triangles: 30126,
      warnings: [],
    });
    expect(controller.capability()?.source).toBe("fbx");
    expect(controller.capability()?.triangles).toBe(30126);
  });

  it("reset() returns to idle and clears the status line", () => {
    const controller = new AvatarController();
    controller.status("busy");
    controller.play("warning");
    controller.reset();
    expect(controller.getSnapshot().state).toBe("idle");
    expect(controller.getSnapshot().status).toBe("");
  });
});
