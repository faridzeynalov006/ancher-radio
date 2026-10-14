// The thin layer of text and buttons over the radio: what's playing, the programme, captions, controls.
// Plain DOM only, so it never costs the 3D scene a frame.
const $ = (id) => document.getElementById(id);

const fmtDay = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
};
export const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) return '';
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

// remembered per browser; the page works the same when storage is blocked
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};

export function createUI() {
  let lastCaption = null, lastProgress = '', arrivalTimer = null, edition = null, fresh = null;
  const narrow = () => matchMedia('(max-width: 860px)').matches;

  function renderEditionLine() {
    if (!edition) return;
    const source = edition.demo ? 'the demo edition' : edition.source === 'live' ? 'from your live Ancher library' : 'from recorded Ancher responses';
    let line = `Edition of ${fmtDay(edition.builtAt)} · written by Ancher ${source}`;
    const el = $('edition');
    el.textContent = line;
    if (fresh && typeof fresh.newSince === 'number') {
      const span = document.createElement('span');
      span.className = fresh.newSince ? 'new' : '';
      span.textContent = fresh.newSince ? ` · ${fresh.newSince} new ${fresh.newSince === 1 ? 'save' : 'saves'} since` : ' · up to date';
      if (fresh.titles?.length) span.title = fresh.titles.join('\n');
      el.append(span);
    }
  }

  function toggleProgramme() {
    if (narrow()) { document.body.classList.toggle('prog-open'); return; }
    const collapsed = document.body.classList.toggle('prog-collapsed');
    store.set('radio.programme', collapsed ? 'collapsed' : 'open');
  }

  function toggleHints(show) {
    const open = show ?? !$('hints').classList.contains('show');
    $('hints').classList.toggle('show', open);
    $('btn-hints').setAttribute('aria-expanded', String(open));
  }

  return {
    bind({ power, next, prev, captions, volume, tuneTo }) {
      document.body.classList.add('live');
      if (store.get('radio.programme') === 'collapsed') document.body.classList.add('prog-collapsed');
      // buttons give the keyboard back after a click, so space and the arrows keep working
      const click = (id, fn) => { $(id).onclick = (e) => { fn(e); e.currentTarget.blur(); }; };
      click('btn-power', power);
      click('btn-next', next);
      click('btn-prev', prev);
      click('btn-cc', captions);
      click('btn-vol-up', () => volume(0.1));
      click('btn-vol-down', () => volume(-0.1));
      click('btn-prog', toggleProgramme);
      click('btn-hints', () => toggleHints());
      $('prog-header').onclick = toggleProgramme;
      $('prog-list').onclick = (e) => {
        const item = e.target.closest('.prog-item');
        if (!item) return;
        tuneTo(Number(item.dataset.index));
        item.blur();
        if (narrow()) document.body.classList.remove('prog-open');
      };
      addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.controls-wrap')) toggleHints(false);
        if (!e.target.closest('.programme, #btn-prog')) document.body.classList.remove('prog-open');
      });
      addEventListener('keydown', (e) => {
        if (e.key === '?') toggleHints();
        if (e.key === 'Escape') { toggleHints(false); document.body.classList.remove('prog-open'); }
        if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey) toggleProgramme();
      });
      if (matchMedia('(pointer: coarse)').matches) $('prompt').textContent = 'Tap the radio to switch it on';
      this.prompt(true);
    },

    edition(ed) { edition = ed; renderEditionLine(); },
    fresh(f) { fresh = f; renderEditionLine(); },
    missing() {
      $('edition').textContent = 'No edition yet. Press "New edition", or run "npm run edition" in a terminal.';
      this.programme([], -1, false);
    },

    station(name) {
      $('station').textContent = name;
      document.body.classList.toggle('on-air', name !== 'Off');
    },
    title(text) { $('episode').textContent = text || ''; },

    // the episode progress bar; only touches the DOM when the shown second changes
    progress(pos, dur) {
      const show = pos != null && dur > 0;
      document.body.classList.toggle('playing', show);
      if (!show) { lastProgress = ''; return; }
      const label = `${fmtTime(pos)} / ${fmtTime(dur)}`;
      if (label === lastProgress) return;
      lastProgress = label;
      $('progress-time').textContent = label;
      $('progress-fill').style.transform = `scaleX(${Math.min(1, pos / dur).toFixed(4)})`;
    },

    // the station name, large, for a moment after the needle lands
    arrive(kicker, name) {
      clearTimeout(arrivalTimer);
      $('arrival-kicker').textContent = kicker;
      $('arrival-name').textContent = name;
      $('arrival').classList.add('show');
      arrivalTimer = setTimeout(() => $('arrival').classList.remove('show'), 2800);
    },
    leave() { clearTimeout(arrivalTimer); $('arrival').classList.remove('show'); },

    // items: [{ label, title, duration, color, quiet, sub }]
    programme(items, current, on) {
      const total = items.reduce((t, it) => t + (it.duration || 0), 0);
      $('prog-meta').textContent = items.length ? `${items.filter((i) => !i.quiet).length} shows · ${Math.round(total / 60)} min` : '';
      const list = $('prog-list');
      const key = JSON.stringify([items.map((i) => [i.label, i.title, i.duration]), current, on]);
      if (list.dataset.key === key) return;
      list.dataset.key = key;
      list.replaceChildren(...items.map((it, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.className = 'prog-item' + (it.quiet ? ' quiet' : '') + (it.sub ? ' sub' : '') + (on && i === current ? ' current' : '');
        b.dataset.index = it.index;
        if (on && i === current) b.setAttribute('aria-current', 'true');
        const sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = it.color;
        const label = document.createElement('span'); label.className = 'label'; label.textContent = it.label;
        const dur = document.createElement('span'); dur.className = 'dur';
        dur.textContent = on && i === current ? 'On air' : it.quiet ? 'Quiet' : fmtTime(it.duration);
        const title = document.createElement('span'); title.className = 'title';
        title.textContent = it.title; title.title = it.title;
        b.append(sw, label, dur, title);
        li.append(b);
        return li;
      }));
    },

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
      const who = $('caption-who');
      who.textContent = seg.kind === 'quote' ? [seg.speaker, src?.title].filter(Boolean).join(' · ') : '';
      // the saved original, one click away
      if (seg.kind === 'quote' && /^https?:\/\//.test(src?.url || '')) {
        const a = document.createElement('a');
        a.href = src.url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'Open the original ↗';
        who.append(a);
      }
      box.classList.add('show');
    },
  };
}
