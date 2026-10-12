// Every surface on the radio is painted here, in code. No image files.
import * as THREE from 'three';

// ---------- tiny value-noise ----------
function makeNoise(seed = 1) {
  const p = new Uint8Array(512);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  const h = (x, y) => p[p[x & 255] + (y & 255)] / 255;
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, o = 4) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let i = 0; i < o; i++) { sum += amp * n2(x * f, y * f); amp *= 0.5; f *= 2; }
    return sum;
  };
  return { n2, fbm, rnd };
}

const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
};

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

function finish(c, { srgb = true, repeat = null, aniso = 16 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// ---------- walnut ----------
export function walnutTextures() {
  const W = 2048, H = 1024;
  const [c, g] = canvas(W, H);
  const [rc, rg] = canvas(W, H);
  const img = g.createImageData(W, H);
  const rim = rg.createImageData(W, H);
  const { fbm, n2, rnd } = makeNoise(7);
  const dark = [44, 25, 14], mid = [92, 56, 32], light = [134, 86, 50];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      // long horizontal grain, gently warped
      const warp = fbm(u * 2.2, v * 3.5, 5) * 3.2 + fbm(u * 0.6, v * 0.8, 3) * 4.5;
      const g1 = v * 38 + warp;
      const ring = 0.5 + 0.5 * Math.sin(g1 * Math.PI * 2);
      const figure = Math.pow(ring, 2.2);
      const fine = n2(u * 900, v * 60) * 0.5 + n2(u * 1400, v * 140) * 0.5;
      const cathedral = fbm(u * 1.1 + 3, v * 2.0, 4);
      let col = mix3(mid, light, cathedral * 0.9);
      col = mix3(col, dark, figure * 0.32);
      col = mix3(col, dark, Math.max(0, fine - 0.62) * 1.6);
      const i = (y * W + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
      const r = 150 + figure * 40 + (fine > 0.66 ? 50 : 0);
      rim.data[i] = rim.data[i + 1] = rim.data[i + 2] = r; rim.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  rg.putImageData(rim, 0, 0);
  // open pores: short dark dashes along the grain
  g.globalAlpha = 0.22;
  for (let k = 0; k < 3500; k++) {
    const x = rnd() * W, y = rnd() * H, l = 2 + rnd() * 6;
    g.fillStyle = 'rgb(30,16,8)';
    g.fillRect(x, y, l, 1);
  }
  g.globalAlpha = 1;
  return { map: finish(c), roughnessMap: finish(rc, { srgb: false }) };
}

// ---------- woven speaker cloth ----------
// fine basket weave with a gold thread every few warps, mid-century style
export function clothTextures() {
  const S = 768, T = 6; // T px per thread
  const [c, g] = canvas(S, S);
  const [bc, bg] = canvas(S, S);
  const { rnd, n2 } = makeNoise(21);
  const base = [112, 98, 80];
  const gold = [176, 140, 78];
  const cells = S / T;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const x = cx * T, y = cy * T;
      const over = (cx + cy) % 2 === 0;
      const goldWarp = cx % 12 === 0 && over;
      const tone = goldWarp ? gold : base;
      const jitter = (rnd() - 0.5) * 8 + (n2(cx * 0.15, cy * 0.15) - 0.5) * 10;
      for (let j = 0; j < T; j++) {
        for (let i = 0; i < T; i++) {
          const along = over ? j / (T - 1) : i / (T - 1);
          const across = over ? i / (T - 1) : j / (T - 1);
          const pillow = Math.sin(across * Math.PI) * (0.7 + 0.3 * Math.sin(along * Math.PI));
          const shade = -30 + pillow * 44 + jitter;
          g.fillStyle = `rgb(${tone[0] + shade | 0},${tone[1] + shade | 0},${tone[2] + shade * 0.85 | 0})`;
          g.fillRect(x + i, y + j, 1, 1);
          const b = 30 + pillow * 210;
          bg.fillStyle = `rgb(${b | 0},${b | 0},${b | 0})`;
          bg.fillRect(x + i, y + j, 1, 1);
        }
      }
    }
  }
  return {
    map: finish(c, { repeat: [5, 5] }),
    bumpMap: finish(bc, { srgb: false, repeat: [5, 5] }),
  };
}

// ---------- brushed metal ----------
export function brushedTextures() {
  const W = 1024, H = 1024;
  const [c, g] = canvas(W, H);
  const { rnd } = makeNoise(5);
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 7000; k++) {
    const y = rnd() * H, x = rnd() * W, l = 80 + rnd() * 700;
    const v = 128 + (rnd() - 0.5) * 70;
    g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.35)`;
    g.fillRect(x, y, l, 1);
  }
  return finish(c, { srgb: false, repeat: [1, 1] });
}

// concentric machining for knob tops
export function machinedTexture() {
  const S = 512;
  const [c, g] = canvas(S, S);
  const { rnd } = makeNoise(13);
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, S, S);
  for (let r = 2; r < S / 2; r += 1.5) {
    const v = 128 + (rnd() - 0.5) * 90;
    g.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},0.6)`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.stroke();
  }
  return finish(c, { srgb: false });
}

// ---------- dial face ----------
// Stations are the user's real Ancher collections, marked in each collection's own Ancher colour.
export const STATIONS = [
  { name: 'Design & Motion', angle: -110, color: '#C77A12' },
  { name: 'First 100 Users', angle: -66, color: '#E0650F' },
  { name: 'Product Stories', angle: -22, color: '#C77A12' },
  { name: 'Video Editing', angle: 22, color: '#8A3FCF' },
  { name: 'Brain', angle: 66, color: '#B8930A' },
  { name: 'Tokyo', angle: 110, color: '#2F62C9' },
];
// after a new save arrives the dial reprints with seven stations
export const STATIONS_7 = [-114, -76, -38, 0, 38, 76, 114];
export const NEW_STATION = { name: 'Just Saved', color: '#EB7514' };
export const DIAL_SWEEP = 128; // degrees either side of top

const DIAL_INK = '#2a221a';

function dialBase(S) {
  const C = S / 2;
  const [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(C, C * 0.9, 40, C, C, C);
  grad.addColorStop(0, '#f6ead0');
  grad.addColorStop(0.7, '#ecd9b2');
  grad.addColorStop(1, '#cfb487');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const { rnd } = makeNoise(3);
  g.globalAlpha = 0.05;
  for (let k = 0; k < 40000; k++) {
    g.fillStyle = rnd() > 0.5 ? '#7a5a2a' : '#fff6e0';
    g.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  g.globalAlpha = 1;
  const at = dialAt(C);
  g.strokeStyle = DIAL_INK;
  g.lineWidth = 3;
  const a0 = ((-DIAL_SWEEP - 90) * Math.PI) / 180, a1 = ((DIAL_SWEEP - 90) * Math.PI) / 180;
  g.beginPath(); g.arc(C, C, C * 0.86, a0, a1); g.stroke();
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(C, C, C * 0.72, a0, a1); g.stroke();
  for (let i = 0; i <= 128; i++) {
    const deg = -DIAL_SWEEP + (i / 128) * DIAL_SWEEP * 2;
    const major = i % 16 === 0, half = i % 8 === 0;
    const len = major ? 70 : half ? 46 : 26;
    const [x1, y1] = at(deg, C * 0.86);
    const [x2, y2] = at(deg, C * 0.86 - len);
    g.lineWidth = major ? 5 : half ? 3 : 1.8;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  g.fillStyle = DIAL_INK;
  g.font = '400 64px "Hedvig Letters Serif"';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  ['88', '91', '94', '97', '100', '103', '106', '108'].forEach((n, i) => {
    const deg = -DIAL_SWEEP + (i * 16 / 128) * DIAL_SWEEP * 2;
    const [x, y] = at(deg, C * 0.92);
    g.save(); g.translate(x, y); g.rotate((deg * Math.PI) / 180); g.fillText(n, 0, 0); g.restore();
  });
  g.font = '400 54px "Hedvig Letters Serif"';
  g.fillText('Your library, on air', C, C + C * 0.42);
  g.font = '600 30px Manrope';
  if ('letterSpacing' in g) g.letterSpacing = '10px';
  g.fillText('MHz', C, C + C * 0.53);
  return c;
}

function dialAt(C) {
  return (deg, r) => {
    const a = (deg * Math.PI) / 180;
    return [C + Math.sin(a) * r, C - Math.cos(a) * r];
  };
}

// A dial that can be redrawn: stations slide, light up, and a thread can connect two of them.
export function createLiveDial() {
  const S = 2048, C = S / 2;
  const base = dialBase(S);
  const [c, g] = canvas(S, S);
  const tex = finish(c);
  const at = dialAt(C);
  // state: stations [{name, angle, color, alpha, lit}], thread {a, b, progress}
  function draw(state) {
    g.drawImage(base, 0, 0);
    const { stations, thread } = state;
    if (thread && thread.progress > 0) {
      const A = stations.find((s) => s.name === thread.a), B = stations.find((s) => s.name === thread.b);
      if (A && B) {
        const p0 = at(A.angle, C * 0.72), p2 = at(B.angle, C * 0.72);
        const p1 = at((A.angle + B.angle) / 2, C * 0.5);
        const n = 80, m = Math.max(1, Math.floor(n * Math.min(1, thread.progress)));
        const pts = [];
        for (let i = 0; i <= m; i++) {
          const t = i / n;
          pts.push([(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]]);
        }
        g.save();
        g.lineCap = 'round'; g.lineJoin = 'round';
        const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
        g.shadowColor = 'rgba(235,117,20,1)'; g.shadowBlur = 70;
        g.strokeStyle = 'rgba(235,117,20,0.55)'; g.lineWidth = 46; path(); g.stroke();
        g.shadowBlur = 0;
        g.strokeStyle = '#A8360A'; g.lineWidth = 20; path(); g.stroke();
        g.strokeStyle = '#FFD7A6'; g.lineWidth = 5; path(); g.stroke();
        const [hx, hy] = pts[pts.length - 1];
        if (thread.progress < 1) {
          g.fillStyle = '#fff6ea'; g.shadowColor = '#EB7514'; g.shadowBlur = 50;
          g.beginPath(); g.arc(hx, hy, 20, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }
    }
    stations.forEach((s) => {
      if (s.alpha <= 0) return;
      g.save();
      g.globalAlpha = s.alpha;
      const [mx, my] = at(s.angle, C * 0.72);
      if (s.lit > 0) {
        g.fillStyle = `rgba(235,117,20,${0.25 * s.lit})`;
        g.beginPath(); g.arc(mx, my, 14 + 30 * s.lit, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = s.color;
      g.beginPath(); g.arc(mx, my, 14 + 4 * (s.lit || 0), 0, Math.PI * 2); g.fill();
      g.fillStyle = s.lit > 0.5 ? '#B5480A' : DIAL_INK;
      g.font = '600 33px Manrope';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = '5px';
      const [tx, ty] = at(s.angle, C * 0.62);
      g.translate(tx, ty);
      g.rotate((s.angle * Math.PI) / 180);
      g.fillText(s.name.toUpperCase(), 0, 0);
      g.restore();
    });
    tex.needsUpdate = true;
  }
  draw({ stations: STATIONS.map((s) => ({ ...s, alpha: 1, lit: 0 })) });
  return { texture: tex, draw };
}

// ---------- enamel badge with the official Ancher symbol ----------
// symbolPaths: the d attributes from the official symbol SVG (viewBox 0 0 82 82)
export function badgeTextures(symbolPaths) {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const [bc, bg] = canvas(S, S);
  g.fillStyle = '#ECE8DC';
  g.fillRect(0, 0, S, S);
  const { rnd } = makeNoise(9);
  g.globalAlpha = 0.04;
  for (let k = 0; k < 6000; k++) { g.fillStyle = rnd() > 0.5 ? '#000' : '#fff'; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  g.globalAlpha = 1;
  bg.fillStyle = '#808080';
  bg.fillRect(0, 0, S, S);
  // symbol at half the badge diameter leaves half its height of clear space around it
  const size = S * 0.5, off = (S - size) / 2, k = size / 82;
  for (const [ctx, fill] of [[g, '#131514'], [bg, '#ffffff']]) {
    ctx.save(); ctx.translate(off, off); ctx.scale(k, k);
    ctx.fillStyle = fill;
    symbolPaths.forEach((d) => ctx.fill(new Path2D(d)));
    ctx.restore();
  }
  return { map: finish(c), bumpMap: finish(bc, { srgb: false }) };
}

// ---------- Ancher note card ----------
const SITE_TINT = { 'paulgraham.com': '#8C6A3C', 'review.firstround.com': '#3D7A55', 'linkedin.com': '#2F62C9' };

function wrapLines(g, text, maxW) {
  const words = text.split(' '); const lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// Dark Ancher note card: source line, title, the saved passage, who said it.
export function noteCardTexture({ site, saved, title, who, quote, collection }) {
  const W = 1200, pad = 64;
  const [m, mg] = canvas(10, 10);
  mg.font = '600 46px Manrope';
  const titleLines = wrapLines(mg, title, W - pad * 2).slice(0, 2);
  mg.font = '400 54px "Hedvig Letters Serif"';
  const qLines = wrapLines(mg, '\u201C' + quote + '\u201D', W - pad * 2 - 40);
  const H = pad + 44 + 34 + titleLines.length * 58 + 34 + qLines.length * 68 + 40 + 44 + pad;
  const [c, g] = canvas(W, H);
  const r = 36;
  g.fillStyle = '#191918';
  g.beginPath(); g.roundRect(0, 0, W, H, r); g.fill();
  g.strokeStyle = '#34332F'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(1.5, 1.5, W - 3, H - 3, r - 1); g.stroke();
  let y = pad;
  // source row: favicon tile, domain, saved date
  g.fillStyle = SITE_TINT[site] || '#555';
  g.beginPath(); g.roundRect(pad, y, 40, 40, 9); g.fill();
  g.fillStyle = '#fff'; g.font = '700 26px Manrope'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(site[0].toUpperCase(), pad + 20, y + 21);
  g.textAlign = 'left';
  g.fillStyle = '#9A988F'; g.font = '500 32px Manrope';
  g.fillText(site, pad + 58, y + 21);
  g.textAlign = 'right';
  g.fillText(saved, W - pad, y + 21);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  y += 44 + 34;
  g.fillStyle = '#EEEEEC'; g.font = '600 46px Manrope';
  titleLines.forEach((l, i) => g.fillText(l, pad, y + 44 + i * 58));
  y += titleLines.length * 58 + 34;
  // the saved passage, highlighted
  g.fillStyle = 'rgba(235,117,20,0.10)';
  g.fillRect(pad, y, W - pad * 2, qLines.length * 68 + 26);
  g.fillStyle = '#EB7514';
  g.fillRect(pad, y, 6, qLines.length * 68 + 26);
  g.fillStyle = '#F4EFE6'; g.font = '400 54px "Hedvig Letters Serif"';
  qLines.forEach((l, i) => g.fillText(l, pad + 36, y + 58 + i * 68));
  y += qLines.length * 68 + 26 + 40;
  g.fillStyle = '#9A988F'; g.font = '500 32px Manrope';
  g.fillText('\u2014 ' + who, pad, y + 30);
  if (collection) {
    g.font = '600 26px Manrope';
    const tw = g.measureText(collection).width;
    const x = W - pad - tw - 56;
    g.fillStyle = '#26251F'; g.beginPath(); g.roundRect(x, y - 4, tw + 56, 46, 23); g.fill();
    g.fillStyle = '#E0650F'; g.beginPath(); g.arc(x + 24, y + 19, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#D9D6CE'; g.fillText(collection, x + 40, y + 28);
  }
  const t = finish(c);
  return { texture: t, aspect: W / H };
}

// small engraved labels
export function labelTexture(text, { w = 512, h = 96, color = '#3a3833' } = {}) {
  const [c, g] = canvas(w, h);
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  g.font = '700 44px Manrope';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = '12px';
  g.fillText(text.toUpperCase(), w / 2, h / 2);
  return finish(c);
}

// perforated hardboard for the back
export function hardboardTexture() {
  const W = 1024, H = 640;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#2b2622';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#0d0b0a';
  for (let y = 40; y < H; y += 40) for (let x = 40; x < W; x += 40) {
    g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
  }
  return finish(c);
}
