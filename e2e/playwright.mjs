/**
 * Resolve Playwright without a hard dependency on a downloaded browser.
 *
 * `@diggy/e2e` declares `playwright-core` as a devDependency, but the suite also
 * degrades gracefully: if it cannot be resolved the browser tests `skip()` with a
 * clear hint instead of failing. `playwright-core` (not `@playwright/test`) is
 * all the harness needs — `chromium.launchPersistentContext` plus a small runner.
 */
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..');

let cached; // undefined = not tried yet, null = unavailable

/** Some CJS builds expose the API under `default` after a dynamic import. */
function pickApi(mod) {
  if (mod && mod.chromium) return mod;
  if (mod && mod.default && mod.default.chromium) return mod.default;
  return null;
}

async function attempt(loader) {
  try {
    return pickApi(await loader());
  } catch {
    return null;
  }
}

/** Load playwright-core (or playwright) — or return `null` when unavailable. */
export async function loadPlaywright() {
  if (cached !== undefined) return cached;

  const direct = await attempt(() => import('playwright-core'));
  if (direct) {
    cached = direct;
    return cached;
  }

  // Resolve through another workspace package that already depends on it.
  for (const rel of ['services/crawler/package.json', 'package.json']) {
    const resolved = await attempt(async () => {
      const require = createRequire(path.join(repoRoot, rel));
      let target;
      try {
        target = require.resolve('playwright');
      } catch {
        target = require.resolve('playwright-core');
      }
      return import(pathToFileURL(target).href);
    });
    if (resolved) {
      cached = resolved;
      return cached;
    }
  }

  // Last resort: scan the pnpm virtual store.
  try {
    const pnpmDir = path.join(repoRoot, 'node_modules', '.pnpm');
    const dir = readdirSync(pnpmDir)
      .filter((name) => name.startsWith('playwright-core@') || name.startsWith('playwright@'))
      .sort()
      .reverse()[0];
    if (dir) {
      const entry = path.join(pnpmDir, dir, 'node_modules', dir.split('@')[0], 'index.js');
      const mod = await attempt(() => import(pathToFileURL(entry).href));
      if (mod) {
        cached = mod;
        return cached;
      }
    }
  } catch {
    /* fall through */
  }

  cached = null;
  return cached;
}

export const PLAYWRIGHT_MISSING_HINT =
  'playwright-core could not be resolved. Run `pnpm install` in the repo root so ' +
  '@diggy/e2e gets its playwright-core devDependency.';
