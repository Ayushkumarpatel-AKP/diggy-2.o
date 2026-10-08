/**
 * Test — the real built extension loads unpacked.
 *
 * Proves `.output/chrome-mv3` is a loadable MV3 extension: the background service
 * worker starts and its URL yields the extension id (which every later test uses).
 */
export const name = 'extension-loads';
export const description = 'the built MV3 extension loads unpacked and its background worker starts';
export const kind = 'browser';

export async function run(env) {
  const app = await env.launch();
  try {
    if (!app.extensionId) throw new Error('no extension id derived from the background service worker');
    if (!/^[a-p]{32}$/.test(app.extensionId)) {
      throw new Error(`extension id looks wrong: ${app.extensionId}`);
    }
    const workers = app.context.serviceWorkers().map((worker) => worker.url());
    if (!workers.some((url) => url.endsWith('/background.js'))) {
      throw new Error(`background service worker missing (saw: ${workers.join(', ')})`);
    }
    return `id=${app.extensionId} channel=${app.channel} worker=${workers[0]}`;
  } finally {
    await app.close();
  }
}
