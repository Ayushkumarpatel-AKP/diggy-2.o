/**
 * `@diggy/activity` — bus bridge: every other module's events flow into the log.
 *
 * Other workers never touch the log directly; they emit their usual bus events
 * and this bridge translates them into `ActivityEvent`s (which are redacted on
 * `record()` before they are written). All payloads are coerced defensively —
 * a malformed payload records a best-effort event, never throws.
 *
 * // INTERFACE FOR INTEGRATION
 * function wireActivityBus(bus: MessageBus, log: ActivityAPI): () => void
 *   // subscribes (returns unsubscribe-all):
 *   //   BusEvents.MonitorEvent ("monitor.event")       -> kind "monitored"
 *   //   BusEvents.ActivityRecord ("activity.record")   -> passthrough record
 *   //   BusEvents.VoiceTranscript ("voice.transcript") -> kind "voice"
 *   //   BusEvents.PlanRequest ("action.plan.request")  -> kind "action"
 *   //   BusEvents.PlanApproval ("action.plan.approval") -> kind "action"
 *   //   "action.executed" -> "action" | "action.read" -> "read_page"
 *   //   "action.summary" -> "summary" | "action.navigate" -> "opened_site"
 *   //   "form.filled" -> "filled_form" | "integration.event" -> "integration"
 *   //   "voice.event" -> "voice" | "monitor.alert" -> "alert"
 * // END INTERFACE FOR INTEGRATION
 */
import type {
  ActivityAPI,
  ActivityKind,
  MessageBus,
  MonitorEvent,
} from "@diggy/shared";
import { BusEvents } from "@diggy/shared";

type Draft = Omit<Parameters<ActivityAPI["record"]>[0], "at"> & { at?: number };

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
  return {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function metaOf(value: Record<string, unknown>): Record<string, string> | undefined {
  const raw = value["meta"];
  if (typeof raw !== "object" || raw === null) return undefined;
  const meta: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof entry === "string") meta[key] = entry;
    else if (typeof entry === "number" || typeof entry === "boolean") meta[key] = String(entry);
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/** Best-effort translation of a free-form payload into a log draft. */
function draftFrom(kind: ActivityKind, fallbackTitle: string, payload: unknown): Draft {
  const value = asRecord(payload);
  const title = text(value["title"], fallbackTitle);
  const detailRaw = value["detail"] ?? value["summary"] ?? value["text"] ?? value["goal"];
  const detail = typeof detailRaw === "string" && detailRaw.length > 0 ? detailRaw : undefined;
  const meta = metaOf(value);
  const extra: Record<string, string> = {};
  for (const key of ["url", "watchId", "eventKey", "severity", "tool", "site"]) {
    const entry = value[key];
    if (typeof entry === "string" && entry.length > 0) extra[key] = entry;
  }
  const merged = { ...extra, ...meta };
  return {
    kind,
    title,
    ...(detail === undefined ? {} : { detail }),
    ...(Object.keys(merged).length === 0 ? {} : { meta: merged }),
  };
}

function draftFromMonitor(event: MonitorEvent): Draft {
  return {
    kind: "monitored",
    title: event.title || `Monitor hit on ${event.url}`,
    detail: event.summary || undefined,
    meta: {
      watchId: event.watchId,
      url: event.url,
      eventKey: event.eventKey,
      severity: event.severity,
    },
  };
}

/**
 * Subscribes the log to every module bus event. Returns a single function
 * that unsubscribes everything.
 */
export function wireActivityBus(bus: MessageBus, log: ActivityAPI): () => void {
  const unsubscribes: Array<() => void> = [];
  const emit = (draft: Draft): void => {
    try {
      log.record(draft);
    } catch {
      /* a bridge failure must never break the bus */
    }
  };

  unsubscribes.push(
    bus.on<MonitorEvent>(BusEvents.MonitorEvent, (event) => {
      emit(draftFromMonitor(event.payload));
    }),
  );

  unsubscribes.push(
    bus.on<Draft>(BusEvents.ActivityRecord, (event) => {
      const payload = asRecord(event.payload);
      emit({
        kind: (payload["kind"] as ActivityKind) ?? "action",
        title: text(payload["title"], "Activity"),
        ...(typeof payload["detail"] === "string" ? { detail: payload["detail"] } : {}),
        ...(metaOf(payload) ? { meta: metaOf(payload) } : {}),
      });
    }),
  );

  unsubscribes.push(
    bus.on<{ text?: unknown }>(BusEvents.VoiceTranscript, (event) => {
      emit(draftFrom("voice", "Voice command", event.payload));
    }),
  );

  unsubscribes.push(
    bus.on(BusEvents.PlanRequest, (event) => {
      emit(draftFrom("action", "Plan requested", event.payload));
    }),
  );

  unsubscribes.push(
    bus.on(BusEvents.PlanApproval, (event) => {
      emit(draftFrom("action", "Plan reviewed", event.payload));
    }),
  );

  const generic: Array<[type: string, kind: ActivityKind, title: string]> = [
    ["action.executed", "action", "Action executed"],
    ["action.read", "read_page", "Page read"],
    ["action.summary", "summary", "Page summarized"],
    ["action.navigate", "opened_site", "Site opened"],
    ["form.filled", "filled_form", "Form filled"],
    ["integration.event", "integration", "Integration update"],
    ["voice.event", "voice", "Voice activity"],
    ["monitor.alert", "alert", "Monitor alert"],
  ];
  for (const [type, kind, title] of generic) {
    unsubscribes.push(
      bus.on(type, (event) => {
        emit(draftFrom(kind, title, event.payload));
      }),
    );
  }

  return () => {
    for (const unsubscribe of unsubscribes) {
      try {
        unsubscribe();
      } catch {
        /* ignore */
      }
    }
  };
}
