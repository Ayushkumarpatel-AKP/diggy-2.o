/**
 * Launch helpers: the real built extension inside a persistent Chromium context.
 *
 * Everything degrades gracefully — if the extension is not built, or no Chromium
 * can load an unpacked extension, the callers skip instead of failing.
 *
 * On this machine Playwright's downloaded browsers are absent, but Edge/Chrome
 * ship with Windows and are Chromium-based, so we try a channel fallback chain
 * (`msedge` → `chrome` → bundled `chromium`). `channel: 'msedge'` still runs the
 * new headless mode, which (unlike the old headless shell) can load extensions.
 */
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { repoRoot, loadPlaywright, PLAYWRIGHT_MISSING_HINT } from './playwright.mjs';

/** Where `wxt build` writes the unpacked MV3 extension. */
export const EXTENSION_DIR = path.join(repoRoot, 'apps', 'extension', '.output', 'chrome-mv3');

/** The extension directory to load — overridable for other build locations. */
export function extensionDir() {
  return process.env.DIGGY_E2E_EXTENSION_DIR || EXTENSION_DIR;
}

export const BUILD_HINT =
  'Extension build output not found at apps/extension/.output/chrome-mv3 — ' +
  'run `pnpm --filter @diggy/extension build` first.';

export const CHANNEL_HINT =
  'No Chromium channel could load the unpacked extension. Tried msedge, chrome and the ' +
  'bundled chromium. Install one (e.g. `npx playwright install chromium`) or set ' +
  'DIGGY_E2E_BROWSER to a working channel.';

/** True when the built extension manifest is present. */
export function extensionBuilt() {
  return existsSync(path.join(extensionDir(), 'manifest.json'));
}

function extensionArgs() {
  const dir = extensionDir();
  return [
    `--load-extension=${dir}`,
    `--disable-extensions-except=${dir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
}

/** The Chromium channels to try, in order. */
function channelChain(options) {
  if (options.channel) return [options.channel];
  if (process.env.DIGGY_E2E_BROWSER) return [process.env.DIGGY_E2E_BROWSER];
  return ['msedge', 'chrome', 'chromium', undefined];
}

/** Wait for the MV3 background service worker and read the extension id from it. */
async function extensionIdFrom(context, timeout = 15_000) {
  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout });
  }
  const match = /^chrome-extension:\/\/([a-p]{32})\//.exec(worker.url());
  return match ? match[1] : undefined;
}

async function tryChannel(playwright, channel, options) {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'diggy-e2e-'));
  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(userDataDir, {
      headless: !options.headed,
      channel,
      args: [...extensionArgs(), ...(options.args ?? [])],
      ignoreDefaultArgs: ['--disable-extensions'],
    });
    const extensionId = await extensionIdFrom(context, options.settleTimeout ?? 15_000);
    if (!extensionId) throw new Error('background service worker not found');
    return { context, extensionId, userDataDir };
  } catch (error) {
    await context?.close().catch(() => undefined);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Launch the extension in a persistent context, trying each channel until one
 * both starts and exposes the MV3 service worker.
 *
 * @param {{ headed?: boolean, channel?: string, args?: string[], settleTimeout?: number }} [options]
 * @returns {Promise<{ context, extensionId, userDataDir, channel, close(): Promise<void> }>}
 */
export async function launchExtension(options = {}) {
  const playwright = await loadPlaywright();
  if (!playwright) throw new Error(PLAYWRIGHT_MISSING_HINT);
  if (!extensionBuilt()) throw new Error(BUILD_HINT);

  const failures = [];
  for (const channel of channelChain(options)) {
    try {
      const launched = await tryChannel(playwright, channel, options);
      return {
        context: launched.context,
        extensionId: launched.extensionId,
        userDataDir: launched.userDataDir,
        channel: channel ?? 'chromium',
        async close() {
          await launched.context.close().catch(() => undefined);
          await rm(launched.userDataDir, { recursive: true, force: true }).catch(() => undefined);
        },
      };
    } catch (error) {
      failures.push(`${channel ?? 'chromium'}: ${error?.message ?? String(error)}`);
    }
  }

  throw new Error(`${CHANNEL_HINT}\n  ${failures.join('\n  ')}`);
}

/** URL of a built extension page (side panel, overlay, settings, …). */
export function extensionUrl(extensionId, page = 'sidepanel.html') {
  return `chrome-extension://${extensionId}/${page}`;
}
