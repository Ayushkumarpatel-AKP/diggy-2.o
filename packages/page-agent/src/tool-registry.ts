/**
 * The **tool registry** — a browser-use-style action catalogue for the Action
 * Engine.
 *
 * Every action is a {@link RegisteredTool}: a `name`, a model-readable
 * `description`, its parameters, its policy `category`, and a `run()` that
 * returns the shared contract's {@link ToolResult} (`ok` + `extractedContent` +
 * `data` + `error`), never the act layer's internal result.
 *
 * The registry holds no policy of its own beyond the *classification* it
 * advertises: the concrete tools (see `action-api.ts`) delegate to
 * `@diggy/page-agent`'s act layer, which is where `decide()` is actually
 * enforced. `describe()` renders the catalogue block a model prompt embeds.
 */
import { classifyTool } from '@diggy/policy';
import type { PolicyContext, ToolClass } from '@diggy/policy';
import type { ActionResult as ToolResult } from '@diggy/shared';

/** One parameter in a tool's signature. */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
}

/** The static half of a tool (everything a model needs to choose it). */
export interface ActionTool {
  name: string;
  description: string;
  parameters: readonly ToolParameter[];
  /** `read | write | irreversible` — the policy class this action maps to. */
  category: ToolClass;
}

/** Per-invocation options the executor threads through. */
export interface ToolHandlerContext {
  policy?: PolicyContext;
  /** The user approved a gated step (host-supplied). */
  approved?: boolean;
}

/** A complete tool: its catalogue entry plus its `run`. */
export interface RegisteredTool extends ActionTool {
  run(args: Record<string, unknown>, context: ToolHandlerContext): Promise<ToolResult>;
}

/**
 * The registry tool name → `@diggy/policy` tool name.
 *
 * The policy layer's vocabulary (`readPage`, `fillForm`, `submit`, …) is what
 * `classifyTool`/`decide` understand; the Action Engine's verbs are friendlier
 * (`read`, `click`, `fill`). This is the single mapping between them, so a plan
 * verdict and a gate verdict never disagree.
 */
export const POLICY_TOOL_FOR: Readonly<Record<string, string>> = {
  snapshot: 'readPage',
  read: 'readPage',
  extract: 'readPage',
  scroll: 'readPage',
  waitFor: 'readPage',
  navigate: 'readPage',
  goBack: 'readPage',
  click: 'fillForm',
  type: 'fillForm',
  select: 'fillForm',
  fill: 'fillForm',
  pressKey: 'fillForm',
};

/** Map a registry tool name to the policy tool name `decide()` classifies. */
export function policyToolFor(tool: string): string {
  return POLICY_TOOL_FOR[tool] ?? tool;
}

/** The policy class of a registry tool. */
export function toolCategory(tool: string, args?: unknown): ToolClass {
  return classifyTool(policyToolFor(tool), args);
}

/**
 * A collection of named tools. Immutable-ish: `register` overwrites by name.
 * `invoke` is total — an unknown tool or a throwing `run()` becomes an
 * `ok: false` {@link ToolResult}, never an exception the caller must catch.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Every tool, in registration order. */
  list(): RegisteredTool[] {
    return [...this.tools.values()];
  }

  /** Every tool name, in registration order. */
  names(): string[] {
    return [...this.tools.keys()];
  }

  /** How many tools are registered. */
  size(): number {
    return this.tools.size;
  }

  /**
   * Run a tool by name. Returns an `ok: false` result for an unknown tool or a
   * thrown error rather than rejecting.
   */
  async invoke(
    name: string,
    args: Record<string, unknown> = {},
    context: ToolHandlerContext = {},
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, error: `Unknown tool "${name}".` };
    }
    try {
      return await tool.run(args ?? {}, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Tool "${name}" failed: ${message}` };
    }
  }

  /** The catalogue block to embed in a model prompt (browser-use style). */
  describe(): string {
    const lines: string[] = ['Available tools:'];
    for (const tool of this.list()) {
      lines.push(`- ${tool.name} (${tool.category}): ${tool.description}`);
      if (tool.parameters.length > 0) {
        const params = tool.parameters
          .map((p) => `${p.name}:${p.type}${p.required ? '' : '?'}`)
          .join(', ');
        lines.push(`  args: ${params}`);
      }
    }
    return lines.join('\n');
  }
}
