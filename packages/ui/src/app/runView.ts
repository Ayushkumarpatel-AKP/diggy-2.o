/**
 * Run-view presentation: turning the runtime's task state into the words and
 * tone the panel shows. Pure, so the mapping is unit-tested rather than eyeballed.
 */
import type { AgentStepView, RunState } from "@diggy/shared";
import type { Tone } from "../theme.js";

/** A short, human label for a run state. */
export function runStateLabel(state: RunState): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "planning":
      return "Planning";
    case "inspecting":
      return "Inspecting the page";
    case "executing":
      return "Working";
    case "verifying":
      return "Checking the result";
    case "awaiting-approval":
      return "Waiting for you";
    case "completed":
      return "Done";
    case "failed":
      return "Couldn’t finish";
    case "cancelled":
      return "Stopped";
    default:
      return "Working";
  }
}

/** The status tone for a run state. */
export function runStateTone(state: RunState): Tone {
  switch (state) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "cancelled":
    case "idle":
      return "muted";
    case "awaiting-approval":
      return "warning";
    default:
      return "primary";
  }
}

/** One line per step for the live step list. */
export function stepSummary(step: AgentStepView): string {
  const what = step.tools.length > 0 ? step.tools.join(", ") : "thinking";
  const mark = step.ok === false ? "✕" : step.verified ? "✓" : "•";
  return `${mark} ${what}`;
}

/** True once the run has finished (successfully or not). */
export function isRunFinished(state: RunState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}
