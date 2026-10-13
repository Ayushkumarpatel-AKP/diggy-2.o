/**
 * The tool set the agent loop is given.
 *
 * This is the one place that decides what the model can do. Every capability is
 * injected by the background, which keeps this module host-agnostic and lets the
 * runtimes (monitor, reminders, Google, search) stay independent of the loop.
 *
 * Two capabilities are deliberately absent from the schema:
 * - **submit** — the model cannot submit, send, delete or pay. The panel's
 *   confirm button reaches the page's submitter through a user-gesture path that
 *   has no tool schema, so the rule cannot be talked around.
 * - **vault reads** — locked fields are released one at a time by the user.
 */
import type { AgentToolShape } from "@diggy/page-agent";
import { createPageBridge, type PageBridge, type PageWritePolicy, type SendToPage } from "./page-tools.js";
import { pointerActionForTool, type PointerBox } from "./pointer.js";
import { progressForToolCall } from "./agent-progress.js";
import { renderSearch, type SearchOutcome } from "./search-web.js";

/** What the background injects. An absent capability is simply not offered. */
export interface ToolkitDeps {
  send: SendToPage;
  onNotify?: (title: string, message: string) => void | Promise<void>;

  search?: (query: string, max?: number) => Promise<SearchOutcome>;
  fetchPage?: (url: string) => Promise<{ ok: boolean; text: string; error?: string }>;

  watches?: {
    list(): { spec: { id: string; url: string; kind: string; intervalSec: number } }[];
    add(input: { url: string; kind?: string; intervalSec?: number }): unknown;
    remove(id: string): boolean;
  };
  reminders?: {
    add(input: { title: string; dueAt: number; notes?: string; command?: string }): {
      id: string;
      dueAt: number;
    };
    list(): { id: string; title: string; dueAt: number; done: boolean; firedAt?: number }[];
    remove(id: string): boolean;
  };
  google?: {
    inbox?(options: { query?: string; max?: number }): Promise<unknown>;
    calendar?(options: { days?: number; max?: number }): Promise<unknown>;
  };
  /** Tools built elsewhere (the vault) that do not need a named slot here. */
  extraTools?: AgentToolShape[];
  /**
   * Ask the user before doing something that changes what they see.
   *
   * Used by `openVideo` and any other navigating action: the model proposes, the
   * user approves, and only then does anything touch the browser.
   */
  approve?: (request: {
    title: string;
    detail: string;
    targetUrl?: string;
    thumbnailUrl?: string;
  }) => Promise<boolean>;
  /**
   * May the agent navigate to this URL right now?
   *
   * The host answers, because it is the only place that knows what the user
   * actually said. It returns true when they named the target, and otherwise asks
   * them — which is the enforcement behind "never open a site the command did not
   * require".
   */
  allowNavigation?: (url: string, reason?: string) => Promise<boolean>;
  /**
   * Pre-authorization for ordinary in-page writes (click/type/select/fill/…).
   *
   * The page's gate confirms tainted writes and nothing in the page can answer,
   * so without this every write after the first snapshot stalls. The host
   * answers from policy instead — approval here covers the write as part of the
   * user's explicit task. `submit` is never approved through this channel.
   */
  pagePolicy?: PageWritePolicy;
  /**
   * May the agent send/submit right now?
   *
   * Sending is irreversible, so this always asks the user; a sensitive site
   * (bank, payment, password manager, health) is refused outright. Without it the
   * `send` tool is simply not offered.
   */
  allowSend?: (request: { url: string; reason?: string }) => Promise<boolean>;
  /**
   * The browser's open tabs.
   *
   * Without this the agent could only ever see the active tab, so "the Google Form
   * that is open" was unanswerable and it acted on whatever tab happened to be
   * focused.
   */
  tabs?: {
    list(): { id: number; url: string; title: string; active: boolean }[];
    get(id: number): { id: number; url: string; title: string } | undefined;
    resolve(describe: string): {
      best?: { id: number; url: string; title: string };
      candidates: { id: number; url: string; title: string }[];
      ambiguous: boolean;
    };
  };
}

export interface Toolkit {
  page: PageBridge;
  tools: AgentToolShape[];
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Does this look like a web address rather than a video search?
 *
 * Stops `openVideo` from offering to "play linkedin.com on YouTube" — a website
 * is opened with `openUrl`, never played.
 */
export function looksLikeUrl(text: string): boolean {
  const value = text.trim();
  if (value === "") return false;
  if (/^(https?:\/\/|www\.)/i.test(value)) return true;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value);
}

/** Site/service names a person opens — never something to "play" on YouTube. */
const SITE_NAMES: ReadonlySet<string> = new Set([
  "youtube",
  "you tube",
  "yt",
  "google",
  "gmail",
  "instagram",
  "facebook",
  "whatsapp",
  "linkedin",
  "twitter",
  "github",
  "gitlab",
  "reddit",
  "netflix",
  "spotify",
  "amazon",
  "flipkart",
  "notion",
  "chatgpt",
  "openai",
  "wikipedia",
  "stackoverflow",
  "stack overflow",
  "google maps",
  "google drive",
  "google docs",
  "google calendar",
  "prime video",
  "hotstar",
  "disney plus",
]);

/** Drop a leading verb and trailing punctuation so "open YouTube" reads as "youtube". */
function normalizeTarget(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^(?:please\s+)?(?:open|play|go\s+to|goto|visit|watch|launch)\s+/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

/** Is this the name of a website/app rather than a video? */
export function looksLikeSite(text: string): boolean {
  const value = normalizeTarget(text);
  if (value === "") return false;
  if (SITE_NAMES.has(value)) return true;
  // "youtube music", "yt shorts", …
  return /^(?:you\s?tube|yt)(?:\s+(?:music|shorts|kids|tv|premium|gaming|video))?$/.test(value);
}

/**
 * Does this ask for a *website* rather than a video?
 *
 * `openVideo` must refuse these: "Play YouTube on YouTube" is nonsense. The model
 * should reach for `openUrl` instead, which this error tells it.
 */
export function looksLikeWebsite(text: string): boolean {
  return looksLikeUrl(text) || looksLikeSite(text);
}

/** Build a tool schema. Kept terse so the catalogue stays readable. */
function schema(
  name: string,
  description: string,
  properties: Record<string, { type: string; description: string }>,
  required: string[] = [],
): AgentToolShape["schema"] {
  const parameters: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) parameters["required"] = required;
  return { name, description, parameters };
}

/**
 * `notify` — the agent's own voice.
 *
 * It is a tool rather than a message because the model decides *when* the user
 * should be told something; a reminder that fires mid-task should interrupt, not
 * wait for the final answer.
 */
function notifyTool(onNotify: ToolkitDeps["onNotify"]): AgentToolShape {
  return {
    schema: schema(
      "notify",
      "Tell the user something right now — a reminder, a warning, or a result they are waiting for. One plain sentence, no markdown.",
      {
        title: { type: "string", description: "A short headline for the bubble." },
        message: { type: "string", description: "One plain sentence." },
      },
      ["title", "message"],
    ),
    run: async (args) => {
      const title = stringArg(args, "title");
      const message = stringArg(args, "message");
      if (title === "" && message === "") {
        return { ok: false, error: "A title or a message is required." };
      }
      if (onNotify) await onNotify(title, message);
      return { ok: true, content: "Shown to the user." };
    },
  };
}

function searchTool(search: NonNullable<ToolkitDeps["search"]>): AgentToolShape {
  return {
    schema: schema(
      "searchWeb",
      "Search the live web for current information — news, scores, prices, releases, trending topics, anything that happened after your training. Use it whenever the answer must be current, and prefer it over guessing.",
      {
        query: { type: "string", description: "What to search for." },
        max: { type: "number", description: "How many results (1-10, default 5)." },
      },
      ["query"],
    ),
    run: async (args) => {
      const query = stringArg(args, "query");
      if (query === "") return { ok: false, error: "A query is required." };
      const outcome = await search(query, numberArg(args, "max"));
      return { ok: outcome.ok, content: renderSearch(outcome) };
    },
  };
}

function fetchPageTool(fetchPage: NonNullable<ToolkitDeps["fetchPage"]>): AgentToolShape {
  return {
    schema: schema(
      "fetchPage",
      "Read one web page as text when you already have its URL. This does not open anything.",
      { url: { type: "string", description: "Absolute URL." } },
      ["url"],
    ),
    run: async (args) => {
      const url = stringArg(args, "url");
      if (url === "") return { ok: false, error: "A url is required." };
      const result = await fetchPage(url);
      return result.ok ? { ok: true, content: result.text } : { ok: false, error: result.error };
    },
  };
}

/**
 * `listTabs` — let the agent see the browser before it decides anything.
 *
 * This is the "inspect the context first" requirement made concrete: with it the
 * model can find the tab the user meant, instead of assuming the active one.
 */
function listTabsTool(tabs: NonNullable<ToolkitDeps["tabs"]>): AgentToolShape {
  return {
    schema: schema(
      "listTabs",
      "List the browser tabs the user has open, with their titles and URLs. Use this FIRST whenever the request refers to a page ('the form that is open', 'my GitHub tab') so you act on the right one instead of whichever tab happens to be focused.",
      {
        describe: {
          type: "string",
          description:
            "Optional: what the user called the page. Returns the best match and whether it is ambiguous.",
        },
      },
    ),
    run: async (args) => {
      const describe = stringArg(args, "describe");

      if (describe !== "") {
        const found = tabs.resolve(describe);
        if (!found.best) {
          const lines = found.candidates.map((tab) => `- ${tab.title} — ${tab.url}`);
          return {
            ok: true,
            content:
              lines.length > 0
                ? `No tab clearly matches "${describe}". Open tabs:\n${lines.join("\n")}\n\nAsk the user which one, or use listTabs with a better description.`
                : "No matching tab. Ask the user to open the page.",
          };
        }
        const extra = found.ambiguous
          ? "\n\nNote: more than one open tab matches this. Confirm with the user before acting."
          : "";
        return {
          ok: true,
          content: `Best match: "${found.best.title}" — ${found.best.url} (tab ${found.best.id}).${extra}`,
        };
      }

      const open = tabs.list();
      if (open.length === 0) return { ok: true, content: "No readable tabs are open." };
      return {
        ok: true,
        content: open
          .map((tab) => `${tab.active ? "* " : "- "}${tab.title} — ${tab.url} (tab ${tab.id})`)
          .join("\n"),
      };
    },
  };
}

/**
 * Page tools whose effect we re-inspect afterwards ("Page now:").
 *
 * The reads (`snapshot`/`read`/`extract`) and `waitFor` are excluded: inspecting
 * after an inspection would just double the prompt.
 */
const ACTION_VERBS: ReadonlySet<string> = new Set([
  "click",
  "type",
  "select",
  "fill",
  "scroll",
  "navigate",
  "goBack",
  "pressKey",
  "submit",
]);

/** Let the page settle before re-inspecting after an action (ms). */
const SETTLE_MS = 70;
const NAV_SETTLE_MS = 450;
/** Cap on the post-action accessibility text attached to a tool result. */
const PAGE_NOW_CHARS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function capChars(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

type ShapedResult = { ok?: boolean; content?: string; data?: unknown; error?: string };

/** The accessibility text of the target tab right now, or a honest note. */
async function inspectTarget(page: PageBridge): Promise<string> {
  const snapshot = await page.invoke("snapshot", {});
  const text = typeof snapshot.extractedContent === "string" ? snapshot.extractedContent.trim() : "";
  return text === "" ? "(the page reported no contents — it may still be loading)" : capChars(text, PAGE_NOW_CHARS);
}

/**
 * Wrap an action tool so every action result carries the page's state afterwards.
 *
 * This is the **verify** half of inspect → act → verify: rather than trust that a
 * click or a type did what it claimed, the result is followed by a fresh snapshot
 * of the target tab, so the model always sees the consequence (or the lack of
 * one). The element handle (`data.target`) rides along for the pointer overlay.
 */
function withPageState(page: PageBridge, tool: AgentToolShape): AgentToolShape {
  const name = tool.schema.name;
  if (!ACTION_VERBS.has(name)) return tool;
  return {
    schema: tool.schema,
    run: async (args, context) => {
      const shaped = (await tool.run(args, context)) as ShapedResult;
      await sleep(name === "navigate" || name === "goBack" ? NAV_SETTLE_MS : SETTLE_MS);

      // Show where it landed — only for actions that actually ran, so the pointer
      // can never report a click that failed.
      if (shaped.ok !== false) {
        const target = (shaped.data as { target?: { bbox?: PointerBox } } | undefined)?.target;
        page.pointer({
          action: pointerActionForTool(name),
          ...(target?.bbox ? { bbox: target.bbox } : {}),
          label: progressForToolCall({ id: "", name, arguments: args }),
        });
      }

      const content = typeof shaped.content === "string" ? shaped.content : "";
      return { ...shaped, content: `${content}\n\nPage now:\n${await inspectTarget(page)}`.trim() };
    },
  };
}

/**
 * `useTab` — aim the page tools at one tab.
 *
 * `listTabs` tells the model which tabs are open; this is how it acts on the
 * answer. Once a tab is chosen every page tool runs there, so "the form that is
 * open" is filled in *that* tab rather than whichever one is focused. It refuses
 * to guess: an ambiguous or unmatched description comes back with the candidates
 * so the model asks, instead of silently writing into the wrong page.
 */
function useTabTool(
  page: PageBridge,
  tabs: NonNullable<ToolkitDeps["tabs"]>,
): AgentToolShape {
  function candidates(find: ReturnType<NonNullable<ToolkitDeps["tabs"]>["resolve"]>): string {
    return find.candidates.map((tab) => `- ${tab.title} — ${tab.url} (tab ${tab.id})`).join("\n");
  }

  /** Aim at a tab *and* inspect it — choosing a tab is the inspection. */
  async function aim(tab: { id: number; url: string; title: string }): Promise<Record<string, unknown>> {
    page.target(tab.id);
    return {
      ok: true,
      content: `Now working in "${tab.title}" — ${tab.url} (tab ${tab.id}).\n\nPage now:\n${await inspectTarget(page)}`,
    };
  }

  return {
    schema: schema(
      "useTab",
      "Choose which of the user's open tabs the page tools act on. Use it whenever the request names a page ('the form that is open', 'my GitHub tab') or when more than one tab could match, then do the reading or filling. Everything after it happens on that tab, not on whichever tab is focused.",
      {
        tabId: {
          type: "number",
          description: "The tab id from listTabs. Use when you already know which tab.",
        },
        describe: {
          type: "string",
          description: "What the user called the page. Resolved against their open tabs.",
        },
      },
    ),
    run: async (args) => {
      const tabId = numberArg(args, "tabId");
      if (tabId !== undefined) {
        const tab = tabs.get(tabId);
        if (!tab) {
          return { ok: false, error: `No open tab with id ${tabId}. Use listTabs to see them.` };
        }
        return aim(tab);
      }

      const describe = stringArg(args, "describe");
      if (describe === "") {
        return { ok: false, error: "Give a tabId or a description of the tab." };
      }

      const found = tabs.resolve(describe);
      if (!found.best) {
        const lines = candidates(found);
        return {
          ok: true,
          content:
            lines.length > 0
              ? `No tab clearly matches "${describe}". Open tabs:\n${lines}\n\nAsk the user which one, or call useTab with a tabId.`
              : "No matching tab. Ask the user to open the page.",
        };
      }
      if (found.ambiguous) {
        return {
          ok: true,
          content: `More than one tab matches "${describe}". Ask the user which one, then call useTab with its tabId:\n${candidates(found)}`,
        };
      }

      return aim(found.best);
    },
  };
}

/**
 * `send` — the authorized send/submit.
 *
 * The model may *propose* a send, but never perform one silently: every call asks
 * the user to approve it, and a sensitive site is refused outright. This is the
 * only model-reachable path to a Send/Submit button (`click` still refuses submit
 * controls), so "reply to Priyanka" can finish while "never send on your own"
 * still holds.
 */
function sendTool(page: PageBridge, deps: ToolkitDeps): AgentToolShape {
  return {
    schema: schema(
      "send",
      "Send or submit what is on the page — press the page's Send/Submit button to finish a message, comment or form. This is irreversible, so the user is ALWAYS asked to approve it; you can never send on your own. Prepare the content first (type/fill), then call this. Say what is being sent in `reason`.",
      {
        reason: {
          type: "string",
          description: "One short sentence: what is being sent and to whom.",
        },
      },
      ["reason"],
    ),
    run: async (args) => {
      const reason = stringArg(args, "reason");
      const tabs = deps.tabs;
      const targetId = page.targetTabId();
      const tab = tabs
        ? targetId !== undefined
          ? tabs.get(targetId)
          : tabs.list().find((candidate) => candidate.active)
        : undefined;

      const permitted = deps.allowSend
        ? await deps.allowSend({ url: tab?.url ?? "", ...(reason ? { reason } : {}) })
        : false;
      if (!permitted) {
        return { ok: false, error: "The user did not approve sending. Nothing was sent." };
      }

      const outcome = await page.submit();
      if (!outcome.ok) {
        return { ok: false, error: outcome.error ?? "No Send or Submit button was found." };
      }
      const where = tab?.title ? ` on ${tab.title}` : "";
      return { ok: true, content: `Pressed “${outcome.label ?? "Send"}”${where} — sent.` };
    },
  };
}

/**
 * `openUrl` — the only way to navigate, and it is gated.
 *
 * The model deliberately does not have the raw `navigate` verb: an ungated
 * navigation is what let a question end up opening YouTube. This tool consults
 * the host's rule — a target the user actually named goes straight through, and
 * anything the model thought of by itself needs the user's approval first.
 */
function openUrlTool(
  page: PageBridge,
  allowNavigation: ToolkitDeps["allowNavigation"],
): AgentToolShape {
  return {
    schema: schema(
      "openUrl",
      "Go to a website — a URL, or any site the user names ('open YouTube', 'go to my GitHub'). This CHANGES what the user is looking at, so you may only reach for it when they asked to go somewhere; if they asked a question, answer or search instead of opening anything.",
      {
        url: { type: "string", description: "Absolute URL to open." },
        reason: { type: "string", description: "One short sentence: why the user needs this page." },
      },
      ["url"],
    ),
    run: async (args) => {
      const url = stringArg(args, "url");
      if (url === "") return { ok: false, error: "A url is required." };
      const reason = stringArg(args, "reason");

      const permitted = allowNavigation ? await allowNavigation(url, reason) : false;
      if (!permitted) {
        return {
          ok: false,
          error:
            "The user did not approve opening that page. Answer from what you already have, or ask them first.",
        };
      }
      const navigated = await page.invoke("navigate", { url });
      return navigated.ok
        ? { ok: true, content: `Opened ${url}.` }
        : { ok: false, error: navigated.error ?? "Could not open that page." };
    },
  };
}

function watchTools(watches: NonNullable<ToolkitDeps["watches"]>): AgentToolShape[] {
  return [
    {
      schema: schema(
        "trackPage",
        "Watch a page and tell the user the moment it changes. Use when the user says track / monitor / keep an eye on this page.",
        {
          url: {
            type: "string",
            description: "The page to watch. Use the page the user is on when they say 'this page'.",
          },
          intervalSec: {
            type: "number",
            description: "How often to check, in seconds (300-3600, default 900).",
          },
          kind: {
            type: "string",
            description:
              "content_change | keyword | new_post | registration_open | deadline_change | release_published | price_change | custom.",
          },
        },
        ["url"],
      ),
      run: async (args) => {
        const url = stringArg(args, "url");
        if (url === "") return { ok: false, error: "A url is required (use the page the user is on)." };
        const intervalSec = numberArg(args, "intervalSec");
        const kind = stringArg(args, "kind");
        watches.add({
          url,
          ...(kind ? { kind } : {}),
          ...(intervalSec !== undefined ? { intervalSec } : {}),
        });
        return {
          ok: true,
          content: `Now watching ${url} every ${intervalSec ?? 900}s. The user is told as soon as something changes.`,
        };
      },
    },
    {
      schema: schema("listWatches", "List the pages currently being watched.", {}),
      run: async () => {
        const list = watches.list();
        if (list.length === 0) return { ok: true, content: "Nothing is being watched yet." };
        return {
          ok: true,
          content: list
            .map(
              (entry) =>
                `- [${entry.spec.id}] ${entry.spec.url} (every ${entry.spec.intervalSec}s, ${entry.spec.kind})`,
            )
            .join("\n"),
        };
      },
    },
    {
      schema: schema(
        "untrackPage",
        "Stop watching a page.",
        { id: { type: "string", description: "The watch id from listWatches." } },
        ["id"],
      ),
      run: async (args) => {
        const id = stringArg(args, "id");
        return watches.remove(id)
          ? { ok: true, content: "Stopped watching it." }
          : { ok: false, error: `No watch with id "${id}".` };
      },
    },
  ];
}

function reminderTools(reminders: NonNullable<ToolkitDeps["reminders"]>): AgentToolShape[] {
  return [
    {
      schema: schema(
        "createReminder",
        "Set a one-shot reminder. dueAt must be an absolute epoch-millisecond timestamp in the future — work it out from the current time you were given. Never set a past time.",
        {
          title: { type: "string", description: "What to remind about." },
          dueAt: { type: "number", description: "Absolute epoch ms, in the future." },
          notes: { type: "string", description: "Extra detail to show with it." },
          command: {
            type: "string",
            description: "What the user is likely to want done when it fires, in their own words.",
          },
        },
        ["title", "dueAt"],
      ),
      run: async (args) => {
        const title = stringArg(args, "title");
        const dueAt = numberArg(args, "dueAt");
        if (title === "") return { ok: false, error: "A title is required." };
        if (dueAt === undefined) return { ok: false, error: "dueAt is required." };
        if (dueAt <= Date.now()) {
          return {
            ok: false,
            error: "That time is in the past. Work out the next future time and try again.",
          };
        }
        const notes = stringArg(args, "notes");
        const command = stringArg(args, "command");
        const created = reminders.add({
          title,
          dueAt,
          ...(notes ? { notes } : {}),
          ...(command ? { command } : {}),
        });
        const when = new Date(created.dueAt).toLocaleString("en-US");
        return { ok: true, content: `Reminder set for ${when}: ${title}.` };
      },
    },
    {
      schema: schema("listReminders", "List the user's reminders.", {}),
      run: async () => {
        const list = reminders.list();
        if (list.length === 0) return { ok: true, content: "No reminders set." };
        return {
          ok: true,
          content: list
            .map((entry) => {
              const when = new Date(entry.dueAt).toLocaleString("en-US");
              const status = entry.done ? "done" : entry.firedAt ? "fired" : "pending";
              return `- [${entry.id}] ${entry.title} — ${when} (${status})`;
            })
            .join("\n"),
        };
      },
    },
    {
      schema: schema(
        "deleteReminder",
        "Delete a reminder.",
        { id: { type: "string", description: "The reminder id from listReminders." } },
        ["id"],
      ),
      run: async (args) => {
        const id = stringArg(args, "id");
        return reminders.remove(id)
          ? { ok: true, content: "Deleted that reminder." }
          : { ok: false, error: `No reminder with id "${id}".` };
      },
    },
  ];
}

function googleTools(google: NonNullable<ToolkitDeps["google"]>): AgentToolShape[] {
  const tools: AgentToolShape[] = [];

  if (google.inbox) {
    const inbox = google.inbox;
    tools.push({
      schema: schema(
        "readInbox",
        "Read the user's Gmail inbox.",
        {
          query: {
            type: "string",
            description: "Optional Gmail search, e.g. 'is:unread' or 'from:github'.",
          },
          max: { type: "number", description: "How many messages (default 10)." },
        },
      ),
      run: async (args) => {
        const query = stringArg(args, "query");
        const max = numberArg(args, "max");
        const data = await inbox({
          ...(query ? { query } : {}),
          ...(max !== undefined ? { max } : {}),
        });
        return { ok: true, data };
      },
    });
  }

  if (google.calendar) {
    const calendar = google.calendar;
    tools.push({
      schema: schema("readCalendar", "Read the user's upcoming calendar events.", {
        days: { type: "number", description: "How many days ahead (default 7)." },
      }),
      run: async (args) => {
        const days = numberArg(args, "days");
        const data = await calendar({ ...(days !== undefined ? { days } : {}) });
        return { ok: true, data };
      },
    });
  }

  return tools;
}

/** Pull a YouTube video id out of any URL shape YouTube uses. */
function youtubeId(url: string): string | undefined {
  const match =
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/.exec(
      url,
    );
  return match?.[1];
}

/**
 * The video tools — deliberately **two**, with opposite contracts.
 *
 * The single `playYouTube` tool used to be the only thing mentioning video, and
 * its description invited navigation, so a question like "tell me about
 * MrBeast's latest video" navigated the user's tab. Splitting the pair is the
 * fix: `findVideo` can only read, `openVideo` can only act and must be approved.
 */
function videoTools(
  page: PageBridge,
  search: ToolkitDeps["search"],
  approve: ToolkitDeps["approve"],
): AgentToolShape[] {
  const tools: AgentToolShape[] = [];

  if (search) {
    tools.push({
      schema: schema(
        "findVideo",
        "LOOK UP a video and report what it is (title, channel, link, thumbnail). This NEVER opens, navigates or plays anything — use it for every question or request for information about a video, including 'the latest MrBeast video'. To actually start playing, use openVideo afterwards.",
        {
          query: { type: "string", description: "What to look for, e.g. 'MrBeast latest video'." },
        },
        ["query"],
      ),
      run: async (args) => {
        const query = stringArg(args, "query");
        if (query === "") return { ok: false, error: "A query is required." };

        // Read-only by construction: this path only ever calls searchWeb, so it
        // cannot touch the user's tab even if the model wanted it to.
        const outcome = await search(`site:youtube.com ${query}`, 5);
        if (!outcome.ok || outcome.results.length === 0) {
          return { ok: false, error: outcome.error ?? `No video found for "${query}".` };
        }

        const lines: string[] = [];
        for (const [index, result] of outcome.results.entries()) {
          const id = youtubeId(result.url);
          lines.push(
            `${index + 1}. ${result.title}`,
            `   ${result.url}`,
            id ? `   thumbnail: https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "",
            result.snippet ? `   ${result.snippet}` : "",
          );
        }
        return {
          ok: true,
          content: `${lines.filter((line) => line !== "").join("\n")}\n\n(Answer the user from this. Do not open YouTube unless they asked to play it.)`,
        };
      },
    });
  }

  tools.push({
    schema: schema(
      "openVideo",
      "Play a specific video on YouTube. ONLY for videos — never to open a website, a domain like `linkedin.com`, or a site name like `YouTube`; use `openUrl` for those. This changes what the user is looking at, so they are asked to approve it first. Use it only when they asked to play or watch a specific video, not when they asked about one.",
      {
        query: { type: "string", description: "What to play, e.g. 'MrBeast latest video'." },
        index: { type: "number", description: "Which result to play (1 = first, default 1)." },
      },
      ["query"],
    ),
    run: async (args) => {
      const query = stringArg(args, "query");
      if (query === "") return { ok: false, error: "A query is required." };

      // A website/site name is opened with `openUrl`, not played. Refuse before
      // asking, so the user never sees "Play YouTube on YouTube?".
      if (looksLikeWebsite(query)) {
        return {
          ok: false,
          error: `"${query}" is a website, not a video. Use openUrl to open it. openVideo is only for playing a specific video (e.g. "play MrBeast's latest video").`,
        };
      }

      const approved = approve
        ? await approve({
            title: `Play “${query}” on YouTube?`,
            detail: "This opens YouTube in your current tab and starts the video.",
            targetUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
          })
        : false;
      if (!approved) {
        return { ok: false, error: "The user did not approve opening that video." };
      }

      const navigated = await page.invoke("navigate", {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      });
      if (!navigated.ok) return { ok: false, error: navigated.error ?? "Could not open YouTube." };

      await page.invoke("waitFor", {
        selector: "a#video-title, ytd-video-renderer a",
        timeoutMs: 15000,
      });
      const snapshot = await page.invoke("snapshot", {});

      // Results appear in the accessibility tree as: link "<title>" [ref=N]
      const links: { name: string; ref: string }[] = [];
      for (const line of (snapshot.extractedContent ?? "").split("\n")) {
        const match = /link\s+"(.+?)".*?\[ref=(\d+)\]/i.exec(line);
        if (match?.[1] && match[2]) links.push({ name: match[1], ref: match[2] });
      }
      const wanted = Math.max(1, numberArg(args, "index") ?? 1);
      const target = links.filter((link) => link.name.length > 8)[wanted - 1];
      if (!target) {
        return { ok: false, error: `YouTube opened but no playable result was found for "${query}".` };
      }

      const clicked = await page.invoke("click", { target: target.ref });
      return clicked.ok
        ? { ok: true, content: `Playing "${target.name}" on YouTube.` }
        : { ok: false, error: clicked.error ?? "Could not start the video." };
    },
  });

  return tools;
}

export async function createToolkit(deps: ToolkitDeps): Promise<Toolkit> {
  const page = createPageBridge(deps.send, deps.pagePolicy);
  const tools = (await page.tools()).map((tool) => withPageState(page, tool));

  tools.push(notifyTool(deps.onNotify));
  tools.push(...videoTools(page, deps.search, deps.approve));
  if (deps.allowNavigation) tools.push(openUrlTool(page, deps.allowNavigation));
  if (deps.tabs) {
    tools.push(listTabsTool(deps.tabs));
    tools.push(useTabTool(page, deps.tabs));
  }
  if (deps.allowSend) tools.push(sendTool(page, deps));

  if (deps.search) tools.push(searchTool(deps.search));
  if (deps.fetchPage) tools.push(fetchPageTool(deps.fetchPage));
  if (deps.watches) tools.push(...watchTools(deps.watches));
  if (deps.reminders) tools.push(...reminderTools(deps.reminders));
  if (deps.google) tools.push(...googleTools(deps.google));
  if (deps.extraTools) tools.push(...deps.extraTools);

  return { page, tools };
}
