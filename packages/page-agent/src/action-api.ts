/**
 * `createActionAPI` — the **Action Engine**.
 *
 * Implements the shared `ActionAPI` contract (`@diggy/shared`'s
 * `contracts/action.ts`) on top of the act layer (`agent.ts`) and the policy
 * `@diggy/policy`:
 *
 * - `snapshot()` returns the **accessibility tree** as text plus the structured
 *   `A11ySnapshot` — role+name targeting, not brittle selectors.
 * - `read` / `extract` pull page text *as DATA*: it is tainted (`markUntrusted`)
 *   and scanned for injection, and the model-facing form is a `wrapUntrusted`
 *   fence. Page text is never executed.
 * - `click` / `type` / `navigate` / `fill` run through the act layer, so the
 *   **never auto-submit** rule and the sensitive-site blocklist always apply.
 * - `plan()` builds a plan that contains **no submit step**; `execute()` runs an
 *   approved plan, re-checking every step against policy (irreversible steps
 *   require approval and a submit step is refused even then).
 *
 * `tools` exposes the browser-use-style {@link ToolRegistry}; `playbook()` /
 * recording freeze a successful run into a value-free, reusable workflow.
 *
 * `// INTERFACE FOR INTEGRATION` — exported surface:
 *
 *   createActionAPI(options?: ActionAPIOptions): ActionEngine
 *     .snapshot() / .read(target?) / .click(target) / .type(target, text)
 *     .navigate(url) / .extract(query) / .fill(fields) / .plan(goal)
 *     .execute(plan, options?)            // ActionAPI
 *     .tools: ToolRegistry                // .describe() for the prompt
 *     .a11y(): A11ySnapshot
 *     .startRecording() / .stopRecording() / .isRecording() / .playbook(name, goal?)
 *     .reset()
 */
import type { PolicyContext } from '@diggy/policy';
import { detectInjection, markUntrusted, resetTaint, wrapUntrusted } from '@diggy/policy';
import type { InjectionHit } from '@diggy/policy';
import type { ActionAPI, ActionResult as ToolResult, Plan } from '@diggy/shared';
import { buildA11ySnapshot } from './a11y-snapshot.js';
import type { A11ySnapshot } from './a11y-snapshot.js';
import { createPageAgent } from './agent.js';
import type { PageAgent, PageAgentOptions } from './agent.js';
import { isHtmlElement } from './dom.js';
import { buildPlan, runPlan } from './plan.js';
import type { PlanExecutionOptions } from './plan.js';
import { PlaybookRecorder } from './playbook.js';
import type { Playbook } from './playbook.js';
import type { RegisteredTool, ToolHandlerContext } from './tool-registry.js';
import { ToolRegistry } from './tool-registry.js';
import type { ActionResult as ActResult, ScrollDirection, ScrollInput, WaitInput } from './types.js';

/** The engine's public surface: the contract plus the registry/recording extras. */
export interface ActionEngine extends ActionAPI {
  /** The underlying act-layer agent (for hosts that need a single action). */
  readonly agent: PageAgent;
  /** The browser-use-style action catalogue. */
  readonly tools: ToolRegistry;
  /** The accessibility tree of the current page. */
  a11y(): A11ySnapshot;
  /** Begin capturing successful actions into a playbook. */
  startRecording(): void;
  /** Stop capturing. */
  stopRecording(): void;
  /** Is the recorder capturing? */
  isRecording(): boolean;
  /** Freeze the captured actions into a value-free playbook (`null` if empty). */
  playbook(name: string, goal?: string): Playbook | null;
  /** Execute a plan, re-checking every step against policy. */
  execute(plan: Plan, options?: PlanExecutionOptions): Promise<ToolResult[]>;
  /** Clear taint, captured steps and refs (a fresh page/turn). */
  reset(): void;
}

/** Options for {@link createActionAPI}. */
export interface ActionAPIOptions {
  /** Reuse an existing act-layer agent. */
  agent?: PageAgent;
  /** Policy context (origin, taint, site allow list). `url` defaults to the page. */
  policy?: PolicyContext;
  /** Options forwarded to `createPageAgent` when `agent` is omitted. */
  engine?: PageAgentOptions;
  /** Cap on model-facing text (page reads/snapshots). Defaults to 8000 chars. */
  maxText?: number;
  /** Injected clock (tests). */
  now?: () => number;
}

/** Cap the a11y text a bit above the read cap — it is the richer view. */
const SNAPSHOT_TEXT_FACTOR = 2;
const MAX_EXTRACT_MATCHES = 25;
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you', 'please',
  'then', 'than', 'are', 'was', 'were', 'will', 'would', 'should', 'could', 'can', 'get',
  'page', 'site', 'website',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function currentUrl(): string {
  try {
    return typeof location !== 'undefined' ? location.href : '';
  } catch {
    return '';
  }
}

function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Create the Action Engine.
 *
 * The defaults are correct for a content script: a private act-layer agent, the
 * current page as the policy `url`, and the accessibility-tree snapshot as the
 * model-facing "eyes". Everything an action does is gated by `@diggy/policy`.
 */
export function createActionAPI(options: ActionAPIOptions = {}): ActionEngine {
  const agent = options.agent ?? createPageAgent(options.engine ?? {});
  const maxText = Math.max(200, options.maxText ?? 8000);
  const now = options.now ?? (() => Date.now());
  const recorder = new PlaybookRecorder();
  const registry = new ToolRegistry();

  const basePolicy = (): PolicyContext => {
    const context: PolicyContext = { ...(options.policy ?? {}) };
    if (context.url === undefined) context.url = currentUrl();
    return context;
  };

  /* ------------------------------ targets ------------------------------ */

  type Resolved = { ref: number; element: HTMLElement } | { error: string };

  function resolveElement(target: unknown): Resolved {
    const raw =
      typeof target === 'number'
        ? String(target)
        : typeof target === 'string'
          ? target.trim()
          : '';
    if (raw === '') {
      return {
        error: 'A target is required (a ref number, an accessible name, or a CSS selector).',
      };
    }

    if (/^\d+$/.test(raw)) {
      const ref = Number(raw);
      const found = agent.registry.resolve(ref);
      if (found.ok) return { ref, element: found.element };
      return { error: `Ref ${raw} is stale — take a fresh snapshot() before acting.` };
    }

    const snapshot = agent.snapshot();
    const lower = raw.toLowerCase();
    const exact = snapshot.entries.find((entry) => entry.name.toLowerCase() === lower);
    const partial = exact ?? snapshot.entries.find((entry) => entry.name.toLowerCase().includes(lower));
    if (partial) {
      const found = agent.registry.resolve(partial.ref);
      if (found.ok) return { ref: partial.ref, element: found.element };
    }

    if (typeof document !== 'undefined') {
      try {
        const element = document.querySelector(raw);
        if (isHtmlElement(element)) {
          const ref = agent.registry.register(element, agent.registry.beginSnapshot());
          return { ref, element };
        }
      } catch {
        // Not a valid selector — fall through to the "not found" error.
      }
    }

    return {
      error: `No interactive element matches "${raw}". Take a snapshot() and use an accessible name or ref.`,
    };
  }

  /* ------------------------------- reads ------------------------------- */

  function pageText(target?: string): string {
    if (typeof document === 'undefined') return '';
    let element: HTMLElement | null = null;
    if (typeof target === 'string' && target.trim() !== '') {
      const resolved = resolveElement(target);
      if ('element' in resolved) element = resolved.element;
    }
    const source = element ?? document.body;
    const raw = (source as HTMLElement).innerText ?? source?.textContent ?? '';
    return String(raw).replace(/[ \t]+\n/g, '\n').trim();
  }

  function readOutcome(target?: string): { text: string; flags: InjectionHit[]; fenced: string } {
    const label = target ? `page: ${target}` : 'page';
    const text = cap(pageText(target), maxText);
    const flags = detectInjection(text);
    markUntrusted(label, text);
    return { text, flags, fenced: wrapUntrusted(label, text) };
  }

  function snapshotOutcome(): { snapshot: A11ySnapshot; text: string; flags: InjectionHit[] } {
    const snapshot = buildA11ySnapshot(agent.registry);
    const text = cap(snapshot.text, maxText * SNAPSHOT_TEXT_FACTOR);
    const flags = detectInjection(text);
    markUntrusted('page accessibility tree', text);
    return { snapshot, text, flags };
  }

  function queryTokens(query: string): string[] {
    return query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  }

  function extractMatches(query: string, text: string, snapshot: A11ySnapshot): string[] {
    const tokens = queryTokens(query);
    const out: string[] = [];
    const seen = new Set<string>();
    const keep = (line: string): boolean => {
      const trimmed = line.trim().slice(0, 200);
      if (trimmed === '' || seen.has(trimmed)) return false;
      seen.add(trimmed);
      out.push(trimmed);
      return out.length >= MAX_EXTRACT_MATCHES;
    };

    for (const node of snapshot.nodes) {
      const name = node.name.toLowerCase();
      if (tokens.length > 0 && tokens.some((token) => name.includes(token))) {
        if (keep(`${node.role} "${node.name}"`)) return out;
      }
    }
    for (const line of text.split(/\n+/)) {
      const lower = line.toLowerCase();
      if (tokens.length === 0 ? line.trim() !== '' : tokens.some((token) => lower.includes(token))) {
        if (keep(line)) break;
      }
    }
    if (out.length === 0 && text !== '') {
      out.push(text.split(/\n+/).slice(0, 5).join('\n'));
    }
    return out;
  }

  /* ------------------------------ fill -------------------------------- */

  interface FillOutcome {
    results: { field: string; ok: boolean; error?: string }[];
    ok: boolean;
  }

  async function doFill(fields: unknown): Promise<FillOutcome> {
    const entries = isRecord(fields) ? Object.entries(fields) : [];
    const results: { field: string; ok: boolean; error?: string }[] = [];
    for (const [field, value] of entries) {
      const resolved = resolveElement(field);
      if ('error' in resolved) {
        results.push({ field, ok: false, error: resolved.error });
        continue;
      }
      const typed = await agent.type(resolved.ref, String(value ?? ''));
      const entry: { field: string; ok: boolean; error?: string } = { field, ok: typed.ok };
      if (typed.error !== undefined) entry.error = typed.error;
      results.push(entry);
    }
    const ok = results.length > 0 && results.every((entry) => entry.ok);
    return { results, ok };
  }

  /* --------------------- act result → contract result ------------------ */

  function mapAct(
    result: ActResult,
    tool: string,
    args: Record<string, unknown>,
  ): ToolResult {
    const data: Record<string, unknown> = { decision: result.decision };
    if (result.confirm) data['confirm'] = result.confirm;
    const output: ToolResult = { ok: result.ok, extractedContent: result.summary, data };
    if (result.error !== undefined) output.error = result.error;
    if (result.ok) recorder.record(tool, args, result);
    return output;
  }

  /* ------------------------------- tools ------------------------------- */

  const tools: RegisteredTool[] = [
    {
      name: 'snapshot',
      description: 'Return the page as an accessibility tree (role + name per node), as text.',
      parameters: [],
      category: 'read',
      run: async () => {
        const outcome = snapshotOutcome();
        return {
          ok: true,
          extractedContent: outcome.text,
          data: { snapshot: outcome.snapshot, flags: outcome.flags },
        };
      },
    },
    {
      name: 'read',
      description: 'Read the visible text of the page (or of one target) as untrusted DATA.',
      parameters: [{ name: 'target', type: 'string', description: 'Optional ref/name/selector.', required: false }],
      category: 'read',
      run: async (args) => {
        const target = typeof args['target'] === 'string' ? args['target'] : undefined;
        const outcome = readOutcome(target);
        return {
          ok: true,
          extractedContent: outcome.fenced,
          data: { text: outcome.text, flags: outcome.flags },
        };
      },
    },
    {
      name: 'extract',
      description: 'Extract the page content relevant to a query (returns matching lines/labels).',
      parameters: [{ name: 'query', type: 'string', description: 'What to look for.', required: true }],
      category: 'read',
      run: async (args) => {
        const query = typeof args['query'] === 'string' ? args['query'] : '';
        const snapshot = buildA11ySnapshot(agent.registry);
        const text = pageText();
        const matches = extractMatches(query, text, snapshot);
        const flags = detectInjection(text);
        markUntrusted('page', text);
        return {
          ok: true,
          extractedContent: matches.join('\n'),
          data: { query, matches, flags },
        };
      },
    },
    {
      name: 'click',
      description: 'Click an element by ref, accessible name or CSS selector. Never clicks a submit control.',
      parameters: [{ name: 'target', type: 'string', description: 'Ref, accessible name or selector.', required: true }],
      category: 'write',
      run: async (args) => {
        const resolved = resolveElement(args['target']);
        if ('error' in resolved) return { ok: false, error: resolved.error };
        const result = await agent.click(resolved.ref);
        return mapAct(result, 'click', { target: args['target'] });
      },
    },
    {
      name: 'type',
      description: 'Type text into a field (the text is never echoed back).',
      parameters: [
        { name: 'target', type: 'string', description: 'Ref, accessible name or selector.', required: true },
        { name: 'text', type: 'string', description: 'The text to type.', required: true },
      ],
      category: 'write',
      run: async (args) => {
        const resolved = resolveElement(args['target']);
        if ('error' in resolved) return { ok: false, error: resolved.error };
        const text = typeof args['text'] === 'string' ? args['text'] : String(args['text'] ?? '');
        const result = await agent.type(resolved.ref, text);
        return mapAct(result, 'type', { target: args['target'], text });
      },
    },
    {
      name: 'select',
      description: 'Choose an option in a <select> by value or label.',
      parameters: [
        { name: 'target', type: 'string', description: 'Ref, accessible name or selector.', required: true },
        { name: 'value', type: 'string', description: 'Option value or label.', required: true },
      ],
      category: 'write',
      run: async (args) => {
        const resolved = resolveElement(args['target']);
        if ('error' in resolved) return { ok: false, error: resolved.error };
        const value = typeof args['value'] === 'string' ? args['value'] : String(args['value'] ?? '');
        const result = await agent.select(resolved.ref, value);
        return mapAct(result, 'select', { target: args['target'], value });
      },
    },
    {
      name: 'pressKey',
      description: 'Press a key on the focused element (Enter-in-a-form is treated as submit).',
      parameters: [{ name: 'key', type: 'string', description: 'A KeyboardEvent.key value.', required: true }],
      category: 'write',
      run: async (args) => {
        const key = typeof args['key'] === 'string' ? args['key'] : String(args['key'] ?? '');
        const result = await agent.pressKey(key);
        return mapAct(result, 'pressKey', { key });
      },
    },
    {
      name: 'fill',
      description: 'Fill fields by label/name. Never submits.',
      parameters: [{ name: 'fields', type: 'object', description: 'A { label: value } map.', required: true }],
      category: 'write',
      run: async (args) => {
        const outcome = await doFill(args['fields']);
        const output: ToolResult = {
          ok: outcome.ok,
          extractedContent: `Filled ${outcome.results.filter((entry) => entry.ok).length}/${outcome.results.length} field(s).`,
          data: { results: outcome.results },
        };
        const failed = outcome.results.find((entry) => !entry.ok);
        if (failed?.error !== undefined) output.error = failed.error;
        if (outcome.ok) recorder.record('fill', { fields: args['fields'] }, { ok: true });
        return output;
      },
    },
    {
      name: 'scroll',
      description: 'Scroll the page by a direction or a pixel amount.',
      parameters: [
        { name: 'direction', type: 'string', description: 'up | down | left | right.', required: false },
        { name: 'amount', type: 'number', description: 'Pixels.', required: false },
      ],
      category: 'read',
      run: async (args) => {
        const direction = typeof args['direction'] === 'string' ? (args['direction'] as ScrollDirection) : undefined;
        const amount = typeof args['amount'] === 'number' ? args['amount'] : undefined;
        let input: ScrollInput;
        if (direction !== undefined) input = amount !== undefined ? { direction, amount } : direction;
        else if (amount !== undefined) input = amount;
        else input = 'down';
        const result = await agent.scroll(input);
        return mapAct(result, 'scroll', { direction: args['direction'], amount: args['amount'] });
      },
    },
    {
      name: 'waitFor',
      description: 'Wait for text, a selector, or a fixed time.',
      parameters: [
        { name: 'text', type: 'string', description: 'Text to wait for.', required: false },
        { name: 'selector', type: 'string', description: 'Selector to wait for.', required: false },
        { name: 'ms', type: 'number', description: 'Milliseconds.', required: false },
      ],
      category: 'read',
      run: async (args) => {
        const input: WaitInput = {};
        if (typeof args['text'] === 'string') input.text = args['text'];
        if (typeof args['selector'] === 'string') input.selector = args['selector'];
        if (typeof args['ms'] === 'number') input.ms = args['ms'];
        const result = await agent.waitFor(input);
        return mapAct(result, 'waitFor', args);
      },
    },
    {
      name: 'navigate',
      description: 'Navigate the page to a URL (refused for sensitive sites).',
      parameters: [{ name: 'url', type: 'string', description: 'Absolute URL.', required: true }],
      category: 'read',
      run: async (args) => {
        const url = typeof args['url'] === 'string' ? args['url'] : String(args['url'] ?? '');
        const result = await agent.navigate(url);
        return mapAct(result, 'navigate', { url });
      },
    },
    {
      name: 'goBack',
      description: 'Go back to the previous page in history.',
      parameters: [],
      category: 'read',
      run: async () => {
        const result = await agent.goBack();
        return mapAct(result, 'goBack', {});
      },
    },
  ];

  for (const tool of tools) registry.register(tool);

  /* ------------------------------ contract ------------------------------ */

  const engine: ActionEngine = {
    agent,
    tools: registry,

    async snapshot(): Promise<ToolResult> {
      const outcome = snapshotOutcome();
      return {
        ok: true,
        extractedContent: outcome.text,
        data: { snapshot: outcome.snapshot, flags: outcome.flags },
      };
    },

    async read(target?: string): Promise<ToolResult<string>> {
      const outcome = readOutcome(target);
      return { ok: true, extractedContent: outcome.fenced, data: outcome.text };
    },

    async click(target: string): Promise<ToolResult> {
      const resolved = resolveElement(target);
      if ('error' in resolved) return { ok: false, error: resolved.error };
      const result = await agent.click(resolved.ref);
      return mapAct(result, 'click', { target });
    },

    async type(target: string, text: string): Promise<ToolResult> {
      const resolved = resolveElement(target);
      if ('error' in resolved) return { ok: false, error: resolved.error };
      const result = await agent.type(resolved.ref, text);
      return mapAct(result, 'type', { target, text });
    },

    async navigate(url: string): Promise<ToolResult> {
      const result = await agent.navigate(url);
      return mapAct(result, 'navigate', { url });
    },

    async extract(query: string): Promise<ToolResult> {
      return registry.invoke('extract', { query });
    },

    async fill(fields: Record<string, string>): Promise<ToolResult> {
      const outcome = await doFill(fields);
      const output: ToolResult = {
        ok: outcome.ok,
        extractedContent: `Filled ${outcome.results.filter((entry) => entry.ok).length}/${outcome.results.length} field(s).`,
        data: { results: outcome.results },
      };
      const failed = outcome.results.find((entry) => !entry.ok);
      if (failed?.error !== undefined) output.error = failed.error;
      if (outcome.ok) recorder.record('fill', { fields }, { ok: true });
      return output;
    },

    async plan(goal: string): Promise<Plan> {
      return buildPlan(goal, { context: basePolicy(), now });
    },

    async execute(plan: Plan, planOptions?: PlanExecutionOptions): Promise<ToolResult[]> {
      const result = await runPlan(plan, registry, {
        context: basePolicy(),
        ...planOptions,
      });
      return result.results;
    },

    a11y(): A11ySnapshot {
      return buildA11ySnapshot(agent.registry);
    },

    startRecording(): void {
      recorder.start();
    },

    stopRecording(): void {
      recorder.stop();
    },

    isRecording(): boolean {
      return recorder.isRecording();
    },

    playbook(name: string, goal = ''): Playbook | null {
      if (recorder.size() === 0) return null;
      return recorder.toPlaybook(name, goal);
    },

    reset(): void {
      resetTaint();
      recorder.clear();
      agent.registry.clear();
    },
  };

  return engine;
}

/** A `ToolHandlerContext` is accepted by the registry; re-exported for hosts. */
export type { ToolHandlerContext };
