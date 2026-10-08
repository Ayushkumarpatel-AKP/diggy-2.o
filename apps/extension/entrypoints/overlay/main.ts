/**
 * On-page overlay (avatar bubble / alerts).
 * The avatar and ui workers own the renderer; this is the buildable scaffold.
 */
const host = document.getElementById("overlay-root");
if (host) {
  host.textContent = "";
}
