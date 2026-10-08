# DIGGY 2.0

A Personal AI Browser Companion: a living companion that lives in the browser, understands the page,
monitors the web on your behalf, alerts you to what matters, and helps you act — with a custom FBX
avatar in the bottom-right corner and push-to-talk voice.

> **Status:** all core modules are implemented and merged, with 607 unit tests + an eval harness green.
> See `agents/STATUS.md` for the build board and the remaining hardening follow-ups.

## Stack

- **Monorepo:** pnpm 9 + Turborepo, TypeScript 5.7 (strict, ESM/`NodeNext`).
- **Extension:** WXT 0.19, Manifest V3, React 18, Tailwind 3.
- **Avatar:** three.js + React Three Fiber, `FBXLoader` + `AnimationMixer` (FBX primary, VRM fallback).
- **AI:** provider-agnostic layer — Groq primary → NVIDIA NIM failover (OpenAI-compatible).
- **Services:** Fastify (crawler, api) + SQLite; Crawlee + Playwright for crawling.

## Layout

| Path | What |
|---|---|
| `apps/extension` | the MV3 extension (side panel, overlay, offscreen audio, content script) |
| `apps/demo` | Vite gallery of every screen/component (design review) |
| `packages/shared` | contracts (provider/avatar/monitor/action/vault/bus/activity/nav) + bus/storage + tokens |
| `packages/core` | the brain: provider failover, orchestrator, prompt, memory, skills |
| `packages/avatar` | FBX avatar engine + 12-state machine + VRM fallback |
| `packages/ui` | pastel + gold design system, 7-tab dashboard, command palette, status bubble |
| `packages/monitor` | the Monitor Engine (watches, change detection, dedupe, alerts) |
| `packages/page-agent` + `packages/policy` | Action Engine + safety gates |
| `packages/vault` + `packages/forms` | encrypted vault + smart form filling (never submits) |
| `packages/voice` | push-to-talk core, STT/TTS, lip-sync feed |
| `packages/activity` | transparency log (what DIGGY read/filled/opened/monitored) |
| `packages/service-auth` | Node-only per-install auth for the local services |
| `services/crawler` | Crawlee + Playwright + Readability, Jina, optional Python extractor |
| `services/api` | Fastify API: OAuth, encrypted tokens, packs, MCP connectors |
| `e2e/` · `evals/` | Playwright end-to-end + agent evaluation harness |
| `diggy motion/` | the official FBX avatar, clips, textures, theme + logo PNGs |

## Run

```bash
# This machine exports NODE_ENV=production, which makes pnpm skip devDependencies.
NODE_ENV=development pnpm install          # PowerShell: $env:NODE_ENV="development"; pnpm install

pnpm -w typecheck
pnpm -w test
pnpm -w build
pnpm --filter @diggy/extension build       # → apps/extension/.output/chrome-mv3
pnpm --filter @diggy/demo dev              # design gallery
```

Load `apps/extension/.output/chrome-mv3` unpacked in Chrome. Provider keys live **server-side only** —
never in the extension bundle (see `.env.example`).

## Design & assets

- Avatar: `diggy motion/Chiori.fbx` + 8 animation clips + 4 textures (also mirrored to `assets/avatar/`).
- UI: `diggy motion/Diggy Pastel Productivity Dashboard.png` is the design source of truth; the logo is
  `Cheerful Golden D Mascot Logo.png`.

## Safety rules (always on)

Never auto-submit · human approval for irreversible steps · sensitive-site blocklist ·
locked vault values never leave the device (tokens only) · page text is data, not instructions ·
no CAPTCHA/OTP bypass.
