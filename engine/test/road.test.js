// The car export's running order, and the staged build that protects the playing edition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { roadOrder } from '../road.js';
import { buildStaged } from '../build.js';

const edition = {
  stations: [
    { slug: 'a', label: 'A', onAir: true, episode: 'episodes/station-a/episode.json' },
    { slug: 'b', label: 'B', onAir: true, episode: 'episodes/station-b/episode.json' },
    { slug: 'q', label: 'Quiet', onAir: false, episode: null },
    { slug: 'c', label: 'C', onAir: true, episode: 'episodes/station-c/episode.json' },
  ],
  crossover: { between: ['a', 'b'], episode: 'episodes/crossover-a-b/episode.json' },
  justSaved: { episode: 'episodes/bulletin/episode.json' },
};

test('road order follows the dial: the crossover between its pair, quiet stations skipped, Just Saved last', () => {
  assert.deepEqual(roadOrder(edition).map((c) => c.label), ['A', 'Crossover', 'B', 'C', 'Just Saved']);
});

test('a crossover between stations that are not neighbours follows the second of the two', () => {
  const ed = { ...edition, crossover: { between: ['a', 'c'], episode: 'x.json' } };
  assert.deepEqual(roadOrder(ed).map((c) => c.label), ['A', 'B', 'C', 'Crossover', 'Just Saved']);
});

test('a staged build swaps in only when it succeeds', async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'radio-test-')), 'edition');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'edition.json'), 'old');

  await assert.rejects(buildStaged(dir, async (next) => {
    assert.equal(fs.readFileSync(path.join(next, 'edition.json'), 'utf8'), 'old'); // starts from a copy
    fs.writeFileSync(path.join(next, 'edition.json'), 'half-built');
    throw new Error('network blip');
  }));
  assert.equal(fs.readFileSync(path.join(dir, 'edition.json'), 'utf8'), 'old');
  assert.ok(!fs.existsSync(`${dir}.next`));

  await buildStaged(dir, async (next) => fs.writeFileSync(path.join(next, 'edition.json'), 'new'));
  assert.equal(fs.readFileSync(path.join(dir, 'edition.json'), 'utf8'), 'new');
  assert.ok(!fs.existsSync(`${dir}.next`) && !fs.existsSync(`${dir}.old`));
});
