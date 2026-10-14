#!/usr/bin/env node
// Builds tonight's edition of Ancher Radio.
//
//   npm run edition                    live: needs ANCHER_API_KEY (in .env or the environment)
//   npm run edition -- --record        live, and saves every Ancher response to engine/fixtures
//   npm run edition:replay             replays the recorded responses: no key, no network
//   npm run edition:demo               rebuilds the public demo edition from engine/demo
//   npm run edition -- --check         counts saves added since this edition (free: reads the library only)
//   options: --only <station-slug>  --no-audio  --out <dir>  --voice host|ancher  --progress
//
// A build writes into edition.next/ and swaps it in only when it's finished, so the radio keeps
// playing the old edition meanwhile and a failed build leaves it untouched.
//
// Nothing here runs on a schedule. It runs when someone types the command.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { ROOT, EDITION_DIR, DEMO_EDITION_DIR, DEMO_FIXTURES, loadConfig } from './config.js';
import { planStations, pickCrossover, newestSave, isStation } from './stations.js';
import { stationBrief, crossoverBrief, bulletinBrief } from './brief.js';
import { parseEpisode } from './parse.js';
import { buildCorpus, verifyEpisode } from './verify.js';
import { forEar } from './speech.js';
import { createReplaySource } from './sources/replay.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

export async function buildEdition({ source, config, outDir = EDITION_DIR, only = null, audio = true, voice = config.voice, log = console.log, progress = () => {} }) {
  const started = Date.now();
  const previous = readJson(path.join(outDir, 'edition.json'));
  const lastBuilt = previous?.builtAt || null;

  log(`Ancher Radio: building an edition from ${source.kind === 'live' ? 'your live Ancher library' : 'recorded Ancher responses'}`);
  progress({ stage: 'reading' });
  const collections = await source.listCollections();
  const notesBy = {};
  for (const c of collections.filter((c) => isStation(c, config))) notesBy[c.id] = await source.listCollectionNotes(c.id);
  const stations = planStations(collections, notesBy, config);
  log(`  ${stations.length} stations: ${stations.map((s) => `${s.label} (${s.noteCount}${s.onAir ? '' : ', quiet'})`).join(', ')}`);

  const sourcesCache = new Map();
  const corpusFor = async (notes) => {
    const texts = {};
    for (const n of notes) {
      if (!sourcesCache.has(n.id)) sourcesCache.set(n.id, await source.noteSources(n));
      texts[n.id] = sourcesCache.get(n.id);
    }
    return buildCorpus(texts);
  };
  const noteIndex = new Map(stations.flatMap((s) => s.notes.map((n) => [n.id, { ...n, station: s.name }])));

  const jobs = [];
  for (const s of stations.filter((s) => s.onAir && (!only || s.slug === only))) {
    const newSince = lastBuilt ? s.notes.filter((n) => String(n.created_at) > lastBuilt) : [];
    jobs.push({ key: `station-${s.slug}`, kind: 'station', station: s.slug, prompt: stationBrief(s, { newSince }), notes: s.notes });
  }
  const pair = !only && pickCrossover(stations, config.crossover);
  if (pair) jobs.push({ key: `crossover-${pair[0].slug}-${pair[1].slug}`, kind: 'crossover', between: [pair[0].slug, pair[1].slug], prompt: crossoverBrief(pair[0], pair[1]), notes: [...pair[0].notes, ...pair[1].notes] });
  const newest = !only && newestSave(stations);
  if (newest) {
    const elsewhere = stations.filter((s) => s !== newest.station && s.onAir).flatMap((s) => s.notes);
    const lonely = newest.station.notes.length < 2;
    jobs.push({
      key: 'bulletin', kind: 'bulletin', station: newest.station.slug, noteId: newest.note.id,
      prompt: bulletinBrief(newest.note, newest.station, lonely ? elsewhere : []),
      notes: lonely ? [newest.note, ...elsewhere] : newest.station.notes,
    });
  }

  const labelOf = (slug) => stations.find((s) => s.slug === slug)?.label || slug;
  for (const job of jobs) job.label = job.kind === 'crossover' ? job.between.map(labelOf).join(' × ') : job.kind === 'bulletin' ? 'Just Saved' : labelOf(job.station);
  progress({ stage: 'planned', jobs: jobs.map(({ key, label }) => ({ key, label })) });

  const episodes = {};
  for (const [i, job] of jobs.entries()) {
    log(`\n${job.key}`);
    const step = { key: job.key, label: job.label, i: i + 1, n: jobs.length };
    progress({ stage: 'writing', ...step });
    let reply, parsed;
    try {
      reply = await source.ask(job.key, job.prompt);
      parsed = parseEpisode(reply);
    } catch (e) {
      // one bad station shouldn't sink the edition: keep its previous episode and move on
      log(`  skipped: ${e.message}`);
      progress({ stage: 'skipped', ...step, reason: e.message });
      continue;
    }
    const { episode, report } = verifyEpisode(parsed, await corpusFor(job.notes));
    for (const r of report) log(`  ${r.ok ? (r.corrected ? '~' : '✓') : '✗'} "${r.text.slice(0, 70)}${r.text.length > 70 ? '…' : ''}"${r.ok ? (r.corrected ? ' (found in a different note)' : '') : ` dropped: ${r.reason}`}`);
    const dir = path.join(outDir, 'episodes', job.key);
    fs.mkdirSync(dir, { recursive: true });
    progress({ stage: 'voicing', ...step, lines: episode.segments.length, kept: report.filter((r) => r.ok).length, quotes: report.length });
    const ep = await produceEpisode({ job, episode, report, dir, config, noteIndex, audio, voice, source, log });
    fs.writeFileSync(path.join(dir, 'episode.json'), JSON.stringify(ep, null, 2));
    episodes[job.key] = `episodes/${job.key}/episode.json`;
  }

  const edition = {
    version: 1,
    builtAt: new Date().toISOString(),
    source: source.kind,
    voice,
    stations: stations.map((s) => ({
      id: s.id, slug: s.slug, name: s.name, label: s.label, color: s.color, noteCount: s.noteCount, onAir: s.onAir,
      episode: episodes[`station-${s.slug}`] || (previous?.stations?.find((p) => p.slug === s.slug)?.episode ?? null),
    })),
    crossover: pair && episodes[`crossover-${pair[0].slug}-${pair[1].slug}`]
      ? { between: [pair[0].slug, pair[1].slug], episode: episodes[`crossover-${pair[0].slug}-${pair[1].slug}`] }
      : previous?.crossover ?? null,
    justSaved: newest && episodes.bulletin
      ? { noteId: newest.note.id, station: newest.station.slug, title: newest.note.title, episode: episodes.bulletin }
      : previous?.justSaved ?? null,
  };
  fs.writeFileSync(path.join(outDir, 'edition.json'), JSON.stringify(edition, null, 2));
  log(`\nEdition written to ${path.relative(ROOT, outDir).replace(/\.next$/, '') || '.'}/edition.json in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  progress({ stage: 'built', builtAt: edition.builtAt, episodes: Object.keys(episodes).length });
  return edition;
}

async function produceEpisode({ job, episode, report, dir, config, noteIndex, audio, voice, source, log }) {
  const quoteVoices = config.voices.quotes;
  const speakers = new Map();
  const segments = episode.segments.map((seg, i) => {
    const id = `s${String(i + 1).padStart(2, '0')}`;
    if (seg.type === 'host') {
      return { id, kind: 'host', text: seg.text, speak: forEar(seg.text), voice: config.voices.host.voice, speed: config.voices.host.speed };
    }
    const who = seg.speaker || noteIndex.get(seg.noteId)?.author || 'quote';
    if (!speakers.has(who)) speakers.set(who, quoteVoices[speakers.size % quoteVoices.length]);
    const n = noteIndex.get(seg.noteId) || {};
    return {
      id, kind: 'quote', text: seg.text, speak: forEar(seg.text), voice: speakers.get(who), speed: 0.95,
      speaker: who,
      source: { noteId: seg.noteId, title: n.title || '', author: n.author || '', site: n.site_name || domainOf(n.url), url: n.url || '', savedAt: n.created_at || null, collection: n.station || '' },
    };
  });

  const ep = {
    key: job.key, kind: job.kind, title: episode.title,
    ...(job.station ? { station: job.station } : {}), ...(job.between ? { between: job.between } : {}),
    voice, audio: null, duration: null,
    checks: { quotes: report.length, kept: report.filter((r) => r.ok).length },
    segments: segments.map(({ speak, speed, ...rest }) => rest),
  };
  if (!audio) return ep;

  if (voice === 'ancher') {
    if (!source.ancherPodcast) throw new Error('The Ancher voice needs a live connection (an API key)');
    log('  asking Ancher to voice it (podcast engine)…');
    const text = segments.map((s) => (s.kind === 'quote' ? `${s.speaker}: "${s.text}"` : s.text)).join('\n\n');
    const pod = await source.ancherPodcast(episode.title || job.key, text, dir);
    return {
      ...ep, audio: 'episode.mp3', duration: pod.duration, ancher: { noteId: pod.noteId, podcastId: pod.podcastId },
      // the podcast engine rewrites the script into its own dialogue, so its transcript drives the subtitles
      segments: pod.transcript.map((t, i) => ({ id: `p${i + 1}`, kind: 'host', text: t.text, start: t.start, end: t.end, voice: t.role })),
    };
  }

  // re-voice only when the script changed since the last edition
  const scriptHash = crypto.createHash('sha1').update(JSON.stringify(segments.map(({ speak, voice, kind }) => [speak, voice, kind]))).digest('hex').slice(0, 12);
  const prev = readJson(path.join(dir, 'episode.json'));
  if (prev?.scriptHash === scriptHash && fs.existsSync(path.join(dir, 'episode.mp3'))) {
    log('  voice unchanged, reusing the recorded audio');
    const at = new Map(prev.segments.map((x) => [x.id, { start: x.start, end: x.end }]));
    return { ...ep, scriptHash, audio: 'episode.mp3', duration: prev.duration, segments: ep.segments.map((x) => ({ ...x, ...at.get(x.id) })) };
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'radio-'));
  const scriptPath = path.join(tmp, 'script.json');
  const bed = path.join(ROOT, 'audio', 'sfx2', 'bigband-bed.mp3');
  fs.writeFileSync(scriptPath, JSON.stringify({ model: config.kokoroModel, voices: config.kokoroVoices, bed: fs.existsSync(bed) ? bed : null, segments }));
  const r = spawnSync(config.python, [path.join(ROOT, 'audio', 'render_episode.py'), scriptPath, dir], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`Voicing failed for ${job.key}. Check TTS_PYTHON and the Kokoro model paths (see README).`);
  const timing = JSON.parse(fs.readFileSync(path.join(dir, 'timing.json'), 'utf8'));
  fs.rmSync(path.join(dir, 'timing.json'));
  const at = new Map(timing.segments.map((t) => [t.id, t]));
  return { ...ep, scriptHash, audio: 'episode.mp3', duration: timing.duration, segments: ep.segments.map((s) => ({ ...s, ...at.get(s.id) })) };
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Builds into <dir>.next (a copy of the current edition, so unchanged episodes keep their audio)
// and swaps it in only once the whole edition is done.
export async function buildStaged(outDir, build) {
  const next = `${outDir}.next`, old = `${outDir}.old`;
  fs.rmSync(next, { recursive: true, force: true });
  if (fs.existsSync(outDir)) fs.cpSync(outDir, next, { recursive: true });
  try {
    const edition = await build(next);
    fs.rmSync(old, { recursive: true, force: true });
    if (fs.existsSync(outDir)) fs.renameSync(outDir, old);
    fs.renameSync(next, outDir);
    fs.rmSync(old, { recursive: true, force: true });
    return edition;
  } catch (e) {
    fs.rmSync(next, { recursive: true, force: true });
    throw e;
  }
}

// How many ready notes on your stations were saved after this edition was built. Reads the library only (free).
export async function newSavesSince({ source, config, outDir = EDITION_DIR }) {
  const edition = readJson(path.join(outDir, 'edition.json'));
  const since = edition?.builtAt ? Date.parse(edition.builtAt) : 0;
  const collections = await source.listCollections();
  const fresh = new Map();
  for (const c of collections.filter((c) => isStation(c, config))) {
    for (const n of await source.listCollectionNotes(c.id)) {
      if (n.status === 'ready' && Date.parse(n.created_at) > since) fresh.set(n.id, n.title || 'Untitled');
    }
  }
  return { builtAt: edition?.builtAt || null, newSince: fresh.size, titles: [...fresh.values()].slice(0, 5) };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

async function main() {
  const config = loadConfig();
  const replay = flag('replay') || flag('demo');
  let source;
  if (flag('demo')) {
    source = createReplaySource(DEMO_FIXTURES);
  } else if (replay) {
    source = createReplaySource();
  } else if (config.apiKey) {
    const { createLiveSource } = await import('./sources/live.js');
    source = createLiveSource({ apiKey: config.apiKey, baseUrl: config.baseUrl, record: flag('record') });
  } else if (flag('check')) {
    console.log(JSON.stringify({ error: 'no-key' }));
    return;
  } else {
    console.log(`No ANCHER_API_KEY found, so nothing was changed.
The radio keeps playing the saved edition in edition/.

To build a fresh edition from your live library:
  1. Create an API key in your Ancher settings.
  2. Put it in a file called .env in this folder:  ANCHER_API_KEY=your-key
  3. Run:  npm run edition

To rebuild from the recorded responses instead (no key needed):  npm run edition:replay`);
    return;
  }
  if (flag('check')) {
    console.log(JSON.stringify(await newSavesSince({ source, config })));
    return;
  }
  // --progress: one machine-readable line per step, for the radio's "New edition" button (serve.py)
  const progress = flag('progress') ? (e) => console.log(`@@progress ${JSON.stringify(e)}`) : undefined;
  const outDir = option('out') ? path.resolve(option('out')) : flag('demo') ? DEMO_EDITION_DIR : EDITION_DIR;
  await buildStaged(outDir, (dir) => buildEdition({
    source, config, outDir: dir, progress,
    only: option('only'),
    audio: !flag('no-audio'),
    voice: option('voice') || config.voice,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(`\n${e.message}`); process.exit(1); });
}
