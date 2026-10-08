/**
 * Test — the side panel renders the 7-tab dashboard and the command palette opens.
 *
 * Targets the real `sidepanel.html` from the extension origin: nav
 * `[aria-label="Primary"]` with the 7 `NAV_TABS`, the brand wordmark, per-tab
 * screen titles, and the Alt+K command palette dialog.
 */
import { assert, openPanel } from '../harness.mjs';

export const name = 'sidepanel-renders';
export const description = 'sidepanel.html shows the 7-tab nav, screen titles, and the Alt+K command palette';
export const kind = 'browser';

const EXPECTED_TABS = ['Home', 'Assistant', 'Monitor', 'Actions', 'Integrations', 'Vault', 'Activity'];

export async function run(env) {
  const app = await env.launch();
  try {
    const panel = await openPanel(app);

    const tabs = await panel.$$eval('nav[aria-label="Primary"] button', (buttons) =>
      buttons.map((button) => (button.textContent || '').trim()),
    );
    for (const tab of EXPECTED_TABS) {
      assert(tabs.includes(tab), `tab nav must include "${tab}" (saw: ${tabs.join(', ')})`);
    }
    assert(tabs.length === EXPECTED_TABS.length, `expected ${EXPECTED_TABS.length} tabs, saw ${tabs.length}`);

    const brand = (await panel.locator('.dg-sidebar__brand').innerText()).trim();
    assert(/diggy/i.test(brand), `sidebar brand must mention Diggy (saw "${brand}")`);

    // Each tab leads with its own screen header; the Monitor tab is a stable probe.
    await panel.getByRole('button', { name: 'Monitor', exact: true }).click();
    await panel.locator('.dg-screen-header__title').filter({ hasText: 'Monitor' }).first().waitFor({ timeout: 10_000 });

    // The Alt+K command palette is the shared Dashboard hotkey.
    await panel.keyboard.press('Alt+K');
    const palette = panel.locator('[role="dialog"][aria-label="Command palette"]');
    await palette.waitFor({ state: 'visible', timeout: 10_000 });
    const paletteVisible = await palette.isVisible();

    return `tabs=[${tabs.join(', ')}], brand="${brand}", command palette visible=${paletteVisible}`;
  } finally {
    await app.close();
  }
}
