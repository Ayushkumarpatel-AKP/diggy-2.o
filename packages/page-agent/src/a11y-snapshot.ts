/**
 * The **accessibility-tree snapshot** — the webbrain-style "read like a screen
 * reader" view that makes targeting role+name based instead of selector based.
 *
 * Where the flat interactive snapshot (`snapshot.ts`) answers "what can I click",
 * this answers "what is this page, structurally": headings give the outline,
 * landmarks give the regions, and controls are nested under the region they live
 * in. Each node carries the same `ref` handle as the interactive snapshot (they
 * share one {@link RefRegistry}), so a `ref` from here is resolvable by the act
 * layer too.
 *
 * The rendered {@link A11ySnapshot.text} is a compact indented list — the model
 * reads *that*, not raw HTML. It is page-provided content, so callers must treat
 * it as untrusted DATA (see `@diggy/policy`'s `wrapUntrusted`/`detectInjection`);
 * this module itself holds no policy.
 *
 * Cap: at most {@link MAX_A11Y_NODES} nodes; `truncated` reports the rest.
 */
import {
  accessibleName,
  bboxOf,
  deriveRole,
  documentOf,
  isDisabled,
  isHtmlElement,
  isHidden,
  isInViewport,
  matchesInteractive,
  tagOf,
  valueFor,
} from './dom.js';
import type { RefRegistry } from './ref-registry.js';
import type { SnapshotOptions, ViewportSize } from './types.js';

/** Hard cap on nodes in one accessibility snapshot. */
export const MAX_A11Y_NODES = 250;

/** How deep to follow shadow hosts / same-origin iframes. */
const MAX_TRAVERSAL_DEPTH = 10;

/** Landmark / structural tags that give the tree its shape. */
const LANDMARK_ROLES: Readonly<Record<string, string>> = {
  main: 'main',
  nav: 'navigation',
  header: 'banner',
  footer: 'contentinfo',
  aside: 'complementary',
  form: 'form',
  article: 'article',
  section: 'region',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  table: 'table',
  figure: 'figure',
};

/** One node in the accessibility tree. */
export interface A11yNode {
  /** The ref handle (shared with the interactive snapshot's registry). */
  ref: number;
  role: string;
  name: string;
  /** Redacted current value for form controls. */
  value?: string;
  /** `<h1>`…`<h6>` → 1…6. */
  level?: number;
  disabled?: boolean;
  inViewport: boolean;
  /** Nesting depth in the tree (0 = top level). */
  depth: number;
  /** The ref of the nearest included ancestor, or `null` at the top. */
  parentRef: number | null;
}

/** The result of {@link buildA11ySnapshot}. */
export interface A11ySnapshot {
  url: string;
  title: string;
  nodes: A11yNode[];
  /** The compact indented text a model reads. */
  text: string;
  /** How many included nodes existed before the cap. */
  total: number;
  truncated: boolean;
}

/** Collect every element under `scope` (shadow roots + same-origin iframes too). */
function collectAll(scope: ParentNode, out: HTMLElement[], seen: Set<Node>, depth: number): void {
  if (depth > MAX_TRAVERSAL_DEPTH) return;
  for (const node of Array.from(scope.querySelectorAll('*'))) {
    if (seen.has(node)) continue;
    seen.add(node);
    if (isHtmlElement(node)) out.push(node);

    const shadow = node.shadowRoot;
    if (shadow) collectAll(shadow, out, seen, depth + 1);

    if (tagOf(node) === 'iframe') {
      let doc: Document | null = null;
      try {
        doc = (node as HTMLIFrameElement).contentDocument;
      } catch {
        doc = null;
      }
      if (doc && !seen.has(doc)) {
        seen.add(doc);
        collectAll(doc, out, seen, depth + 1);
      }
    }
  }
}

interface Candidate {
  el: HTMLElement;
  role: string;
  name: string;
  level?: number;
}

function headingLevel(el: HTMLElement): number | undefined {
  const match = /^h([1-6])$/.exec(tagOf(el));
  return match ? Number(match[1]) : undefined;
}

/** Is this element part of the accessibility tree we render? */
function candidateFor(el: HTMLElement): Candidate | null {
  const level = headingLevel(el);
  if (level !== undefined) {
    return { el, role: 'heading', name: accessibleName(el), level };
  }
  // Structural checks (not the `isInteractiveElement` type guard): applying the
  // guard to an `HTMLElement` would narrow this function's `else` branch to
  // `never` and hide `getAttribute` below.
  const interactive = matchesInteractive(el) && !isDisabled(el) && !isHidden(el);
  if (interactive) {
    return { el, role: deriveRole(el), name: accessibleName(el) };
  }
  const tag = tagOf(el);
  if (tag === 'img') {
    const alt = (el.getAttribute('alt') ?? '').trim();
    if (alt === '') return null; // decorative
    return { el, role: 'img', name: alt };
  }
  const landmark = LANDMARK_ROLES[tag];
  if (landmark !== undefined) {
    return { el, role: landmark, name: accessibleName(el) };
  }
  // Landmarks expressed via an explicit role, not a tag.
  const explicit = (el.getAttribute('role') ?? '').trim().toLowerCase();
  if (
    explicit === 'main' ||
    explicit === 'navigation' ||
    explicit === 'banner' ||
    explicit === 'contentinfo' ||
    explicit === 'complementary' ||
    explicit === 'region'
  ) {
    return { el, role: explicit, name: accessibleName(el) };
  }
  return null;
}

/** The nearest ancestor (crossing shadow boundaries) of `el`. */
function parentOf(el: HTMLElement): HTMLElement | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  const host = (root as { host?: unknown }).host;
  return isHtmlElement(host) ? host : null;
}

/**
 * Build the accessibility tree for the current page (or `options.root`), using
 * `registry` so every node's `ref` is resolvable by the act layer.
 */
export function buildA11ySnapshot(
  registry: RefRegistry,
  options: SnapshotOptions = {},
): A11ySnapshot {
  const root: ParentNode | null =
    options.root ?? (typeof document !== 'undefined' ? document : null);
  const doc = root ? documentOf(root) : null;

  if (!root) {
    return { url: '', title: '', nodes: [], text: '', total: 0, truncated: false };
  }

  const all: HTMLElement[] = [];
  collectAll(root, all, new Set<Node>(), 0);

  const viewport: ViewportSize | undefined = options.viewport;
  const candidates: Candidate[] = [];
  for (const el of all) {
    if (isHidden(el)) continue;
    const candidate = candidateFor(el);
    if (candidate) candidates.push(candidate);
  }

  const max = Math.max(0, options.max ?? MAX_A11Y_NODES);
  const kept = candidates.slice(0, max);
  const keptSet = new Set<HTMLElement>(kept.map((c) => c.el));
  const generation = registry.beginSnapshot();

  const nodes: A11yNode[] = [];
  const refByEl = new Map<HTMLElement, number>();

  for (const { el, role, name, level } of kept) {
    const ref = registry.register(el, generation);
    refByEl.set(el, ref);

    // Walk up to the nearest kept ancestor for nesting.
    let depth = 0;
    let parentRef: number | null = null;
    for (let parent = parentOf(el); parent; parent = parentOf(parent)) {
      const parentHandle = refByEl.get(parent);
      if (parentHandle !== undefined) {
        parentRef = parentHandle;
        depth = (nodes.find((node) => node.ref === parentHandle)?.depth ?? 0) + 1;
        break;
      }
      depth += 1;
      if (depth > MAX_TRAVERSAL_DEPTH) break;
    }
    if (parentRef === null) depth = 0;

    const node: A11yNode = {
      ref,
      role,
      name,
      inViewport: isInViewport(el, viewport),
      depth,
      parentRef,
    };
    if (level !== undefined) node.level = level;
    if (isDisabled(el)) node.disabled = true;
    const { value } = valueFor(el);
    if (value !== undefined) node.value = value;
    nodes.push(node);
  }

  return {
    url: doc?.location?.href ?? (typeof location !== 'undefined' ? location.href : ''),
    title: doc?.title ?? '',
    nodes,
    text: renderA11yText(nodes),
    total: candidates.length,
    truncated: candidates.length > max,
  };
}

/** Render the tree as a compact indented list — the model-facing view. */
export function renderA11yText(nodes: readonly A11yNode[]): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const indent = '  '.repeat(Math.max(0, Math.min(node.depth, MAX_TRAVERSAL_DEPTH)));
    const parts = [`- ${node.role} "${node.name}"`];
    if (node.level !== undefined) parts.push(`level=${node.level}`);
    if (node.value !== undefined) parts.push(`value="${node.value}"`);
    if (node.disabled) parts.push('disabled');
    if (!node.inViewport) parts.push('offscreen');
    parts.push(`[ref=${node.ref}]`);
    lines.push(`${indent}${parts.join(' ')}`);
  }
  return lines.join('\n');
}
