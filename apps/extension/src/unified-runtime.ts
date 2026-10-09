/**
 * The unified runtime — everything the extension keeps alive between commands.
 *
 * The background owns exactly one of these. It composes the three engines that
 * were built in earlier waves and, crucially, **installs their schedulers**: the
 * reason tracking and reminders read as broken until now is that nothing ever
 * constructed these engines or created a `chrome.alarms` entry, so nothing could
 * ever fire.
 *
 * Two scheduling rules, both deliberate:
 * - the monitor uses a repeating **1-minute** alarm (its own minimum);
 * - a reminder uses a **one-shot** alarm pinned to its exact `dueAt`, because a
 *   repeating minute alarm would fire up to 59 seconds late — unacceptable for
 *   "remind me at 9:20".
 *
 * Nothing here uses `setInterval`: an MV3 service worker is evicted, so the only
 * scheduling that survives is `chrome.alarms`.
 */
import { createReminderEngine, ReminderStore, reminderAlarmName, reminderIdFromAlarm, type Reminder, type ReminderEngine } from "@diggy/reminders";
import type { ActivityAPI, AvatarAPI } from "@diggy/shared";

import { createActivityRuntime, type ActivityRuntime } from "./activity-runtime.js";
import { createMonitorRuntime, type MonitorRuntime } from "./monitor-runtime.js";
import { createChromeReminderPersistence } from "./reminder-persistence.js";
import { fetchPageText, searchWeb, type SearchSettings } from "./search-web.js";

/** The chrome surface this module needs, kept narrow so it stays testable. */
interface AlarmsLike {
  create(name: string, info: { when?: number; periodInMinutes?: number }): void | Promise<void>;
  clear(name: string): void | Promise<boolean>;
  onAlarm: { addListener(listener: (alarm: { name: string }) => void): void };
}

interface NotificationsLike {
  create(id: string, options: Record<string, unknown>): void | Promise<string>;
}

interface StorageLocalLike {
  get(key: string): Promise<unknown>;
  set(items: Record<string, unknown>): Promise<unknown>;
}

interface StorageLike {
  local: StorageLocalLike;
}

/** The monitor kinds the model is allowed to name. */
const MONITOR_KINDS = [
  "content_change",
  "keyword",
  "new_post",
  "registration_open",
  "deadline_change",
  "release_published",
  "price_change",
  "custom",
] as const;
type MonitorKindName = (typeof MONITOR_KINDS)[number];

function isMonitorKind(value: unknown): value is MonitorKindName {
  return typeof value === "string" && (MONITOR_KINDS as readonly string[]).includes(value);
}

function chromeApi<T>(key: string): T | undefined {
  const scope = globalThis as unknown as { browser?: Record<string, unknown>; chrome?: Record<string, unknown> };
  return (scope.browser?.[key] ?? scope.chrome?.[key]) as T | undefined;
}

export const SEARCH_SETTINGS_KEY = "diggy:search";

export interface ReminderFire {
  reminder: Reminder;
  /** The line shown in the bubble and spoken aloud. */
  headline: string;
  detail: string;
}

export interface UnifiedRuntimeOptions {
  /** Show the user something and speak it. */
  say(text: string, mood?: string): void | Promise<void>;
  /** A short status line for the bubble. */
  status(text: string): void | Promise<void>;
  /** Drive an avatar pose. */
  play(state: string): void | Promise<void>;
  bus: Parameters<typeof createActivityRuntime>[0];
  /** The model registry for the monitor's change analysis. */
  registry?: Parameters<typeof createMonitorRuntime>[0]["registry"];
  onReminderFire?: (fire: ReminderFire) => void;
}

/** Everything the agent needs to reach these engines. */
export interface RuntimeToolDeps {
  search: (query: string, max?: number) => Promise<Awaited<ReturnType<typeof searchWeb>>>;
  fetchPage: (url: string) => Promise<Awaited<ReturnType<typeof fetchPageText>>>;
  watches: {
    list(): { spec: { id: string; url: string; kind: string; intervalSec: number } }[];
    add(input: { url: string; kind?: string; intervalSec?: number }): unknown;
    remove(id: string): boolean;
  };
  reminders: {
    add(input: { title: string; dueAt: number; notes?: string; command?: string }): { id: string; dueAt: number };
    list(): { id: string; title: string; dueAt: number; done: boolean; firedAt?: number }[];
    remove(id: string): boolean;
  };
}

export interface UnifiedRuntime {
  monitor: MonitorRuntime;
  reminders: ReminderEngine;
  activity: ActivityRuntime;
  /** Read the user's web-search settings from storage. */
  searchSettings(): Promise<SearchSettings>;
  /** Create the alarms. Call once per service-worker start. */
  install(): void;
  /** Route one alarm. Returns true when it belonged to this runtime. */
  handleAlarm(name: string): Promise<void>;
  /** Pin a precise one-shot alarm for a reminder. */
  scheduleReminder(id: string, dueAt: number): Promise<void>;
  /** Everything the agent loop needs, ready to spread into its options. */
  toolDeps(): RuntimeToolDeps;
}

function quiet(promise: unknown): void {
  void Promise.resolve(promise).catch(() => undefined);
}

/**
 * The line a fired reminder shows. Written once, here, so the notification, the
 * bubble and the spoken line can never disagree.
 */
export function reminderPresentation(reminder: Reminder): ReminderFire {
  const when = new Date(reminder.dueAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return {
    reminder,
    headline: `Hey! Your reminder is here — it's time for ${reminder.title}!`,
    detail: reminder.notes ? `${reminder.notes} (set for ${when})` : `Set for ${when}.`,
  };
}

export function createUnifiedRuntime(options: UnifiedRuntimeOptions): UnifiedRuntime {
  const alarms = chromeApi<AlarmsLike>("alarms");
  const notifications = chromeApi<NotificationsLike>("notifications");
  const storage = chromeApi<StorageLike>("storage")?.local;

  const activity = createActivityRuntime(options.bus);

  const avatar: AvatarAPI = {
    play: (state) => quiet(options.play(state)),
    say: (text, mood) => quiet(options.say(text, mood)),
    status: (text) => quiet(options.status(text)),
    lookAt: () => undefined,
    setExpression: () => undefined,
    setVisible: () => undefined,
  } as AvatarAPI;

  const monitor = createMonitorRuntime({
    avatar,
    activity: activity as unknown as ActivityAPI,
    ...(options.registry ? { registry: options.registry } : {}),
  });

  const reminderStore = new ReminderStore(createChromeReminderPersistence());
  quiet(reminderStore.load());

  const reminders = createReminderEngine({
    store: reminderStore,
    notifier: {
      notify(reminder) {
        const fire = reminderPresentation(reminder);
        quiet(options.say(fire.headline));
        quiet(options.status(fire.headline));
        activity.record({ kind: "action", title: fire.headline, detail: fire.detail });
        if (notifications) {
          quiet(
            notifications.create(`diggy:reminder:${reminder.id}`, {
              type: "basic",
              iconUrl: "icon/128.png",
              title: "DIGGY reminder",
              message: fire.headline,
              priority: 2,
              requireInteraction: true,
            }),
          );
        }
        options.onReminderFire?.(fire);
      },
    },
  });

  async function searchSettings(): Promise<SearchSettings> {
    if (!storage) return {};
    try {
      const raw = (await storage.get(SEARCH_SETTINGS_KEY)) as Record<string, unknown>;
      const value = raw[SEARCH_SETTINGS_KEY];
      if (typeof value !== "object" || value === null) return {};
      const row = value as Record<string, unknown>;
      const settings: SearchSettings = {};
      if (typeof row["tavilyKey"] === "string") settings.tavilyKey = row["tavilyKey"];
      if (typeof row["preferLocal"] === "boolean") settings.preferLocal = row["preferLocal"];
      if (typeof row["crawlerBase"] === "string") settings.crawlerBase = row["crawlerBase"];
      return settings;
    } catch {
      return {};
    }
  }

  function install(): void {
    // The monitor's repeating tick.
    monitor.install();
    // Re-pin every pending reminder. Storage survives a service-worker restart,
    // but a one-shot alarm does not, so it has to be recreated on every start.
    for (const reminder of reminders.list()) {
      if (reminder.done || reminder.firedAt !== undefined) continue;
      quiet(scheduleReminder(reminder.id, reminder.dueAt));
    }
  }

  async function scheduleReminder(id: string, dueAt: number): Promise<void> {
    if (!alarms) return;
    try {
      await alarms.create(reminderAlarmName(id), { when: dueAt });
    } catch {
      /* the reminder still exists; the next service-worker start re-pins it */
    }
  }

  async function handleAlarm(name: string): Promise<void> {
    const reminderId = reminderIdFromAlarm(name);
    if (reminderId) {
      await reminders.fireDue();
      return;
    }
    // The monitor's own alarm is handled by the scheduler it installed; any
    // other name is not ours.
  }

  function toolDeps(): RuntimeToolDeps {
    return {
      search: async (query: string, max?: number) => searchWeb({ ...(await searchSettings()), query, ...(max !== undefined ? { max } : {}) }),
      fetchPage: async (url: string) => fetchPageText(url, await searchSettings()),
      watches: {
        list: () => monitor.list().map((record) => ({ spec: { id: record.spec.id, url: record.spec.url, kind: String(record.spec.kind), intervalSec: record.spec.intervalSec } })),
        add: (input) =>
          monitor.add({
            url: input.url,
            // The kind arrives as free text from the model, so it is validated
            // against the real set rather than cast into it.
            ...(isMonitorKind(input.kind) ? { kind: input.kind } : {}),
            ...(input.intervalSec !== undefined ? { intervalSec: input.intervalSec } : {}),
          }),
        remove: (id) => monitor.remove(id),
      },
      reminders: {
        add: (input) => {
          const created = reminders.add(input);
          quiet(scheduleReminder(created.id, created.dueAt));
          return created;
        },
        list: () =>
          reminders.list().map((reminder) => ({
            id: reminder.id,
            title: reminder.title,
            dueAt: reminder.dueAt,
            done: reminder.done,
            ...(reminder.firedAt !== undefined ? { firedAt: reminder.firedAt } : {}),
          })),
        remove: (id) => {
          quiet(alarms?.clear(reminderAlarmName(id)) ?? Promise.resolve());
          return reminders.remove(id);
        },
      },
    };
  }

  return { monitor, reminders, activity, searchSettings, install, handleAlarm, scheduleReminder, toolDeps };
}
