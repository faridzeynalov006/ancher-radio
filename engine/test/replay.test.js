// End to end without a key: the engine replays recorded Ancher responses and builds an edition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildEdition } from '../build.js';
import { createReplaySource } from '../sources/replay.js';
import { loadConfig, DEMO_FIXTURES, ROOT } from '../config.js';

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `radio-${name}-`));
const quiet = () => {};

test('replay builds the demo edition and every recorded quote checks out against the trimmed sources', async () => {
  const out = tmp('edition');
  const edition = await buildEdition({ source: createReplaySource(DEMO_FIXTURES), config: loadConfig(), outDir: out, audio: false, log: quiet });
  assert.equal(edition.source, 'replay');
  assert.ok(edition.stations.length >= 2, 'has stations');
  for (const s of edition.stations.filter((s) => s.onAir)) {
    const ep = JSON.parse(fs.readFileSync(path.join(out, s.episode), 'utf8'));
    assert.equal(ep.checks.kept, ep.checks.quotes, `${s.slug}: all quotes verified`);
    assert.ok(ep.segments.some((x) => x.kind === 'quote' && x.source.title), `${s.slug}: quotes carry their source note`);
  }
  assert.ok(edition.crossover?.episode, 'has a crossover');
  // the demo set has no recorded bulletin: the engine skips it and still writes the edition
  assert.equal(edition.justSaved, null);
});

test('a misquote in Ancher\'s reply is caught and dropped', async () => {
  const dir = tmp('fixtures');
  fs.cpSync(DEMO_FIXTURES, dir, { recursive: true });
  const file = path.join(dir, 'asks', 'station-first-100-users.json');
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  rec.reply = rec.reply.replace("don't be afraid of letting customers go", "never be afraid to fire a customer");
  fs.writeFileSync(file, JSON.stringify(rec));
  const out = tmp('edition');
  await buildEdition({ source: createReplaySource(dir), config: loadConfig(), outDir: out, only: 'first-100-users', audio: false, log: quiet });
  const ep = JSON.parse(fs.readFileSync(path.join(out, 'episodes', 'station-first-100-users', 'episode.json'), 'utf8'));
  assert.equal(ep.checks.kept, ep.checks.quotes - 1);
  assert.ok(!ep.segments.some((s) => s.text.includes('fire a customer')));
});

test('without a key the engine changes nothing and explains how to go live', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'engine', 'build.js')], {
    env: { ...process.env, ANCHER_API_KEY: '' }, encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No ANCHER_API_KEY found, so nothing was changed/);
});
