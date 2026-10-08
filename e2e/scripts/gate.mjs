#!/usr/bin/env node
/**
 * DIGGY gate runner — the per-phase gates from `agents/PLAN.md`, runnable locally
 * and by CI. Mirrors the local commands exactly.
 *
 *   node e2e/scripts/gate.mjs          # every phase (0..4)
 *   node e2e/scripts/gate.mjs 2        # a single phase
 *   node e2e/scripts/gate.mjs --list   # show the phases and their checks
 *
 * Every phase ends with the core gate `typecheck → test → build`, plus the checks
 * that phase specifically adds. `NODE_ENV=development` is forced (this machine
 * exports `production`, which makes pnpm skip devDependencies).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const CORE = [
  ['pnpm', ['-w', 'typecheck']],
  ['pnpm', ['-w', 'test']],
  ['pnpm', ['-w', 'build']],
];

/** Phase id → { title, checks }. `checks` are [command, args] run from repo root. */
export const PHASES = {
  0: {
    title: 'Contracts — @diggy/shared builds and its tests pass',
    checks: [['pnpm', ['--filter', '@diggy/shared', 'typecheck']], ['pnpm', ['--filter', '@diggy/shared', 'test']]],
  },
  1: {
    title: 'Foundation — extension builds and its pages render',
    checks: [
      ['pnpm', ['--filter', '@diggy/extension', 'build']],
      ['pnpm', ['--filter', '@diggy/e2e', 'test', '--', '--test=extension-loads,sidepanel-renders,overlay-settings-render']],
    ],
  },
  2: {
    title: 'Monitor + Act — the safety gates and the monitor engine',
    checks: [['pnpm', ['--filter', '@diggy/e2e', 'test:gates']]],
  },
  3: {
    title: 'Integrations — the agent evals still score green',
    checks: [['pnpm', ['--filter', '@diggy/evals', 'test']]],
  },
  4: {
    title: 'Harden — full e2e + evals + the core gate',
    checks: [
      ['pnpm', ['--filter', '@diggy/extension', 'build']],
      ['pnpm', ['--filter', '@diggy/e2e', 'test']],
      ['pnpm', ['--filter', '@diggy/evals', 'test']],
    ],
  },
};

function run(command, args) {
  const printable = [command, ...args].join(' ');
  console.log(`\n$ ${printable}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' },
  });
  return result.status === 0;
}

function gate(phase) {
  const { title, checks } = phase;
  console.log(`\n=== Core gate: pnpm -w typecheck && pnpm -w test && pnpm -w build ===`);
  for (const [command, args] of CORE) {
    if (!run(command, args)) return false;
  }
  console.log(`\n=== Phase checks: ${title} ===`);
  for (const [command, args] of checks) {
    if (!run(command, args)) return false;
  }
  return true;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const [id, phase] of Object.entries(PHASES)) {
      console.log(`phase ${id}: ${phase.title}`);
      for (const [command, cmdArgs] of phase.checks) console.log(`   - ${[command, ...cmdArgs].join(' ')}`);
    }
    return 0;
  }

  const requested = args.find((arg) => /^\d$/.test(arg));
  const ids = requested !== undefined ? [requested] : Object.keys(PHASES);
  const results = [];
  for (const id of ids) {
    const phase = PHASES[id];
    if (!phase) {
      console.error(`Unknown phase "${id}" (expected 0..4)`);
      return 2;
    }
    const ok = gate(phase);
    results.push({ id, title: phase.title, ok });
    if (!ok) break;
  }

  console.log('\n=== Gate summary ===');
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  phase ${result.id}  ${result.title}`);
  return results.every((result) => result.ok) ? 0 : 1;
}

process.exit(main());
