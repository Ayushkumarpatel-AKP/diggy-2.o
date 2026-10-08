/**
 * Page content script.
 *
 * Registered at runtime (`registration: "runtime"`) so `<all_urls>` host access stays an
 * optional permission that is only requested once the user opts in. The monitor / actions
 * workers own the real page-reading logic and the dynamic registration call.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "runtime",
  main() {
    // Placeholder — page reading is owned by the monitor / actions workers.
  },
});
