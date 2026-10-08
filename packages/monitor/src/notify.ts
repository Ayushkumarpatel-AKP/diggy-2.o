/**
 * Notifiers — how a {@link MonitorEvent} reaches the user's OS/browser.
 *
 * The engine depends on the tiny {@link Notifier} interface and accepts any
 * implementation, so it stays free of `chrome` at import time:
 *
 *  - {@link createChromeNotifier} — `chrome.notifications.create` (structural
 *    type; the caller passes `chrome.notifications`).
 *  - {@link createCompositeNotifier} — fan out to several notifiers.
 *  - {@link createMemoryNotifier} — capture events (tests / activity feed).
 *  - {@link createNoopNotifier} — the default when nothing is wired.
 */
import type { MonitorEvent } from "@diggy/shared";

/** Delivers a monitor event to the user. */
export interface Notifier {
  notify(event: MonitorEvent): Promise<void> | void;
}

/** Does nothing — used when no notifier is configured. */
export function createNoopNotifier(): Notifier {
  return { notify() {} };
}

/** Fan a notification out to every child notifier (failures are isolated). */
export function createCompositeNotifier(...notifiers: Notifier[]): Notifier {
  return {
    async notify(event: MonitorEvent): Promise<void> {
      await Promise.all(
        notifiers.map(async (notifier) => {
          try {
            await notifier.notify(event);
          } catch {
            /* one notifier failing must not block the others */
          }
        }),
      );
    },
  };
}

/** Records every notified event in memory (tests, activity feed adapters). */
export function createMemoryNotifier(): Notifier & { events: MonitorEvent[] } {
  const events: MonitorEvent[] = [];
  return {
    events,
    notify(event: MonitorEvent): void {
      events.push(event);
    },
  };
}

/** The slice of `chrome.notifications` this module needs. */
export interface ChromeNotificationsLike {
  create(
    options: {
      type: "basic";
      iconUrl: string;
      title: string;
      message: string;
      priority?: number;
    },
    callback?: (notificationId: string) => void,
  ): void;
}

/** Options for {@link createChromeNotifier}. */
export interface ChromeNotifierOptions {
  /** Icon shown on the notification (bundled extension asset). */
  iconUrl?: string;
  /** Title prefix (default `Diggy`). */
  appName?: string;
}

/** Notifier backed by the extension's `chrome.notifications` API. */
export function createChromeNotifier(
  notifications: ChromeNotificationsLike,
  options: ChromeNotifierOptions = {},
): Notifier {
  const iconUrl = options.iconUrl ?? "icon/128.png";
  const appName = options.appName ?? "Diggy";
  return {
    notify(event: MonitorEvent): void {
      try {
        notifications.create(
          {
            type: "basic",
            iconUrl,
            title: `${appName} · ${event.title}`,
            message: event.summary,
            priority: event.severity === "critical" || event.severity === "high" ? 2 : 1,
          },
          () => undefined,
        );
      } catch {
        /* notifications may be unavailable (permission/OS) — never throw */
      }
    },
  };
}
