/**
 * Avatar contract — FBX primary (Chiori.fbx), VRM fallback.
 * Owning worker: avatar (`packages/avatar`).
 */

export type AvatarState =
  | "idle"
  | "blink"
  | "breathing"
  | "listening"
  | "thinking"
  | "speaking"
  | "walk"
  | "happy"
  | "success"
  | "warning"
  | "sleep"
  | "celebration"
  /** Lifecycle: greet on appearance. */
  | "entry"
  /** Idle ambience: a stretch between idle loops. */
  | "stretch"
  /** Lifecycle: wave/walk off when leaving. */
  | "exit";

export type AvatarExpression = Record<string, number>;

export interface AvatarAPI {
  play(state: AvatarState): void;
  say(text: string, mood?: AvatarState): void;
  lookAt(target: "cursor" | "user" | "bubble" | { x: number; y: number }): void;
  setExpression(expression: AvatarExpression): void;
  /** Short status line above the avatar, e.g. "💭 Monitoring website…". */
  status(text: string): void;
  setVisible(visible: boolean): void;
}

export interface AvatarCapabilityReport {
  source: "fbx" | "vrm";
  bones: string[];
  expressions: string[];
  clips: string[];
  triangles: number;
  warnings: string[];
}
