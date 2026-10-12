// Demo v2 overlay: opening line, host subtitles, end card with the official lockup.
const INK = '#EEEEEC', ORANGE = '#EB7514';
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function wrap(g, text, maxW) {
  const words = text.split(' '); const lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
const spacing = (g, px) => { if ('letterSpacing' in g) g.letterSpacing = px + 'px'; };

let lockup = null;
export async function loadOverlayAssets() {
  lockup = new Image();
  lockup.src = 'assets/brand/lockup-horizontal-dark.svg';
  await lockup.decode();
}

export function drawOverlay2(g, t, tl, W, H) {
  const s = H / 1080, e = tl.events;
  g.save();
  const shade = g.createLinearGradient(0, H * 0.62, 0, H);
  shade.addColorStop(0, 'rgba(8,7,6,0)');
  shade.addColorStop(1, 'rgba(8,7,6,0.66)');
  g.fillStyle = shade;
  g.fillRect(0, H * 0.62, W, H * 0.38);
  g.shadowColor = 'rgba(0,0,0,0.7)';
  g.shadowBlur = 16 * s;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  // opening line
  const [a0, a1] = e.title;
  const ta = clamp01((t - a0) / 0.4) * clamp01((a1 - t) / 0.4);
  if (ta > 0) {
    g.globalAlpha = ta;
    const sh = g.createLinearGradient(0, H * 0.5, 0, H);
    sh.addColorStop(0, 'rgba(8,7,6,0)');
    sh.addColorStop(1, 'rgba(8,7,6,0.8)');
    g.fillStyle = sh; g.fillRect(0, H * 0.5, W, H * 0.5);
    g.font = `700 ${16 * s}px Manrope`; spacing(g, 4 * s);
    g.fillStyle = ORANGE;
    g.fillText('ANCHER RADIO', W / 2, H - 196 * s);
    g.font = `400 ${62 * s}px "Hedvig Letters Serif"`; spacing(g, 0);
    g.fillStyle = INK;
    g.fillText('A radio that only plays what you saved.', W / 2, H - 120 * s);
    g.globalAlpha = 1;
  }

  // host subtitles (quotes are carried by the note cards)
  const seg = tl.segments.find((x) => !x.quote && t >= x.start - 0.12 && t <= x.end + 0.3);
  if (seg && t < e.off) {
    const a = clamp01((t - (seg.start - 0.12)) / 0.2) * clamp01((seg.end + 0.3 - t) / 0.2);
    g.globalAlpha = a;
    g.font = `500 ${34 * s}px Manrope`; spacing(g, 0);
    const lines = wrap(g, seg.display || seg.text, 1240 * s);
    const lh = 46 * s;
    const y = H - 86 * s - (lines.length - 1) * lh;
    if (seg.id === 'x2') {
      g.font = `700 ${16 * s}px Manrope`; spacing(g, 4 * s);
      g.fillStyle = ORANGE;
      g.fillText('CONNECTION FOUND BY ANCHER', W / 2, y - 56 * s);
      g.font = `500 ${34 * s}px Manrope`; spacing(g, 0);
    }
    g.fillStyle = INK;
    lines.forEach((l, i) => g.fillText(l, W / 2, y + i * lh));
    g.globalAlpha = 1;
  }
  g.shadowColor = 'transparent';

  // end card
  const ke = clamp01((t - e.endcard) / 0.7);
  if (ke > 0) {
    g.fillStyle = `rgba(17,17,16,${ke})`;
    g.fillRect(0, 0, W, H);
    const kl = clamp01((t - e.endcard - 0.4) / 0.6);
    g.globalAlpha = kl;
    const lw = 560 * s, lh = lw * 75 / 325;
    if (lockup) g.drawImage(lockup, W / 2 - lw / 2, H / 2 - lh - 34 * s + (1 - kl) * 10 * s, lw, lh);
    g.globalAlpha = clamp01((t - e.endcard - 0.9) / 0.6);
    g.font = `400 ${44 * s}px "Hedvig Letters Serif"`;
    g.fillStyle = '#D9D6CE';
    g.fillText('Everything you kept, put to work.', W / 2, H / 2 + 72 * s);
    g.globalAlpha = 1;
  }

  // fade up from black, and out at the very end
  const k = Math.max(clamp01(1 - t / 0.5), clamp01((t - (tl.duration - 0.5)) / 0.5));
  if (k > 0) { g.fillStyle = `rgba(0,0,0,${k})`; g.fillRect(0, 0, W, H); }
  g.restore();
}
