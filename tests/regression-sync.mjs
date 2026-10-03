#!/usr/bin/env node
// Synchronization tests use an isolated checkout, never live source files.
import { existsSync, readFileSync, writeFileSync, cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UPSTREAM = process.env.STEPS2GREAT_UPSTREAM || 'E:/StepsToGreat';
if (!existsSync(UPSTREAM)) {
  console.log(`Skip upstream mirror comparison: ${UPSTREAM} unavailable; project tests still verify bundled assets.`);
  process.exit(0);
}
const temp = mkdtempSync(join(tmpdir(), 's2g-sync-'));
const run = (file, args = [], code = 0) => {
  const result = spawnSync(process.execPath, [join(temp, file), ...args], { cwd: temp, encoding: 'utf8' });
  assert.equal(result.status, code, result.stdout + result.stderr);
  return result.stdout + result.stderr;
};
try {
  cpSync(join(ROOT, '_build'), join(temp, '_build'), { recursive: true });
  cpSync(join(ROOT, 'scripts'), join(temp, 'scripts'), { recursive: true });
  mkdirSync(join(temp, 'tests'));
  cpSync(join(ROOT, 'tests/regression-state.mjs'), join(temp, 'tests/regression-state.mjs'));
  const sync = (args = [], code = 0) => run('_build/sync-from-upstream.mjs', ['--from', UPSTREAM, ...args], code);
  sync();
  sync(['--check']);
  console.log('PASS: upstream sync and complete mirror comparison');
  const validator = readFileSync(join(temp, 'scripts/validate-state.mjs'), 'utf8');
  run('scripts/validate-state.mjs', ['--fixtures', join(UPSTREAM, 'tests/fixtures')]);
  run('tests/regression-state.mjs');
  console.log('PASS: synchronized validator satisfies both state regression suites');
  for (const rel of ['scripts/materials.mjs', 'scripts/validate-state.mjs', 'assets/project/协议/06_小目标进度.md']) {
    const file = join(temp, rel);
    const original = readFileSync(file, 'utf8');
    const stale = original + '\n// deliberately stale\n';
    writeFileSync(file, stale);
    assert.ok(sync(['--check'], 1).includes(rel.replace(/^assets\/project\//, '')), rel);
    assert.equal(readFileSync(file, 'utf8'), stale, '--check must not write');
    sync();
    assert.equal(readFileSync(file, 'utf8'), original);
  }
  assert.equal(readFileSync(join(temp, 'scripts/validate-state.mjs'), 'utf8'), validator);
  sync(['--check']);
  console.log('PASS: drift detection, read-only checking and repair for tools and project assets');
} finally {
  assert.equal(dirname(resolve(temp)), resolve(tmpdir()));
  assert.ok(basename(temp).startsWith('s2g-sync-'));
  rmSync(temp, { recursive: true, force: true });
}
