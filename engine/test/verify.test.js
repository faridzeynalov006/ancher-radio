import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, collapseRepeats, buildCorpus, verifyQuote, verifyEpisode } from '../verify.js';
import { captionsToText } from '../sourcetext.js';

// A real chunk from the saved YC Startup School transcript: auto-captions repeat every line.
const YC = "customer customer customer again fire the ones who seem like again fire the ones who seem like again fire the ones who seem like they're not good fit move on to the next they're not good fit move on to the next they're not good fit move on to the next customers customers customers free trials";

test('normalize flattens quotes, dashes, markdown and case', () => {
  assert.equal(normalize('It’s **“Great”** — `ease`'), 'it\'s "great" - ease');
});

test('collapseRepeats undoes auto-caption repetition', () => {
  assert.equal(
    collapseRepeats(normalize(YC)),
    "customer again fire the ones who seem like they're not good fit move on to the next customers free trials",
  );
});

test('a quote from a repeated caption track verifies after collapsing', () => {
  const corpus = buildCorpus({ yc: [YC] });
  const r = verifyQuote("fire the ones who seem like they're not good fit move on to the next customers", 'yc', corpus);
  assert.equal(r.ok, true);
});

test('a paraphrase is rejected', () => {
  const corpus = buildCorpus({ yc: [YC] });
  assert.equal(verifyQuote('fire the bad customers quickly and move on', 'yc', corpus).ok, false);
});

test('a quote joined with an ellipsis is rejected even if both halves exist', () => {
  const corpus = buildCorpus({ a: ['one two three four five six seven. eight nine ten eleven twelve'] });
  assert.equal(verifyQuote('one two three four ... ten eleven twelve', 'a', corpus).ok, false);
});

test('a quote found in a different note on the shelf is kept and re-attributed', () => {
  const corpus = buildCorpus({ a: ['nothing relevant here at all'], b: ['Snappy animations feel responsive and connected to user’s actions.'] });
  const r = verifyQuote("Snappy animations feel responsive and connected to user's actions.", 'a', corpus);
  assert.deepEqual(r, { ok: true, noteId: 'b', corrected: true });
});

test('verifyEpisode drops failing quotes but keeps host lines', () => {
  const corpus = buildCorpus({ n: ['The future is a place that you get to create.'] });
  const { episode, report } = verifyEpisode({
    title: 't',
    segments: [
      { type: 'host', text: 'Hello.' },
      { type: 'quote', noteId: 'n', text: 'a place that you get to create' },
      { type: 'quote', noteId: 'n', text: 'a place we will never reach' },
    ],
  }, corpus);
  assert.equal(episode.segments.length, 2);
  assert.equal(report.filter((r) => r.ok).length, 1);
});

test('captionsToText strips VTT timing, tags and repeated lines', () => {
  const vtt = `WEBVTT
Kind: captions
Language: en

00:00:10.219 --> 00:00:13.310 align:start position:0%
School<00:00:11.219><c> my</c><00:00:11.880><c> name</c>

00:00:13.310 --> 00:00:13.320 align:start position:0%
School my name

00:00:13.320 --> 00:00:15.000 align:start position:0%
is Gustav`;
  assert.equal(captionsToText(vtt), 'School my name is Gustav');
});
