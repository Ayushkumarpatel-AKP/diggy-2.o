/**
 * Avatar alerts — the FRONT-END of a monitor event: DIGGY's character speaks
 * the alert and plays a mood.
 *
 * The engine takes an {@link AvatarAlerter}, so it never imports the heavy
 * `@diggy/avatar` (React + three) package. {@link createAvatarAlerter} adapts
 * any {@link AvatarAPI} (the headless avatar controller, or the extension mount)
 * to the alerter interface.
 */
import type { AvatarAPI, AvatarState, MonitorEvent } from "@diggy/shared";
import type { Severity } from "./watches.js";

/** Reacts to a monitor event on the avatar. */
export interface AvatarAlerter {
  alert(event: MonitorEvent): void;
}

/** Severity → avatar mood. */
export function avatarMoodFor(severity: Severity): AvatarState {
  switch (severity) {
    case "critical":
    case "high":
      return "celebration";
    case "medium":
      return "happy";
    case "low":
    case "info":
    default:
      return "thinking";
  }
}

/** Adapt an {@link AvatarAPI} into an {@link AvatarAlerter}. */
export function createAvatarAlerter(api: AvatarAPI): AvatarAlerter {
  return {
    alert(event: MonitorEvent): void {
      const mood = avatarMoodFor(event.severity);
      try {
        api.say(`${event.title} — ${event.summary}`, mood);
        api.status(`👀 ${event.title}`);
        if (mood === "celebration") api.play("success");
      } catch {
        /* the avatar is best-effort; never let it break a check */
      }
    },
  };
}

/** A no-op alerter (headless/server contexts). */
export function createNoopAvatarAlerter(): AvatarAlerter {
  return { alert() {} };
}
