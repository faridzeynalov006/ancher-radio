import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEpisode } from '../parse.js';
import { forEar, speakIdentifier } from '../speech.js';
import { planStations, dialLabel, pickCrossover, newestSave } from '../stations.js';

test('parseEpisode reads JSON wrapped in a chat preamble and a code fence', () => {
  const reply = 'Here is tonight\'s episode.\n\n```json\n{"title":"T","segments":[{"type":"host","text":"Hi."},{"type":"quote","noteId":"n1","speaker":"Ann","text":"Exact words."}]}\n```\nEnjoy.';
  const ep = parseEpisode(reply);
  assert.equal(ep.title, 'T');
  assert.deepEqual(ep.segments[1], { type: 'quote', text: 'Exact words.', noteId: 'n1', speaker: 'Ann' });
});

test('parseEpisode refuses a reply without host lines', () => {
  assert.throws(() => parseEpisode('{"segments":[{"type":"quote","text":"x"}]}'), /no host lines/);
  assert.throws(() => parseEpisode('I could not find anything.'), /No JSON/);
});

test('forEar makes code, units and symbols speakable', () => {
  assert.equal(speakIdentifier('requestAnimationFrame'), 'request animation frame');
  assert.equal(
    forEar('Keep it under 300ms with `ease-out`, grow 10% a week — they raised $400M.'),
    'Keep it under 300 milliseconds with ease out, grow 10 percent a week, they raised 400 million dollars.',
  );
  assert.equal(forEar('It uses requestAnimationFrame under the hood.'), 'It uses request animation frame under the hood.');
});

const config = { minNotes: 3, exclude: ['Radio'], excludePrefixes: ['[Sample]'], labels: { 'Personal Design and Motion': 'Design & Motion' } };
const ready = (id, created_at = '2026-09-20') => ({ id, status: 'ready', created_at, title: id });

test('planStations skips samples and the Radio archive, and marks thin shelves quiet', () => {
  const collections = [
    { id: 'a', name: 'Personal Design and Motion', color: 'amber' },
    { id: 'b', name: 'Handoffs', color: 'teal' },
    { id: 'c', name: '[Sample] Tokyo Trip Planning', color: 'blue' },
    { id: 'd', name: 'Radio', color: 'orange' },
  ];
  const stations = planStations(collections, { a: [ready('1'), ready('2'), ready('3')], b: [ready('4')] }, config);
  assert.deepEqual(stations.map((s) => [s.name, s.label, s.onAir]), [
    ['Personal Design and Motion', 'Design & Motion', true],
    ['Handoffs', 'Handoffs', false],
  ]);
});

test('dial labels fall back to a word-boundary cut', () => {
  assert.equal(dialLabel('Video Editing Market Research'), 'Video Editing');
  assert.equal(dialLabel('Short Name'), 'Short Name');
});

test('the crossover joins the two richest on-air stations; the bulletin takes the newest save', () => {
  const s = [
    { slug: 'x', name: 'X', onAir: true, notes: [ready('1', '2026-09-01')] },
    { slug: 'y', name: 'Y', onAir: true, notes: [ready('2', '2026-10-02')] },
    { slug: 'z', name: 'Z', onAir: false, notes: [] },
  ];
  assert.deepEqual(pickCrossover(s).map((t) => t.slug), ['x', 'y']);
  assert.equal(newestSave(s).note.id, '2');
});
