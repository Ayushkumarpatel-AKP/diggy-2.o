/**
 * UI display helpers.
 */

/** `1.4k` / `12` style compact numbers for metric tiles. */
export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
}

/** `⌘` on Apple hardware, `Ctrl` everywhere else — for shortcut hints. */
export const SHORTCUT_MODIFIER =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
    ? "⌘"
    : "Ctrl";

/** `10:32 AM` from an epoch timestamp; deterministic per locale-independent clock. */
export function formatClock(at: number): string {
  const date = new Date(at);
  const hours24 = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours}:${minutes} ${suffix}`;
}

/** `10 min ago` / `2 hours ago` style relative label. */
export function formatRelative(at: number, now = Date.now()): string {
  const diffMinutes = Math.max(1, Math.round((now - at) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Minutes-ago helper so sample timestamps stay relative to load time. */
export function minutesAgo(minutes: number, now = Date.now()): number {
  return now - minutes * 60000;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
