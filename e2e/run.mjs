#!/usr/bin/env node
/**
 * DIGGY e2e runner — drives the real built extension in Chromium and the real
 * product gates in Node.
 *
 *   pnpm --filter @diggy/e2e test          # every test
 *   pnpm --filter @diggy/e2e test -- --test=confirm-gate
 *   pnpm --filter @diggy/e2e test -- --gates   # only the Node gate tests (no browser)
 *   pnpm --filter @diggy/e2e test:headed   # watch it happen
 *   pnpm --filter @diggy/e2e list
 *
 * Tests declare `kind: 'browser' | 'node'`. Browser tests skip cleanly (never
 * fail) when the extension is not built or no Chromium channel can load it.
 *
 * Run under `tsx` so the Node gate tests can import the TypeScript product
 * packages (`@diggy/policy`, `@diggy/forms`, `@diggy/monitor`, `@diggy/page-agent`).
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEnv, SkipError } from './harness.mjs';

const TESTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tests');

function parseArgs(argv) {
  const options = { headed: false, list: false, gates: false, verbose: false, selected: [] };
  for (const arg of argv) {
    if (arg === '--headed') options.headed = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--gates') options.gates = true;
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--test=')) {
      options.selected.push(
        ...arg
          .slice('--test='.length)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
  }
  return options;
}

async function loadTests() {
  const files = (await readdir(TESTS_DIR)).filter((f) => f.endsWith('.mjs')).sort();
  const tests = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(TESTS_DIR, file)).href);
    if (typeof mod.run !== 'function') continue;
    tests.push({
      name: mod.name ?? file.replace(/\.mjs$/, ''),
      description: mod.description ?? '',
      kind: mod.kind === 'node' ? 'node' : 'browser',
      run: mod.run,
    });
  }
  return tests;
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log('Usage: tsx run.mjs [--test=<name>[,<name>]] [--gates] [--headed] [--list] [--verbose]');
    return 0;
  }

  const tests = await loadTests();
  if (options.list) {
    console.log('DIGGY e2e tests:');
    for (const test of tests) {
      console.log(`  [${test.kind}] ${pad(test.name, 24)} ${test.description}`);
    }
    return 0;
  }

  let selected = options.selected.length
    ? tests.filter((test) => options.selected.includes(test.name))
    : options.gates
      ? tests.filter((test) => test.kind === 'node')
      : tests;
  if (selected.length === 0) {
    console.error(`No tests matched: ${options.selected.join(', ') || '(gates)'}`);
    return 1;
  }

  console.log('DIGGY e2e — real extension + product gates');
  const env = await createEnv({ headed: options.headed });
  console.log(`  extension build : ${env.built ? 'present (apps/extension/.output/chrome-mv3)' : 'MISSING'}`);
  console.log(`  playwright-core : ${env.playwright ? 'resolved' : 'MISSING'}`);
  console.log(`  fixtures        : ${env.fixtures.baseUrl}`);
  console.log('');

  const rows = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  try {
    for (const test of selected) {
      const started = Date.now();
      try {
        const detail = await test.run(env);
        const ms = Date.now() - started;
        passed += 1;
        rows.push({ status: 'PASS', name: test.name, detail: detail ?? '', ms });
        console.log(`  PASS  ${test.name}  (${ms}ms) — ${detail ?? ''}`);
      } catch (error) {
        const ms = Date.now() - started;
        if (error instanceof SkipError || error?.skip) {
          skipped += 1;
          rows.push({ status: 'SKIP', name: test.name, detail: error.message, ms });
          console.log(`  SKIP  ${test.name} — ${error.message}`);
        } else {
          failed += 1;
          const message = error?.message ?? String(error);
          rows.push({ status: 'FAIL', name: test.name, detail: message, ms });
          console.log(`  FAIL  ${test.name}  (${ms}ms) — ${message}`);
          if (options.verbose) console.log(error?.stack ?? '');
        }
      }
    }
  } finally {
    await env.dispose();
  }

  const width = Math.max(6, ...rows.map((row) => row.name.length));
  console.log('\n' + pad('RESULT', 6) + '  ' + pad('TEST', width) + '  DETAIL');
  for (const row of rows) {
    console.log(`${pad(row.status, 6)}  ${pad(row.name, width)}  ${row.detail}`);
  }
  console.log('');
  console.log(`${rows.length} test(s) · ${passed} passed · ${skipped} skipped · ${failed} failed`);
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error('e2e runner crashed:', error?.stack ?? String(error));
    process.exit(1);
  },
);
