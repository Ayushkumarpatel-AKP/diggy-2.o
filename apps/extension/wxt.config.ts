import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "DIGGY 2.0",
    short_name: "DIGGY",
    description: "Personal AI browser companion — monitor, act, and stay on top of the web.",
    version: "2.0.0",
    permissions: [
      "storage",
      "alarms",
      "notifications",
      "tabs",
      "scripting",
      "sidePanel",
      "offscreen",
      "activeTab",
    ],
    // Host access is requested at runtime, never bundled as a required permission.
    optional_host_permissions: ["<all_urls>"],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    options_ui: {
      page: "settings.html",
      open_in_tab: true,
    },
    // Push-to-talk. MV3 fires `commands.onCommand` on key-down only (no key-up),
    // so this chord toggles the mic; a page that sees the real keydown/keyup pair
    // can still do true hold-to-talk via VOICE_CONTROL.
    commands: {
      "toggle-voice": {
        suggested_key: { default: "Ctrl+Space" },
        description: "Push-to-talk voice",
      },
    },
  },
  hooks: {
    "build:manifestGenerated": (wxt, manifest) => {
      // Safety rule: `<all_urls>` stays optional. WXT auto-adds required host permissions for
      // runtime-registered content scripts; strip them from the shippable build.
      if (wxt.config.command !== "build") return;
      delete manifest.host_permissions;
      if (manifest.content_scripts?.length === 0) delete manifest.content_scripts;
    },
  },
});
