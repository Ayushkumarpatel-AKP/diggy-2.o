# w6-settings — dual API keys, web search, connection tests

Read `agents/wave6/README.md` and `agents/wave5/README.md` first.

## Target

`apps/extension/entrypoints/settings/main.tsx` — **this one file only**.

Read `apps/extension/src/provider-settings.ts` in full first: it already exports
`PROVIDER_PRESETS`, `settingsFromPreset`, `normalizeSettings`, `settingsReady`, `originPattern`,
`FALLBACK_KEY`, and `readFallback`. Build on those; add nothing to that file (the coordinator
owns it).

## Change

The page currently has one "Model source" card. Restructure it into three cards.

**1. Model source — primary.** Exactly what is there today: preset `<select>`, API key, base
URL, chat model, STT model, language. Keep the existing `<style>`/`card`/`Field`/`save()` idiom.

**2. Fallback model (new).** A second, independent block:
- its own provider `<select>` (same `PROVIDER_PRESETS`), API key, base URL, model
- persisted to `browser.storage.local` under **`diggy:providers:fallback`** as
  `{ presetId, apiKey, baseUrl, model }`
- an enable/disable toggle; when off, remove the key from storage
- one line of plain-language help: this is used automatically when the primary is rate-limited,
  out of quota or down, which is what makes DIGGY keep working on the free tiers
- a **Test** button per provider that makes one tiny real request
  (`GET {baseUrl}/models` with the key, or a 1-token chat) and shows ✓/✗ with the message.
  Never log or display the key.

**3. Web search (new).** Persisted under **`diggy:search`** as `{ tavilyKey: string; preferLocal: boolean }`:
- a Tavily API key field (password input, same style as the provider key)
- a `preferLocal` checkbox: "Prefer my local crawler (127.0.0.1:17322) over the hosted API"
- one line of help naming the fallback order: Tavily → local crawler → keyless Tavily
- a **Test search** button that runs one real Tavily `/search` and reports how many results came
  back. Reference for the request shape: `POST https://api.tavily.com/search` with
  `Authorization: Bearer <key>` and JSON body `{ query, max_results, search_depth: "basic" }`,
  optionally `include_answer: true`.

Keep the existing "Google & Apps" card from wave 5 untouched.

## Constraints

- **Do not print, log or render an API key anywhere** other than the password input's value.
- `permissions.request` for a newly typed base URL stays best-effort, exactly as today.
- Wrap every network test in try/catch with a readable failure — a bad key must not break the page.
- No new dependency. React 18 + the page's existing inline styles.
- Additive: keep every field that exists today.

## Observable acceptance

Run and report the exact output of:

```
$env:NODE_ENV="production"; pnpm --filter @diggy/extension build
pnpm --filter @diggy/extension typecheck
```

Then confirm in the built `settings.html` (or by loading the extension with the e2e harness) that
all three cards render. State the exact storage keys and value shapes you write.
