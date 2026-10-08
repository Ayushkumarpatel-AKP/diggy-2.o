/**
 * Headless avatar controller (no three.js, no React) — the renderer-agnostic half
 * of the package.
 *
 * `AvatarController` implements the shared `AvatarAPI` exactly and publishes an
 * immutable {@link AvatarSnapshot}. The React `<Avatar>` (in `index.tsx`)
 * subscribes to it and renders the FBX/VRM renderer; any other host can drive the
 * avatar through the same interface with zero rendering dependencies.
 *
 * Keeping this module free of `@react-three/fiber` is deliberate: it makes
 * `play("thinking")`, priority handling and FBX→VRM fallback directly testable in
 * Node.
 */
import type { AvatarAPI, AvatarCapabilityReport, AvatarExpression, AvatarState } from "@diggy/shared";

import { AvatarStateMachine } from "./state-machine.js";

/** Where the avatar should aim its gaze. */
export type AvatarLookAtTarget = "cursor" | "user" | "bubble" | { x: number; y: number };

/** Which renderer is live. FBX is primary; VRM is the fallback. */
export type AvatarRenderMode = "fbx" | "vrm";

/** An immutable view of the controller's state. */
export interface AvatarSnapshot {
  state: AvatarState;
  expression: AvatarExpression | null;
  status: string;
  visible: boolean;
  lookAt: AvatarLookAtTarget | null;
  mode: AvatarRenderMode;
  capability: AvatarCapabilityReport | null;
  /** Set when the FBX path failed and VRM took over. */
  fallbackReason: string | null;
}

function initialSnapshot(): AvatarSnapshot {
  return {
    state: "idle",
    expression: null,
    status: "",
    visible: true,
    lookAt: null,
    mode: "fbx",
    capability: null,
    fallbackReason: null,
  };
}

/** Options for {@link AvatarController}. */
export interface AvatarControllerOptions {
  /** Auto-return timeout for transient states, in ms. Defaults to 4000. */
  autoReturnMs?: number;
  /** Initial state. Defaults to `idle`. */
  initialState?: AvatarState;
}

/**
 * Implements {@link AvatarAPI} and owns the 12-state machine.
 *
 * Every method that changes view state emits a new snapshot to subscribers, so
 * `useSyncExternalStore` / `subscribe` drive the renderer without polling.
 */
export class AvatarController implements AvatarAPI {
  private readonly _machine: AvatarStateMachine;
  private _snapshot: AvatarSnapshot = initialSnapshot();
  private readonly _listeners = new Set<() => void>();

  constructor(options: AvatarControllerOptions = {}) {
    this._machine = new AvatarStateMachine({
      autoReturnMs: options.autoReturnMs,
      initialState: options.initialState,
    });
  }

  /** The underlying finite state machine (advanced, read-mostly). */
  get machine(): AvatarStateMachine {
    return this._machine;
  }

  // --- AvatarAPI ----------------------------------------------------------
  play(state: AvatarState): void {
    if (this._machine.play(state)) this._patch({ state });
  }

  say(text: string, mood: AvatarState = "speaking"): void {
    this._patch({ status: text });
    this.play(mood);
  }

  lookAt(target: AvatarLookAtTarget): void {
    this._patch({ lookAt: target });
  }

  setExpression(expression: AvatarExpression): void {
    this._patch({ expression });
  }

  status(text: string): void {
    this._patch({ status: text });
  }

  setVisible(visible: boolean): void {
    this._patch({ visible });
  }

  // --- Host / renderer hooks ---------------------------------------------
  /** Advance the state machine (called once per rendered frame). */
  tick = (delta: number): void => {
    const before = this._machine.state;
    this._machine.update(delta);
    if (this._machine.state !== before) this._patch({ state: this._machine.state });
  };

  /** Record the capability report from a renderer. */
  setCapability = (capability: AvatarCapabilityReport): void => {
    this._patch({ capability });
  };

  /** Switch to the VRM fallback (FBX base model failed to load). */
  useVrmFallback = (reason: unknown): void => {
    const message = reason instanceof Error ? reason.message : String(reason ?? "FBX assets unavailable");
    this._patch({ mode: "vrm", fallbackReason: message });
  };

  /** The latest capability report, or `null` before a renderer is ready. */
  capability(): AvatarCapabilityReport | null {
    return this._snapshot.capability;
  }

  /** The active renderer mode. */
  mode(): AvatarRenderMode {
    return this._snapshot.mode;
  }

  /** Snapshot for `useSyncExternalStore` / manual subscriptions. */
  getSnapshot = (): AvatarSnapshot => this._snapshot;

  /** Subscribe to snapshot changes. Returns an unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  /** Reset the machine back to `idle` and clear transient view state. */
  reset(): void {
    this._machine.reset();
    this._patch({ state: "idle", status: "", expression: null, lookAt: null });
  }

  dispose(): void {
    this._listeners.clear();
  }

  private _patch(partial: Partial<AvatarSnapshot>): void {
    this._snapshot = { ...this._snapshot, ...partial };
    for (const listener of this._listeners) listener();
  }
}
