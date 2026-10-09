/**
 * Turning a tool call into a line the user can read.
 *
 * The agent loop calls `onToolCall` *before* each tool runs, so this is what the
 * thinking bubble says while the work is happening — "Filling 14 fields…", not
 * "filled 14 fields". Lines are kept short: the status queue shows one line and
 * clips long text.
 */
import type { ToolCall } from "@diggy/shared";

/** Keep a name short enough to sit inside one bubble line. */
function clip(value: unknown, max = 28): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function target(args: Record<string, unknown>, key = "target"): string {
  const raw = args[key] ?? args["url"] ?? args["query"];
  return clip(raw);
}

/** A host short enough to mention: `https://x.com/a` → `x.com`. */
function hostOf(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return clip(value);
  }
}

/**
 * The line for a tool call. Unknown tools get a neutral line rather than their
 * raw name, so a future tool can never leak an ugly identifier into the bubble.
 */
export function progressForToolCall(call: ToolCall): string {
  const args = call.arguments ?? {};

  switch (call.name) {
    case "read":
    case "extract":
      return "Reading the page…";
    case "snapshot":
      return "Looking at the page…";
    case "click": {
      const name = target(args);
      return name ? `Clicking “${name}”…` : "Clicking…";
    }
    case "type": {
      const name = target(args);
      return name ? `Typing into “${name}”…` : "Typing…";
    }
    case "select": {
      const name = target(args);
      const value = clip(args["value"], 18);
      if (name && value) return `Choosing “${value}” in “${name}”…`;
      return "Choosing an option…";
    }
    case "fill": {
      const fields = args["fields"];
      const count =
        typeof fields === "object" && fields !== null ? Object.keys(fields).length : 0;
      return count > 0 ? `Filling ${count} field${count === 1 ? "" : "s"}…` : "Filling the form…";
    }
    case "scroll":
      return "Scrolling…";
    case "waitFor":
      return "Waiting for the page…";
    case "navigate": {
      const host = hostOf(args["url"]);
      return host ? `Going to ${host}…` : "Opening that page…";
    }
    case "goBack":
      return "Going back…";
    case "createReminder":
      return "Setting that reminder…";
    case "listReminders":
      return "Checking your reminders…";
    case "deleteReminder":
      return "Removing that reminder…";
    case "trackPage":
      return "Tracking this page…";
    case "untrackPage":
      return "Stopping that watch…";
    case "listWatches":
      return "Checking what I'm watching…";
    case "readInbox":
      return "Checking your inbox…";
    case "readCalendar":
      return "Checking your calendar…";
    case "createEvent":
      return "Adding that to your calendar…";
    case "notify":
      return "Noting that…";
    default:
      return "Working on it…";
  }
}

/** The line shown while the model is thinking but has not called anything yet. */
export const PROGRESS_THINKING = "Thinking it through…";
