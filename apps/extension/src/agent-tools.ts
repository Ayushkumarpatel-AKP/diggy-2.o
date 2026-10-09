/**
 * The tool set the agent loop is given.
 *
 * Phase 1 is the page half plus `notify`. Reminders, monitoring and Google plug
 * in here as their runtimes land, so this stays the single place that decides
 * what the model can do.
 */
import type { AgentToolShape } from "@diggy/page-agent";
import { createPageBridge, type PageBridge, type SendToPage } from "./page-tools.js";

export interface ToolkitOptions {
  /** Reaches the content script (the Action Engine). */
  send: SendToPage;
  /** Show the user something immediately and speak it. */
  onNotify?: (title: string, message: string) => void | Promise<void>;
}

export interface Toolkit {
  page: PageBridge;
  tools: AgentToolShape[];
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * `notify` — the agent's own voice.
 *
 * It is a tool rather than a message because the model decides *when* the user
 * should be told something; a reminder that fires mid-task should interrupt, not
 * wait for the final answer.
 */
function notifyTool(onNotify: ToolkitOptions["onNotify"]): AgentToolShape {
  return {
    schema: {
      name: "notify",
      description:
        "Tell the user something right now — a reminder, a warning, or a result they are waiting for. One plain sentence, no markdown.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "A short headline for the bubble." },
          message: { type: "string", description: "One plain sentence." },
        },
        required: ["title", "message"],
      },
    },
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

export async function createToolkit(options: ToolkitOptions): Promise<Toolkit> {
  const page = createPageBridge(options.send);
  const tools = await page.tools();
  tools.push(notifyTool(options.onNotify));
  return { page, tools };
}
