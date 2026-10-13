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
import type { ActionAPI, ActionTarget, ActionResult as ToolResult, BrowserAction, Plan } from '@diggy/shared';
import { buildA11ySnapshot } from './a11y-snapshot.js';
import type { A11ySnapshot } from './a11y-snapshot.js';
import { createPageAgent } from './agent.js';
import type { PageAgent, PageAgentOptions } from './agent.js';
import { bboxOf, isHtmlElement, isInViewport } from './dom.js';
import { buildPlan, runPlan } from './plan.js';
import type { PlanExecutionOptions } from './plan.js';
import { PlaybookRecorder } from './playbook.js';
import type { Playbook } from './playbook.js';
import type { RegisteredTool, ToolHandlerContext } from './tool-registry.js';
import { ToolRegistry } from './tool-registry.js';
import { findSubmitControl, performUserSubmit } from './user-submit.js';
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

/**
 * Words that carry no targeting signal on their own ("search bar" → the signal
 * is "search"). Kept separate from STOP_WORDS, which serves query extraction.
 */
const RESOLVE_STOP_WORDS = new Set([
  'the', 'a', 'an', 'on', 'in', 'to', 'of', 'for', 'this', 'that', 'it',
  'bar', 'box', 'field', 'input', 'control', 'element', 'thing', 'please',
  'click', 'type', 'press', 'into',
]);

/** Words that mean the user is pointing at a search field. */
const SEARCH_INTENT_WORDS = ['search', 'find', 'query', 'lookup', 'look up'];

/** Minimum resolve score before a guess is acted on rather than reported. */
const MIN_RESOLVE_SCORE = 3;

/** Control-kind hints ("button", "link", …) mapped to snapshot roles. */
function roleIntentFor(lower: string): Set<string> | null {
  if (/\bbutton\b/.test(lower)) return new Set(['button']);
  if (/\blink\b/.test(lower)) return new Set(['link']);
  if (/\bcheckbox\b/.test(lower)) return new Set(['checkbox']);
  if (/\bradio\b/.test(lower)) return new Set(['radio']);
  if (/\bselect\b|\bdropdown\b|\bcombobox\b/.test(lower)) return new Set(['combobox', 'listbox']);
  if (/\btextarea\b/.test(lower)) return new Set(['textbox']);
  return null;
}

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

/** Layered target identification:
 *  1. Accessible role + name from snapshot
 *  2. Labels and semantic attributes
 *  3. Visible text + surrounding context
 *  4. DOM relationships / validated selectors
 *  5. Computer-use fallback (screenshots + visual detection)
 */
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

    // Score every snapshot entry against the query. Plain substring matching
    // fails real phrasing ("search bar" vs an entry named "Search"), and the
    // old reverse-includes matched *any* entry — including unnamed ones — so
    // scoring is token- and role-aware instead. A match always needs real name
    // evidence; role points alone never clear the bar.
    const queryTokens = lower
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 2 && !RESOLVE_STOP_WORDS.has(word));
    const wantsSearch = SEARCH_INTENT_WORDS.some((word) => lower.includes(word));
    const roleIntent = roleIntentFor(lower);

    let best: { ref: number; score: number } | null = null;
    for (const entry of snapshot.entries) {
      const name = (entry.name ?? '').toLowerCase();
      let roleScore = 0;
      let nameScore = 0;
      if (roleIntent && roleIntent.has(entry.role)) roleScore += 3;
      if (wantsSearch) {
        if (entry.role === 'searchbox') roleScore += 3;
        else if (entry.role === 'textbox' || entry.role === 'combobox') roleScore += 2;
        if (entry.type === 'search') roleScore += 2;
      }
      if (name !== '') {
        if (name === lower) nameScore += 6;
        else if (name.includes(lower)) nameScore += 4;
        else if (name.length >= 3 && lower.includes(name)) nameScore += 3;
        else {
          const nameTokens = new Set(
            name.split(/[^a-z0-9]+/).filter((word) => word.length >= 2),
          );
          let shared = 0;
          for (const token of queryTokens) {
            if (nameTokens.has(token)) shared += 1;
          }
          nameScore += Math.min(4.5, shared * 1.5);
          if (entry.type && queryTokens.includes(entry.type.toLowerCase())) nameScore += 1.5;
        }
      }
      const score = roleScore + nameScore + (entry.inViewport ? 1 : 0);
      if (nameScore > 0 && score >= MIN_RESOLVE_SCORE && (best === null || score > best.score)) {
        best = { ref: entry.ref, score };
      }
    }
    // "The button" on a page with exactly one button is unambiguous.
    if (!best && roleIntent) {
      const kind = snapshot.entries.filter((entry) => roleIntent.has(entry.role));
      if (kind.length === 1 && kind[0]) best = { ref: kind[0].ref, score: MIN_RESOLVE_SCORE };
    }
    if (best) {
      const found = agent.registry.resolve(best.ref);
      if (found.ok) return { ref: best.ref, element: found.element };
    }

    // Layer 4: CSS selector fallback
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

    // No match: list the plausible fields so the caller recovers in one step
    // instead of guessing names again.
    const isTextEntry = (role: string, type?: string): boolean =>
      role === 'searchbox' ||
      role === 'textbox' ||
      role === 'combobox' ||
      type === 'search' ||
      type === 'textarea' ||
      type === 'text';
    const describe = (ref: number, role: string, name: string): string =>
      `- ${role} "${name === '' ? '(unnamed)' : name}" [ref=${ref}]`;
    const fields = snapshot.entries.filter((entry) => isTextEntry(entry.role, entry.type));
    const shortlist = (fields.length > 0 ? fields : snapshot.entries.filter((entry) => entry.name !== ''))
      .slice(0, 5)
      .map((entry) => describe(entry.ref, entry.role, entry.name ?? ''))
      .join('\n');
    return {
      error:
        `No interactive element matches "${raw}".` +
        (shortlist !== ''
          ? ` Candidates on this page:\n${shortlist}\nUse a ref number from a fresh snapshot().`
          : ' Take a snapshot() and use a ref number.'),
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

  async function doFill(fields: unknown, context?: ToolHandlerContext): Promise<FillOutcome> {
    const entries = isRecord(fields) ? Object.entries(fields) : [];
    const results: { field: string; ok: boolean; error?: string }[] = [];
    for (const [field, value] of entries) {
      const resolved = resolveElement(field);
      if ('error' in resolved) {
        results.push({ field, ok: false, error: resolved.error });
        continue;
      }
      const typed = await agent.type(resolved.ref, String(value ?? ''), approvalOf(context));
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
    if (result.verified !== undefined) data['verified'] = result.verified;
    if (result.target !== undefined) data['target'] = result.target;
    const output: ToolResult = { ok: result.ok, extractedContent: result.summary, data };
    if (result.error !== undefined) output.error = result.error;
    if (result.verified !== undefined) output.verified = result.verified;
    if (result.target !== undefined) output.target = result.target;
    if (result.ok) recorder.record(tool, args, result);
    return output;
  }

  /**
   * The host's per-call authorization, forwarded to the act layer's gate.
   *
   * The registry tools run in the page, but the *decision* to act was made by
   * the host (the extension's agent loop, which already enforces navigation,
   * send and site policy). Without this, every write after the first page read
   * trips the taint-confirm rule with nobody around to confirm it — the exact
   * "agent can't touch anything" stall. `deny` verdicts and the submit refusal
   * ignore this flag, so it can never force a forbidden action through.
   */
  function approvalOf(context: ToolHandlerContext | undefined): { approved: boolean } {
    return { approved: context?.approved === true };
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
      run: async (args, context) => {
        const resolved = resolveElement(args['target']);
        if ('error' in resolved) return { ok: false, error: resolved.error };
        const result = await agent.click(resolved.ref, approvalOf(context));
        return mapAct(result, 'click', { target: args['target'] });
      },
    },
    {
      name: 'type',
      description:
        'Type text into a field by its visible label, placeholder or ref from snapshot() — e.g. "Search" for a search box (the text is never echoed back).',
      parameters: [
        { name: 'target', type: 'string', description: 'Ref, accessible name or selector.', required: true },
        { name: 'text', type: 'string', description: 'The text to type.', required: true },
      ],
      category: 'write',
      run: async (args, context) => {
        const resolved = resolveElement(args['target']);
        if ('error' in resolved) return { ok: false, error: resolved.error };
        const text = typeof args['text'] === 'string' ? args['text'] : String(args['text'] ?? '');
        const result = await agent.type(resolved.ref, text, approvalOf(context));
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
      run: async (args, context) => {
        const resolved = resolveElement(args['target']);
        if ('error' in resolved) return { ok: false, error: resolved.error };
        const value = typeof args['value'] === 'string' ? args['value'] : String(args['value'] ?? '');
        const result = await agent.select(resolved.ref, value, approvalOf(context));
        return mapAct(result, 'select', { target: args['target'], value });
      },
    },
    {
      name: 'pressKey',
      description: 'Press a key on the focused element (Enter-in-a-form is treated as submit).',
      parameters: [{ name: 'key', type: 'string', description: 'A KeyboardEvent.key value.', required: true }],
      category: 'write',
      run: async (args, context) => {
        const key = typeof args['key'] === 'string' ? args['key'] : String(args['key'] ?? '');
        const result = await agent.pressKey(key, approvalOf(context));
        return mapAct(result, 'pressKey', { key });
      },
    },
    {
      name: 'fill',
      description: 'Fill fields by label/name. Never submits.',
      parameters: [{ name: 'fields', type: 'object', description: 'A { label: value } map.', required: true }],
      category: 'write',
      run: async (args, context) => {
        const outcome = await doFill(args['fields'], context);
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
      run: async (args, context) => {
        const direction = typeof args['direction'] === 'string' ? (args['direction'] as ScrollDirection) : undefined;
        const amount = typeof args['amount'] === 'number' ? args['amount'] : undefined;
        let input: ScrollInput;
        if (direction !== undefined) input = amount !== undefined ? { direction, amount } : direction;
        else if (amount !== undefined) input = amount;
        else input = 'down';
        const result = await agent.scroll(input, approvalOf(context));
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
      run: async (args, context) => {
        const input: WaitInput = {};
        if (typeof args['text'] === 'string') input.text = args['text'];
        if (typeof args['selector'] === 'string') input.selector = args['selector'];
        if (typeof args['ms'] === 'number') input.ms = args['ms'];
        const result = await agent.waitFor(input, approvalOf(context));
        return mapAct(result, 'waitFor', args);
      },
    },
    {
      name: 'navigate',
      description: 'Navigate the page to a URL (refused for sensitive sites).',
      parameters: [{ name: 'url', type: 'string', description: 'Absolute URL.', required: true }],
      category: 'read',
      run: async (args, context) => {
        const url = typeof args['url'] === 'string' ? args['url'] : String(args['url'] ?? '');
        const result = await agent.navigate(url, approvalOf(context));
        return mapAct(result, 'navigate', { url });
      },
    },
    {
      name: 'goBack',
      description: 'Go back to the previous page in history.',
      parameters: [],
      category: 'read',
      run: async (_args, context) => {
        const result = await agent.goBack(approvalOf(context));
        return mapAct(result, 'goBack', {});
      },
    },
    {
      /*
       * The one verb that may press a submit/send control — and only when the
       * host passes `approved: true`, which it does after a real user gesture.
       * It is deliberately NOT in `AGENT_ACTION_TOOLS`, so the model cannot call
       * it directly; the extension's gated `send` tool is the model-facing path.
       */
      name: 'submit',
      description: 'Press the page submit/send control. Irreversible: runs only with explicit approval.',
      parameters: [],
      category: 'irreversible',
      run: async (_args, context) => {
        const control = findSubmitControl();
        if (!control) {
          return {
            ok: false,
            error: 'No submit or send control was found on this page.',
            data: { decision: 'confirm' },
          };
        }
        const target: ActionTarget = {
          ref: 0,
          name: control.label,
          role: 'button',
          bbox: bboxOf(control.element),
          inViewport: isInViewport(control.element),
        };
        if (context.approved !== true) {
          return {
            ok: false,
            extractedContent: `Ready to press "${control.label}" — waiting for approval.`,
            error:
              'Diggy never submits, sends, deletes or purchases on its own. Approve it and it will press the button for you.',
            data: { decision: 'confirm', label: control.label, target },
          };
        }
        const pressed = performUserSubmit(control);
        const output: ToolResult = {
          ok: pressed.ok,
          data: { decision: 'allow', label: pressed.label, target },
        };
        if (pressed.ok) output.extractedContent = `Pressed "${pressed.label}".`;
        else if (pressed.error !== undefined) output.error = pressed.error;
        return output;
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
