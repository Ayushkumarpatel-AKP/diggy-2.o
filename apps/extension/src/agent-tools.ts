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
import { createPageBridge, type PageBridge, type SendToPage } from "./page-tools.js";
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
      "Read one web page as clean text when you already have its URL.",
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

/**
 * Play a specific YouTube video by driving YouTube's own search page.
 *
 * No API key and no scraping: the page tools already do exactly what a person
 * does — navigate to the results, read the accessibility tree, click the first
 * video link.
 */
function youtubeTool(page: PageBridge): AgentToolShape {
  return {
    schema: schema(
      "playYouTube",
      "Open YouTube and play a video matching a description (e.g. 'the latest MrBeast video'). Searches YouTube and plays the first match.",
      {
        query: { type: "string", description: "What to search YouTube for." },
        index: { type: "number", description: "Which result to play (1 = first, default 1)." },
      },
      ["query"],
    ),
    run: async (args) => {
      const query = stringArg(args, "query");
      if (query === "") return { ok: false, error: "A query is required." };
      const wanted = Math.max(1, numberArg(args, "index") ?? 1);

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
      const target = links.filter((link) => link.name.length > 8)[wanted - 1];
      if (!target) {
        return {
          ok: false,
          error: `YouTube opened but no playable result was found for "${query}".`,
        };
      }

      const clicked = await page.invoke("click", { target: target.ref });
      return clicked.ok
        ? { ok: true, content: `Playing "${target.name}" on YouTube.` }
        : { ok: false, error: clicked.error ?? "Could not start the video." };
    },
  };
}

export async function createToolkit(deps: ToolkitDeps): Promise<Toolkit> {
  const page = createPageBridge(deps.send);
  const tools = await page.tools();

  tools.push(notifyTool(deps.onNotify));
  tools.push(youtubeTool(page));

  if (deps.search) tools.push(searchTool(deps.search));
  if (deps.fetchPage) tools.push(fetchPageTool(deps.fetchPage));
  if (deps.watches) tools.push(...watchTools(deps.watches));
  if (deps.reminders) tools.push(...reminderTools(deps.reminders));
  if (deps.google) tools.push(...googleTools(deps.google));

  return { page, tools };
}
