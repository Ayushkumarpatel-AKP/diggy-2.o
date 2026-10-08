/**
 * Test — the overlay and settings pages render from the built extension.
 *
 * `overlay.html` mounts the shared `StatusBubble` (the on-page thought bubble)
 * into `#overlay-root`; `settings.html` renders the settings scaffold.
 */
import { assert, openExtensionPage, extensionUrl } from '../harness.mjs';

export const name = 'overlay-settings-render';
export const description = 'overlay.html renders the status bubble and settings.html renders DIGGY Settings';
export const kind = 'browser';

export async function run(env) {
  const app = await env.launch();
  try {
    const overlay = await app.context.newPage();
    await overlay.goto(extensionUrl(app.extensionId, 'overlay.html'), { waitUntil: 'domcontentloaded' });
    await overlay.waitForSelector('.dg-status', { timeout: 15_000 });
    const bubbleText = (await overlay.locator('.dg-status').innerText()).trim();
    assert(bubbleText.length > 0, 'overlay status bubble must render text');

    const settings = await openExtensionPage(app, 'settings.html', '#root');
    const heading = (await settings.locator('h1').first().innerText()).trim();
    assert(/diggy settings/i.test(heading), `settings h1 must read "DIGGY Settings" (saw "${heading}")`);

    return `overlay bubble="${bubbleText.replace(/\s+/g, ' ').slice(0, 60)}", settings h1="${heading}"`;
  } finally {
    await app.close();
  }
}
