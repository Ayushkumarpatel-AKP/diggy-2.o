/**
 * Task/run state contract — the vocabulary the panel and the runtime agree on so
 * the UI reflects the *real* execution state instead of a transient status line.
 *
 * A run walks: `idle → planning → inspecting → executing → verifying →
 * completed | failed | cancelled`, with `awaiting-approval` as a detour whenever
 * the user must answer before the run can continue.
 *
 * This is deliberately coarse: it names the phase of the whole run, not the
 * avatar's animation FSM (`@diggy/avatar`) which drives the character only.
 */

export type RunState =
  | "idle"
  | "planning"
  | "inspecting"
  | "executing"
  | "verifying"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "cancelled";

/** One executed step, as the panel shows it. */
export interface AgentStepView {
  index: number;
  /** What the run was doing as this step began. */
  state: RunState;
  /** The tools the model called in this step, in order. */
  tools: string[];
  /** The model's own words for the step, when it gave any. */
  text?: string;
  /** Whether the step's action was confirmed (see `ActionResult.verified`). */
  verified?: boolean;
  /** False when any tool in the step failed. */
  ok?: boolean;
}

/** The live view of one run. */
export interface RunView {
  id: string;
  state: RunState;
  goal: string;
  /** The planner's steps, when it produced any. */
  plan?: string[];
  /** Steps completed so far, oldest first. */
  steps: AgentStepView[];
  /** The final answer, once the run is done. */
  text?: string;
}
