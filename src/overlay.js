// Demo overlay drawn on top of each captured frame: what's on air,
// subtitles for the host, and a source card for every quoted save.

const INK = '#EEEEEC', MUTED = 'rgba(238,238,236,0.62)', ORANGE = '#EB7514';
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function wrap(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function spaced(g, text, px) {
  if ('letterSpacing' in g) g.letterSpacing = px + 'px';
}

function statusLabel(t, tl) {
  const e = tl.events;
  if (t < e.power + 0.4) return null;
  if (t < 4.4) return { text: 'WARMING UP', dot: false };
  if (t < e.tune) return { text: 'ON AIR  ·  FIRST 100 USERS', dot: true };
  if (t < e.cross) return { text: 'TUNING', dot: false };
  if (t < e.chime) return { text: 'BETWEEN STATIONS  ·  FIRST 100 USERS × PRODUCT STORIES', dot: true };
  if (t < e.end + 1.2) return { text: 'NEWEST SAVE', dot: true };
  return null;
}

export function drawOverlay(g, t, tl, W, H) {
  const s = H / 1080;
  g.save();

  // bottom shade so type always reads
  const shade = g.createLinearGradient(0, H * 0.58, 0, H);
  shade.addColorStop(0, 'rgba(8,7,6,0)');
  shade.addColorStop(1, 'rgba(8,7,6,0.72)');
  g.fillStyle = shade;
  g.fillRect(0, H * 0.58, W, H * 0.42);
  const top = g.createLinearGradient(0, 0, 0, 150 * s);
  top.addColorStop(0, 'rgba(8,7,6,0.55)');
  top.addColorStop(1, 'rgba(8,7,6,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, W, 150 * s);
  g.shadowColor = 'rgba(0,0,0,0.75)';
  g.shadowBlur = 14 * s;
  g.shadowOffsetY = 1 * s;

  // status, top left
  const st = statusLabel(t, tl);
  if (st) {
    g.font = `600 ${18 * s}px Manrope`;
    spaced(g, 3 * s);
    g.textBaseline = 'middle';
    const x = 64 * s, y = 62 * s;
    if (st.dot) {
      g.fillStyle = ORANGE;
      g.globalAlpha = 0.65 + 0.35 * Math.sin(t * 4);
      g.beginPath(); g.arc(x + 6 * s, y, 6 * s, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = INK;
    g.fillText(st.text, x + (st.dot ? 24 * s : 0), y);
  }

  // current segment
  const seg = tl.segments.find((x) => t >= x.start - 0.15 && t <= x.end + 0.35);
  if (seg) {
    const a = clamp01((t - (seg.start - 0.15)) / 0.25) * clamp01((seg.end + 0.35 - t) / 0.25);
    g.globalAlpha = a;
    if (seg.quote) {
      const x = 96 * s, maxW = 1180 * s;
      g.font = `400 ${42 * s}px "Hedvig Letters Serif"`;
      spaced(g, 0);
      const lines = wrap(g, '“' + seg.text + '”', maxW);
      const lh = 54 * s;
      let y = H - 150 * s - (lines.length - 1) * lh;
      g.font = `700 ${15 * s}px Manrope`;
      spaced(g, 3 * s);
      g.fillStyle = ORANGE;
      g.textBaseline = 'alphabetic';
      g.fillText('FROM YOUR ANCHER LIBRARY', x, y - 58 * s);
      // accent rule
      g.fillRect(x - 28 * s, y - 40 * s, 3 * s, lines.length * lh + 44 * s);
      g.font = `400 ${42 * s}px "Hedvig Letters Serif"`;
      spaced(g, 0);
      g.fillStyle = INK;
      lines.forEach((l, i) => g.fillText(l, x, y + i * lh));
      const src = seg.source;
      g.font = `500 ${21 * s}px Manrope`;
      g.fillStyle = MUTED;
      g.fillText(`${src.who}  ·  “${src.title}”  ·  ${src.site}  ·  ${src.saved}`, x, y + lines.length * lh + 6 * s);
    } else {
      const crossLine = seg.id === 'x2';
      g.font = `500 ${32 * s}px Manrope`;
      spaced(g, 0);
      const lines = wrap(g, seg.text, 1300 * s);
      const lh = 44 * s;
      let y = H - 92 * s - (lines.length - 1) * lh;
      g.textAlign = 'center';
      if (crossLine) {
        g.font = `700 ${15 * s}px Manrope`;
        spaced(g, 3 * s);
        g.fillStyle = ORANGE;
        g.fillText('CONNECTION FOUND BY ANCHER', W / 2, y - 52 * s);
        g.font = `500 ${32 * s}px Manrope`;
        spaced(g, 0);
      }
      g.fillStyle = INK;
      lines.forEach((l, i) => g.fillText(l, W / 2, y + i * lh));
      g.textAlign = 'left';
    }
    g.globalAlpha = 1;
  }

  // fade from and to black
  g.shadowColor = 'transparent';
  const fadeIn = clamp01(1 - t / 0.8);
  const fadeOut = clamp01((t - (tl.duration - 1.0)) / 0.9);
  const k = Math.max(fadeIn, fadeOut);
  if (k > 0) { g.fillStyle = `rgba(0,0,0,${k})`; g.fillRect(0, 0, W, H); }
  g.restore();
}
