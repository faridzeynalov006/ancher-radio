// Two quality modes.
// live (default): tuned to hold 60 fps on a base M1 laptop. Measured on an M1 at 1512x945:
//   original settings 21-28 fps; without glass transmission 54; plus capped resolution 60.
// film (?mode=film): the original settings, for rendering videos frame by frame, where speed doesn't matter.

const params = new URLSearchParams(location.search);
export const MODE = params.get('mode') === 'film' ? 'film' : 'live';
export const SHOW_FPS = params.has('fps');

export const QUALITY = MODE === 'film'
  ? { realGlass: true, maxPixelRatio: 2, minPixelRatio: 2, shadowMapSize: 4096, depthOfField: true, adaptive: false, msaa: 0 }
  : { realGlass: false, maxPixelRatio: 1.5, minPixelRatio: 0.85, shadowMapSize: 2048, depthOfField: false, adaptive: true, msaa: 4 };

// Lowers (and later restores) the render resolution so the frame rate stays smooth.
// It measures over two-second windows and only changes in small steps, so it never flickers.
export function createAdaptiveResolution(renderer, composer, onChange = () => {}) {
  let ratio = Math.min(devicePixelRatio, QUALITY.maxPixelRatio);
  let frames = 0, windowStart = performance.now(), fps = 60, lastDrop = -Infinity;
  const apply = () => {
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    onChange(ratio);
  };
  apply();
  return {
    get ratio() { return ratio; },
    get fps() { return fps; },
    tick() {
      frames++;
      const now = performance.now();
      const span = now - windowStart;
      if (span < 2000) return;
      fps = (frames * 1000) / span;
      frames = 0; windowStart = now;
      if (!QUALITY.adaptive || document.hidden) return;
      const ceiling = Math.min(devicePixelRatio, QUALITY.maxPixelRatio);
      if (fps < 50 && ratio > QUALITY.minPixelRatio) {
        ratio = Math.max(QUALITY.minPixelRatio, +(ratio - 0.15).toFixed(2));
        lastDrop = now;
        apply();
      } else if (fps > 58.5 && ratio < ceiling && now - lastDrop > 15000) {
        ratio = Math.min(ceiling, +(ratio + 0.1).toFixed(2));
        apply();
      }
    },
  };
}
