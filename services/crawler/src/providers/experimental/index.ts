/**
 * Opt-in, experimental provider adapters.
 *
 * These adapters (`firecrawl`, `crawl4ai`, `browser-use`, `python-sidecar`)
 * talk to paid third-party vendors or an optional local Python sidecar and are
 * **not** part of the default provider surface. Import them directly, or opt in
 * wholesale with `experimentalProviders` in `../index.ts`.
 */
export {
  BROWSER_USE_PROVIDER_NAME,
  createBrowserUseProvider,
  parseBrowserUseResult,
} from "./browser-use.js";
export type { BrowserUseOptions } from "./browser-use.js";
export { CRAWL4AI_PROVIDER_NAME, createCrawl4aiProvider, mapCrawl4aiItem } from "./crawl4ai.js";
export type { Crawl4aiOptions } from "./crawl4ai.js";
export {
  FIRECRAWL_PROVIDER_NAME,
  createFirecrawlProvider,
  mapFirecrawlDocument,
} from "./firecrawl.js";
export type { FirecrawlOptions } from "./firecrawl.js";
export {
  PYTHON_SIDECAR_PROVIDER_NAME,
  createPythonSidecarProvider,
  mapSidecarResponse,
} from "./python-sidecar.js";
export type { PythonSidecarOptions } from "./python-sidecar.js";
