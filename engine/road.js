#!/usr/bin/env node
// "Take it on the road": tonight's edition as one MP3 for the car.
//
//   npm run road                 writes exports/ancher-radio-<date>.mp3
//   options: --edition <dir>  --out <file>  --json
//
// The episodes play in dial order (each station, the crossover between its pair, "Just saved" last),
// joined by a few seconds of tuning static. Every episode is a chapter, so the car's skip button
// jumps to the next station. Uses only ffmpeg and the files already in the edition: no Ancher
// credits, no network.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, EDITION_DIR, DEMO_EDITION_DIR } from './config.js';

const STATIC_LEN = 2.2;    // seconds of static between stations
const STATIC_LUFS = -25;   // about 9 dB under the episodes (mastered to -16 LUFS), like the radio's dial
const SR = 44100;

// Same order as the dial in src/live.js: stations, the crossover between its pair, then Just Saved.
export function roadOrder(edition) {
  const out = [];
  const stations = edition.stations.filter((s) => s.onAir && s.episode);
  const pair = edition.crossover?.episode ? edition.crossover.between : null;
  stations.forEach((s, i) => {
    out.push({ kind: 'station', label: s.label, episode: s.episode });
    const next = stations[i + 1];
    if (pair && next && pair.includes(s.slug) && pair.includes(next.slug)) out.push({ kind: 'crossover', label: 'Crossover', episode: edition.crossover.episode });
  });
  // the pair may not sit side by side on the dial: then the crossover follows the second of the two
  if (pair && !out.some((c) => c.kind === 'crossover')) {
    const at = Math.max(...pair.map((slug) => out.findIndex((c) => c.episode === stations.find((s) => s.slug === slug)?.episode)));
    if (at >= 0) out.splice(at + 1, 0, { kind: 'crossover', label: 'Crossover', episode: edition.crossover.episode });
  }
  if (edition.justSaved?.episode) out.push({ kind: 'bulletin', label: 'Just Saved', episode: edition.justSaved.episode });
  return out;
}

const probe = (file) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return parseFloat(r.stdout);
};

const dayOf = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const meta = (v) => String(v).replace(/([=;#\\\n])/g, '\\$1');

export function exportRoad({ editionDir, outFile, log = console.log } = {}) {
  const dir = editionDir || [EDITION_DIR, DEMO_EDITION_DIR].find((d) => fs.existsSync(path.join(d, 'edition.json')));
  if (!dir) throw new Error('No edition to export yet. Build one first (npm run edition).');
  const edition = JSON.parse(fs.readFileSync(path.join(dir, 'edition.json'), 'utf8'));

  const items = roadOrder(edition).map((c) => {
    const ep = JSON.parse(fs.readFileSync(path.join(dir, c.episode), 'utf8'));
    const audio = ep.audio && path.join(dir, path.dirname(c.episode), ep.audio);
    return { ...c, title: ep.title || c.label, audio };
  }).filter((c) => c.audio && fs.existsSync(c.audio));
  if (!items.length) throw new Error('This edition has no voiced episodes to export.');

  const date = (edition.builtAt || new Date().toISOString()).slice(0, 10);
  const out = outFile || path.join(ROOT, 'exports', `ancher-radio-${date}.mp3`);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  // inputs: the static between stations (the recorded tuner noise if it's on disk, otherwise generated), then each episode
  const tuner = path.join(ROOT, 'audio', 'sfx', 'static-tuner.mp3');
  const click = path.join(ROOT, 'audio', 'sfx2', 'power-switch.mp3');
  const args = ['-v', 'error', '-y'];
  const filters = [], labels = [];
  let n = 0;
  const addStatic = (k, fadeIn, fadeOut) => {
    if (fs.existsSync(tuner)) args.push('-ss', String(6 + k * 9.5), '-t', String(STATIC_LEN), '-i', tuner);
    else args.push('-f', 'lavfi', '-t', String(STATIC_LEN), '-i', `anoisesrc=c=pink:a=0.25:r=${SR}`);
    filters.push(`[${n}:a]aresample=${SR},aformat=channel_layouts=mono,bandpass=f=1900:width_type=q:w=0.5,loudnorm=I=${STATIC_LUFS}:TP=-6,aresample=${SR},` +
      `afade=t=in:d=${fadeIn},afade=t=out:st=${STATIC_LEN - fadeOut}:d=${fadeOut}[a${n}]`);
    labels.push(`[a${n}]`); n++;
  };
  const addFile = (file, gain = 1) => {
    args.push('-i', file);
    filters.push(`[${n}:a]aresample=${SR},aformat=channel_layouts=mono,volume=${gain}[a${n}]`);
    labels.push(`[a${n}]`); n++;
  };

  // switch on, tune in, then station after station; the chapter starts on the static so "next" lands on the tuning
  const chapters = [];
  let t = 0;
  if (fs.existsSync(click)) { addFile(click, 0.5); t += probe(click); }
  items.forEach((item, k) => {
    const start = k === 0 ? 0 : t;
    addStatic(k, k === 0 ? 0.6 : 0.25, 0.5); t += STATIC_LEN;
    addFile(item.audio); t += probe(item.audio);
    chapters.push({ title: item.title, label: item.label, start, end: t });
  });
  addStatic(items.length, 0.25, 1.6); t += STATIC_LEN;
  chapters[chapters.length - 1].end = t;

  const metaFile = path.join(path.dirname(out), '.road-chapters.txt');
  const day = dayOf(edition.builtAt || Date.now());
  fs.writeFileSync(metaFile, [
    ';FFMETADATA1',
    `title=${meta(`Ancher Radio · ${day}`)}`,
    'artist=Ancher Radio', 'album_artist=Ancher Radio', `album=${meta('Ancher Radio')}`, 'genre=Podcast',
    `date=${date.slice(0, 4)}`,
    `comment=${meta(`Tonight's edition: ${items.map((i) => i.label).join(', ')}. Written by Ancher from your saves.`)}`,
    ...chapters.flatMap((c) => ['[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.start * 1000)}`, `END=${Math.round(c.end * 1000)}`, `title=${meta(c.title)}`]),
  ].join('\n'));

  const cover = path.join(ROOT, 'assets', 'road-cover.jpg');
  args.push('-i', metaFile);
  const metaIndex = n;
  if (fs.existsSync(cover)) args.push('-i', cover);
  args.push('-filter_complex', `${filters.join(';')};${labels.join('')}concat=n=${labels.length}:v=0:a=1,alimiter=limit=0.9:level=false[out]`,
    '-map', '[out]', '-map_metadata', String(metaIndex), '-map_chapters', String(metaIndex));
  if (fs.existsSync(cover)) args.push('-map', `${metaIndex + 1}:v`, '-c:v', 'copy', '-disposition:v', 'attached_pic', '-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)');
  args.push('-ar', String(SR), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k', '-id3v2_version', '3', out);

  log(`Stitching ${items.length} episodes (${(t / 60).toFixed(1)} min) into ${path.relative(ROOT, out)}…`);
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  fs.rmSync(metaFile, { force: true });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.trim().split('\n').slice(-3).join(' ')}`);
  for (const c of chapters) log(`  ${new Date(c.start * 1000).toISOString().slice(14, 19)}  ${c.title}`);
  return { file: out, duration: t, chapters, builtAt: edition.builtAt, size: fs.statSync(out).size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
  const json = args.includes('--json');
  try {
    const res = exportRoad({
      editionDir: option('edition') && path.resolve(option('edition')),
      outFile: option('out') && path.resolve(option('out')),
      log: json ? () => {} : console.log,
    });
    if (json) console.log(JSON.stringify({ ...res, file: path.relative(ROOT, res.file) }));
    else console.log(`\nReady: ${path.relative(ROOT, res.file)}. AirDrop it to your phone, or drag it into the Music app.`);
  } catch (e) {
    if (json) console.log(JSON.stringify({ error: e.message }));
    else console.error(e.message);
    process.exit(1);
  }
}
