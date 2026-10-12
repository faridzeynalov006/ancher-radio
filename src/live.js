// Live mode: plays tonight's edition. The radio reads edition/edition.json (written by the engine)
// and nothing else, so a snapshot edition and a freshly built live one play the same way.
import * as THREE from 'three';
import { createPlayer } from './player.js';
import { createCards } from './cards.js';

const REST = -122;     // needle angle when the radio is off
const SWEEP = 112;     // stations spread across ±SWEEP degrees
const HISS = 0.025;    // faint static under a station
const BETWEEN = 0.3;   // static while the needle travels

// Plays your own edition if there is one, otherwise the demo that ships with the repo.
export async function loadEdition(bases = ['edition/', 'demo-edition/']) {
  let res = null, base = null;
  for (const b of bases) {
    res = await fetch(`${b}edition.json`, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) { base = b; break; }
  }
  if (!base) return null;
  const edition = await res.json();
  const episodes = {};
  const keys = [
    ...edition.stations.map((s) => s.episode),
    edition.crossover?.episode, edition.justSaved?.episode,
  ].filter(Boolean);
  await Promise.all(keys.map(async (k) => {
    const r = await fetch(base + k, { cache: 'no-store' }).catch(() => null);
    if (r?.ok) {
      const ep = await r.json();
      const dir = k.slice(0, k.lastIndexOf('/') + 1);
      episodes[k] = { ...ep, url: ep.audio ? base + dir + ep.audio : null };
    }
  }));
  return { ...edition, episodes, demo: base.startsWith('demo') };
}

// Dial layout: every station, then "Just saved", spread evenly; the crossover sits between its pair.
export function buildChannels(edition) {
  const items = edition.stations.map((s) => ({ kind: 'station', station: s, label: s.label, color: s.color, episodeKey: s.onAir ? s.episode : null }));
  if (edition.justSaved?.episode) items.push({ kind: 'bulletin', label: 'Just Saved', color: '#EB7514', episodeKey: edition.justSaved.episode });
  const n = items.length;
  items.forEach((c, i) => { c.angle = n === 1 ? 0 : -SWEEP + (2 * SWEEP * i) / (n - 1); });
  const pair = edition.crossover?.episode ? edition.crossover.between : null;
  const channels = [];
  items.forEach((c, i) => {
    channels.push(c);
    const next = items[i + 1];
    if (pair && next && c.kind === 'station' && next.kind === 'station' && pair.includes(c.station.slug) && pair.includes(next.station.slug)) {
      channels.push({ kind: 'crossover', label: 'Crossover', a: c, b: next, color: '#EB7514', angle: (c.angle + next.angle) / 2, episodeKey: edition.crossover.episode });
    }
  });
  return { channels, markers: items };
}

const fmtSaved = (d) => {
  const t = new Date(d);
  return isNaN(t) ? 'Saved' : `Saved ${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
};

export function createLive({ radio, needle, setPower, frameShot, SHOTS, ui }) {
  const player = createPlayer();
  const cards = createCards(radio);
  let edition = null, channels = [], markers = [];
  let on = false, index = 0, tuneToken = 0, arrived = false, autoCam = true, captionsOn = true;
  let lastShot = null, threadT = 0, dialKey = '';
  const saved = new Map(); // channel index -> resume position
  const liveCards = new Map(); // segment id -> card

  const channel = () => channels[index];
  const episode = () => (channel()?.episodeKey ? edition.episodes[channel().episodeKey] : null);

  function drawDial() {
    const c = channel();
    const lit = (m) => {
      if (!on || !c) return 0;
      if (c === m) return arrived ? 1 : 0.5;
      if (c.kind === 'crossover' && (c.a === m || c.b === m)) return 0.6;
      return 0;
    };
    const thread = on && c?.kind === 'crossover' ? { a: c.a.label, b: c.b.label, progress: threadT } : null;
    const key = markers.map((m) => lit(m).toFixed(2)).join() + (thread ? thread.progress.toFixed(2) : '');
    if (key === dialKey) return;
    dialKey = key;
    radio.liveDial.draw({ stations: markers.map((m) => ({ name: m.label, angle: m.angle, color: m.color, alpha: 1, lit: lit(m) })), thread });
  }

  function clearCards() {
    for (const card of liveCards.values()) { card.group.visible = false; radio.body.remove(card.group); card.mat.map.dispose(); }
    liveCards.clear();
  }

  function showNowPlaying() {
    const c = channel(), ep = episode();
    ui.station(on ? (c?.kind === 'station' ? c.station.name : c?.label) || '' : 'Off');
    ui.title(on && arrived ? ep?.title || (c?.kind === 'station' && !c.station.onAir ? quietLine(c.station) : '') : '');
  }

  const quietLine = (s) => `Quiet tonight: ${s.noteCount} ${s.noteCount === 1 ? 'note' : 'notes'} on this shelf, not enough for a show yet.`;

  async function tune(i, { first = false } = {}) {
    if (!on || !channels.length) return;
    const prev = player.stop();
    if (prev && !first) saved.set(index, prev.position);
    const token = ++tuneToken;
    index = (i + channels.length) % channels.length;
    arrived = false; threadT = 0;
    clearCards(); ui.caption(null);
    player.setProgram(0, 0.15);
    player.setStatic(BETWEEN, 0.2);
    if (!first) player.play('ratchet', 0.35);
    const dur = needle.go(channel().angle);
    showNowPlaying();
    const ep = episode();
    if (ep?.url) player.preload(ep.url);
    await new Promise((r) => setTimeout(r, dur * 1000 + 120));
    if (token !== tuneToken || !on) return;
    arrived = true;
    showNowPlaying();
    if (!ep?.url) { player.setStatic(0.1, 0.6); return; }
    const from = saved.get(index) || 0;
    await player.start(ep.url, from, () => onEnded(token));
    if (token !== tuneToken || !on) { player.stop(); return; }
    player.setStatic(HISS, 0.7);
    player.setProgram(1, 0.45);
  }

  function onEnded(token) {
    saved.delete(index);
    ui.caption(null);
    // the radio keeps playing: after a short pause it moves on to the next channel
    setTimeout(() => { if (token === tuneToken && on) tune(index + 1); }, 2500);
  }

  async function power(next = !on) {
    if (next === on) return;
    if (next) {
      await player.unlock();
      on = true;
      player.play('power', 0.6);
      setPower(true);
      player.setStatic(0.16, 1.6);
      ui.prompt(false);
      showNowPlaying();
      setTimeout(() => { if (on) tune(index, { first: true }); }, 1500);
    } else {
      const prev = player.stop();
      if (prev) saved.set(index, prev.position);
      on = false; arrived = false; tuneToken++;
      player.play('power', 0.6);
      player.setProgram(0, 0.2); player.setStatic(0, 0.35);
      setPower(false);
      needle.go(REST, 1.6);
      clearCards(); ui.caption(null); showNowPlaying(); ui.prompt(true);
      setTimeout(() => { if (!on) player.suspend(); }, 700);
    }
    drawDial();
  }

  function segmentAt(ep, t) {
    return ep?.segments?.find((s) => t >= s.start && t < s.end + 0.35) || null;
  }

  function cardFor(seg, i) {
    if (liveCards.has(seg.id)) return liveCards.get(seg.id);
    const c = channel();
    const src = seg.source || {};
    const card = cards.make(seg.id, {
      site: src.site || 'your note', saved: fmtSaved(src.savedAt), title: src.title || 'Saved note',
      who: seg.speaker || src.author || '', quote: seg.text,
      collection: src.collection ? (markers.find((m) => m.station?.name === src.collection)?.label || src.collection) : (c?.label || ''),
    }, 1.45);
    card.side = i % 2;
    liveCards.set(seg.id, card);
    return card;
  }

  return {
    get on() { return on; },
    get autoCam() { return autoCam; },
    set autoCam(v) { autoCam = v; lastShot = null; },
    player,

    async load() {
      edition = await loadEdition();
      if (!edition) { ui.missing(); return false; }
      ({ channels, markers } = buildChannels(edition));
      index = Math.max(0, channels.findIndex((c) => c.kind === 'station' && c.episodeKey));
      ui.edition(edition);
      dialKey = '';
      drawDial();
      return true;
    },

    power,
    next() { if (on) tune(index + 1); },
    prev() { if (on) tune(index - 1); },
    toggleCaptions() { captionsOn = !captionsOn; ui.caption(null); return captionsOn; },
    volume(delta) { player.setVolume(player.volume + delta); ui.volume(player.volume); radio.volume.rotation.y = -player.volume * 4.2; },

    // called every frame; returns the programme level for the valve glow
    update(dt, t) {
      if (!edition) return 0;
      const c = channel();
      if (on && c?.kind === 'crossover' && arrived) threadT = Math.min(1, threadT + dt / 1.4);
      drawDial();

      const ep = episode();
      const pos = player.playing ? player.position() : -1;
      const seg = pos >= 0 ? segmentAt(ep, pos) : null;
      if (captionsOn) ui.caption(seg && arrived ? seg : null);

      // note cards rise from the speaker while a saved passage plays
      if (ep && pos >= 0) {
        ep.segments.forEach((s, i) => {
          if (s.kind !== 'quote' || !s.source) return;
          if (pos < s.start - 1.2 || pos > s.end + 1.4) {
            const old = liveCards.get(s.id);
            if (old) old.group.visible = false;
            return;
          }
          const card = cardFor(s, i);
          const F = radio.FRONT, cx = radio.clothX;
          cards.poseRise(card, pos, {
            rise: s.start - 0.55, exit: s.end + 0.5,
            to: new THREE.Vector3(cx + (card.side ? 0.5 : 0.25), card.side ? 0.38 : 0.44, F + 1.25), rotY: card.side ? -0.12 : 0.12,
          });
        });
      }

      // the camera follows the show unless you've taken over
      if (autoCam) {
        const want = !on ? 1 : !arrived ? 2 : seg?.kind === 'quote' ? 'card' : 1;
        if (want !== lastShot) { lastShot = want; frameShot(SHOTS[want]); }
      }
      return on && arrived ? player.level() : 0;
    },
  };
}
