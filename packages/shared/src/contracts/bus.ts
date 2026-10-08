/**
 * Message bus contract — content <-> background <-> sidepanel <-> offscreen <-> overlay.
 * Owning worker: core (`packages/shared`, extension background).
 */

export type BusSource = "content" | "background" | "sidepanel" | "offscreen" | "overlay";

export interface BusEvent<T = unknown> {
  type: string;
  source: BusSource;
  payload: T;
  at: number;
}

export type BusHandler<T = unknown> = (event: BusEvent<T>) => void;

export interface MessageBus {
  emit<T>(type: string, payload: T): void;
  on<T>(type: string, handler: BusHandler<T>): () => void;
}

/** Canonical bus event names. Extend via core only. */
export const BusEvents = {
  AvatarState: "avatar.state",
  AvatarStatus: "avatar.status",
  MonitorEvent: "monitor.event",
  ActivityRecord: "activity.record",
  PlanRequest: "action.plan.request",
  PlanApproval: "action.plan.approval",
  VoiceTranscript: "voice.transcript",
} as const;

export type BusEventName = (typeof BusEvents)[keyof typeof BusEvents];
