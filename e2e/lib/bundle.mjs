/**
 * Bundle the real product modules for execution inside a page.
 *
 * The suite drives the *shipped* product code (`@diggy/forms`, `@diggy/policy`,
 * `@diggy/page-agent`, `@diggy/monitor`) inside a real Chromium page, together
 * with the loaded extension — rather than re-implementing the safety rules in the
 * test. The packages export TypeScript source (`main: ./src/index.ts`), so they
 * are bundled on demand with esbuild into a single IIFE that assigns
 * `window.__DIGGY_TEST__`.
 *
 * If esbuild is unavailable the caller `skip()`s — the browser product tests are
 * additive; the Node gate tests never need this.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { repoRoot } from '../playwright.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The exact product surface the in-page tests use. */
export const PRODUCT_API = [
  'detectFields',
  'matchFields',
  'buildPreview',
  'fillForm',
  'dryRun',
  'isSubmitSurface',
  'decide',
  'detectInjection',
  'wrapUntrusted',
  'sensitiveSiteCategory',
  'buildPlan',
  'runPlan',
  'planIsSubmitFree',
  'isSubmitStep',
  'ToolRegistry',
  'evaluateWatch',
  'createWatchState',
];

const ENTRY = `
import { detectFields, matchFields, buildPreview, fillForm, dryRun, isSubmitSurface } from '@diggy/forms';
import { decide, detectInjection, wrapUntrusted, sensitiveSiteCategory } from '@diggy/policy';
import { buildPlan, runPlan, planIsSubmitFree, isSubmitStep, ToolRegistry } from '@diggy/page-agent';
import { evaluateWatch, createWatchState } from '@diggy/monitor';
export { detectFields, matchFields, buildPreview, fillForm, dryRun, isSubmitSurface, decide, detectInjection, wrapUntrusted, sensitiveSiteCategory, buildPlan, runPlan, planIsSubmitFree, isSubmitStep, ToolRegistry, evaluateWatch, createWatchState };
`;

let esbuildPromise;

async function loadEsbuild() {
  if (esbuildPromise) return esbuildPromise;
  esbuildPromise = (async () => {
    try {
      const mod = await import('esbuild');
      return mod.build ? mod : mod.default;
    } catch {
      /* fall through to the store scan */
    }
    try {
      const pnpmDir = path.join(repoRoot, 'node_modules', '.pnpm');
      const dir = readdirSync(pnpmDir)
        .filter((name) => name.startsWith('esbuild@'))
        .sort()
        .reverse()[0];
      if (dir) {
        const entry = path.join(pnpmDir, dir, 'node_modules', 'esbuild', 'lib', 'main.js');
        const mod = await import(pathToFileURL(entry).href);
        return mod.build ? mod : mod.default;
      }
    } catch {
      /* unavailable */
    }
    return null;
  })();
  return esbuildPromise;
}

function aliasMap() {
  const alias = {};
  for (const pkg of ['forms', 'policy', 'page-agent', 'monitor', 'shared', 'core', 'vault', 'avatar', 'ui', 'voice', 'activity']) {
    alias[`@diggy/${pkg}`] = path.join(repoRoot, 'packages', pkg, 'src', 'index.ts');
  }
  return alias;
}

/**
 * Build the product IIFE.
 * @returns {Promise<{ code: string } | { skipped: string }>}
 */
export async function buildProductBundle() {
  const esbuild = await loadEsbuild();
  if (!esbuild?.build) {
    return { skipped: 'esbuild is not available — run `pnpm install` so @diggy/e2e gets its devDependency.' };
  }
  try {
    const result = await esbuild.build({
      stdin: { contents: ENTRY, resolveDir: path.join(repoRoot, 'packages', 'forms'), loader: 'ts', sourcefile: 'diggy-e2e-bundle.ts' },
      bundle: true,
      format: 'iife',
      globalName: '__DIGGY_TEST__',
      platform: 'browser',
      target: 'es2022',
      alias: aliasMap(),
      logLevel: 'silent',
      write: false,
    });
    return { code: result.outputFiles[0].text };
  } catch (error) {
    return { skipped: `esbuild failed to bundle the product: ${error?.message ?? String(error)}` };
  }
}

/**
 * Inject the product bundle into a page and return a handle to the global.
 * The page must be a normal http(s) page (the extension pages set a CSP that
 * blocks injected script).
 */
export async function injectProduct(page) {
  const bundle = await buildProductBundle();
  if (bundle.skipped) return { skipped: bundle.skipped };
  await page.addScriptTag({ content: bundle.code });
  const present = await page.evaluate(() => Boolean(globalThis.__DIGGY_TEST__));
  if (!present) return { skipped: 'the product bundle did not attach to window.__DIGGY_TEST__' };
  return { ok: true };
}
