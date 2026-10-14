// The radio's sound: episodes, static between stations, knob and switch sounds.
// Browsers only allow audio after a click or key press, so nothing plays until the radio is switched on.

const SFX = {
  static: ['audio/sfx/static-tuner.mp3', 'audio/sfx/static-hiss.mp3'],
  power: ['audio/sfx2/power-switch.mp3', 'audio/sfx/click.mp3'],
  ratchet: ['audio/sfx2/knob-ratchet.mp3', 'audio/sfx/click-soft.mp3'],
};

export function createPlayer() {
  let ctx = null, master, program, staticGain, analyser, levelData;
  let volume = 0.8;
  const buffers = new Map();
  const sfx = {};
  let current = null; // { source, url, offset, startedAt, onEnded }

  async function fetchBuffer(url) {
    if (buffers.has(url)) return buffers.get(url);
    const p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${url}: ${r.status}`))))
      .then((data) => ctx.decodeAudioData(data));
    buffers.set(url, p);
    return p;
  }

  async function firstAvailable(urls) {
    for (const u of urls) {
      try { return await fetchBuffer(u); } catch { buffers.delete(u); }
    }
    return null;
  }

  // Static between stations: the recorded tuner noise when it's on disk, otherwise band-limited noise.
  function noiseBuffer() {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
      d[i] = (b0 + b1 + b2 + w * 0.02) * 0.9 * (0.85 + 0.15 * Math.sin(i / 900));
    }
    return buf;
  }

  async function startStatic() {
    const buf = (await firstAvailable(SFX.static)) || noiseBuffer();
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 1900; band.Q.value = 0.5;
    src.connect(band).connect(staticGain);
    src.start();
  }

  const ramp = (param, value, seconds = 0.25) => {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + seconds);
  };

  return {
    get ready() { return !!ctx; },
    get volume() { return volume; },

    // Must be called from a click or key press.
    async unlock() {
      if (!ctx) {
        ctx = new AudioContext();
        master = ctx.createGain(); master.gain.value = volume;
        program = ctx.createGain(); program.gain.value = 0;
        staticGain = ctx.createGain(); staticGain.gain.value = 0;
        analyser = ctx.createAnalyser(); analyser.fftSize = 512;
        levelData = new Float32Array(analyser.fftSize);
        program.connect(analyser);
        program.connect(master);
        staticGain.connect(master);
        master.connect(ctx.destination);
        await startStatic();
        for (const [name, urls] of Object.entries(SFX)) if (name !== 'static') firstAvailable(urls).then((b) => (sfx[name] = b));
      }
      if (ctx.state === 'suspended') await ctx.resume();
    },

    async suspend() { if (ctx && ctx.state === 'running') await ctx.suspend(); },

    play(name, gain = 0.5) {
      if (!ctx || !sfx[name]) return;
      const src = ctx.createBufferSource();
      const g = ctx.createGain(); g.gain.value = gain;
      src.buffer = sfx[name];
      src.connect(g).connect(master);
      src.start();
    },

    setStatic(level, seconds) { if (ctx) ramp(staticGain.gain, level, seconds); },
    setProgram(level, seconds) { if (ctx) ramp(program.gain, level, seconds); },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (ctx) ramp(master.gain, volume, 0.08);
    },

    preload(url) { if (ctx) fetchBuffer(url).catch(() => {}); },

    // Starts an episode at `offset` seconds. Resolves once it's playing.
    async start(url, offset = 0, onEnded = () => {}) {
      this.stop();
      const buffer = await fetchBuffer(url);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(program);
      const at = Math.min(Math.max(0, offset), Math.max(0, buffer.duration - 0.05));
      source.start(0, at);
      const entry = { source, url, offset: at, startedAt: ctx.currentTime, duration: buffer.duration, ended: false };
      source.onended = () => {
        if (current === entry && !entry.stopped) { entry.ended = true; onEnded(); }
      };
      current = entry;
      return entry;
    },

    stop() {
      if (!current) return null;
      const pos = this.position();
      current.stopped = true;
      try { current.source.stop(); } catch { /* already stopped */ }
      const was = { url: current.url, position: pos };
      current = null;
      return was;
    },

    // Playback position in the current episode, in seconds.
    position() {
      if (!current || !ctx) return 0;
      return Math.min(current.duration, current.offset + (ctx.currentTime - current.startedAt));
    },

    get playing() { return !!current && !current.ended; },
    get duration() { return current?.duration || 0; },

    // Loudness of the programme right now (0..1), for the valve glow.
    level() {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(levelData);
      let sum = 0;
      for (let i = 0; i < levelData.length; i++) sum += levelData[i] * levelData[i];
      return Math.min(1, Math.sqrt(sum / levelData.length) * 6);
    },
  };
}
