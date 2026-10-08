/**
 * Shared helpers for the DIGGY e2e suite.
 *
 * The browser tests drive the *real built extension* in a persistent Chromium
 * context; the gate tests exercise the real product modules in Node. Nothing here
 * fails when a prerequisite is missing — callers `skip()` instead.
 */
import {
  extensionBuilt,
  launchExtension,
  extensionUrl,
  BUILD_HINT,
  CHANNEL_HINT,
} from './extension.mjs';
import { loadPlaywright, PLAYWRIGHT_MISSING_HINT } from './playwright.mjs';
import { buildProductBundle, injectProduct, PRODUCT_API } from './lib/bundle.mjs';
import { startFixtureServer } from './fixtures/server.mjs';

export { extensionUrl, injectProduct, buildProductBundle, PRODUCT_API, BUILD_HINT, PLAYWRIGHT_MISSING_HINT, CHANNEL_HINT };

/** Throw this from a test to mark it skipped rather than failed. */
export class SkipError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SkipError';
    this.skip = true;
  }
}

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long to let the MV3 service worker finish its `onInstalled` bootstrap
 * before we open a page. On a *fresh* profile Chromium fires `onInstalled`,
 * which sets the side-panel behaviour; waiting a moment avoids racing it.
 */
export const SETTLE_MS = 2500;

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Build the per-run environment handed to every test. */
export async function createEnv({ headed = false } = {}) {
  const playwright = await loadPlaywright();
  const built = extensionBuilt();
  const fixtures = await startFixtureServer();
  return {
    playwright,
    built,
    headed,
    fixtures,
    /** Launch the extension; throws SkipError when a prerequisite is missing. */
    async launch() {
      if (!playwright) throw new SkipError(PLAYWRIGHT_MISSING_HINT);
      if (!built) throw new SkipError(BUILD_HINT);
      let app;
      try {
        app = await launchExtension({ headed });
      } catch (error) {
        throw new SkipError(`${CHANNEL_HINT}\n    ${error?.message ?? String(error)}`);
      }
      await delay(SETTLE_MS);
      return app;
    },
    async dispose() {
      await fixtures.close();
    },
  };
}

/** Open a fixture page (normal http origin) and wait for it to load. */
export async function openFixturePage(app, url) {
  const page = await app.context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

/** Open the built side panel and wait for its tab nav. */
export async function openPanel(app) {
  if (!app.extensionId) throw new Error('extension id not found (background service worker missing)');
  const page = await app.context.newPage();
  await page.goto(extensionUrl(app.extensionId, 'sidepanel.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('nav[aria-label="Primary"]', { timeout: 15_000 });
  return page;
}

/** Open an arbitrary built extension page and wait for `#root` (or the given selector). */
export async function openExtensionPage(app, page = 'settings.html', selector = '#root') {
  if (!app.extensionId) throw new Error('extension id not found (background service worker missing)');
  const tab = await app.context.newPage();
  await tab.goto(extensionUrl(app.extensionId, page), { waitUntil: 'domcontentloaded' });
  await tab.waitForSelector(selector, { timeout: 15_000 });
  return tab;
}
