// The thin layer of text and buttons over the radio: what's playing, captions, controls.
const $ = (id) => document.getElementById(id);

const fmtDay = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
};

export function createUI() {
  let lastCaption = null;
  return {
    bind({ power, next, prev, captions, volume }) {
      document.body.classList.add('live');
      $('btn-power').onclick = power;
      $('btn-next').onclick = next;
      $('btn-prev').onclick = prev;
      $('btn-cc').onclick = captions;
      $('btn-vol-up').onclick = () => volume(0.1);
      $('btn-vol-down').onclick = () => volume(-0.1);
      if (matchMedia('(pointer: coarse)').matches) $('prompt').textContent = 'Tap the radio to switch it on';
      this.prompt(true);
    },
    edition(ed) {
      const source = ed.source === 'live' ? 'from your live Ancher library' : 'from recorded Ancher responses';
      $('edition').textContent = `Edition of ${fmtDay(ed.builtAt)} · written by Ancher ${source}`;
    },
    missing() {
      $('edition').textContent = 'No edition yet. Run "npm run edition:replay" (or "npm run edition" with a key), then reload.';
    },
    station(name) {
      $('station').textContent = name;
      document.body.classList.toggle('on-air', name !== 'Off');
    },
    title(text) { $('episode').textContent = text || ''; },
    prompt(show) { $('prompt').classList.toggle('show', show); },
    volume(v) { $('vol').textContent = `${Math.round(v * 10)}`; },
    captionsToggled(onNow) { $('btn-cc').classList.toggle('off', !onNow); },
    caption(seg) {
      if (seg === lastCaption) return;
      lastCaption = seg;
      const box = $('caption');
      if (!seg) { box.classList.remove('show'); return; }
      box.classList.toggle('quote', seg.kind === 'quote');
      $('caption-text').textContent = seg.kind === 'quote' ? `“${seg.text}”` : seg.text;
      const src = seg.source;
      $('caption-who').textContent = seg.kind === 'quote' ? [seg.speaker, src?.title].filter(Boolean).join(' · ') : '';
      box.classList.add('show');
    },
  };
}
