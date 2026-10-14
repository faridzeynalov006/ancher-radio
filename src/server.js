// The radio's two buttons that need the local server (serve.py): "New edition" and "Take it on the road".
// Served as plain static files (no serve.py), the buttons hide themselves and the radio still plays.
const $ = (id) => document.getElementById(id);

const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children);
  return n;
};
const code = (text) => el('code', { textContent: text });

export function createServerButtons({ ui, getShows, onEditionReady, isPlaying }) {
  let status = null, timer = null, confirming = false, exporting = false, lastStage = null;

  const statusBox = () => $('prog-status');
  const show = (...nodes) => statusBox().replaceChildren(...nodes);

  async function poll() {
    clearTimeout(timer);
    try {
      const r = await fetch('api/status', { cache: 'no-store' });
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('no server');
      status = await r.json();
    } catch {
      document.body.classList.add('no-server');
      return;
    }
    document.body.classList.remove('no-server');
    ui.fresh(status.fresh);
    render();
    timer = setTimeout(poll, status.build.running ? 1500 : 60000);
  }

  function render() {
    const b = status.build;
    const btn = $('btn-edition');
    btn.disabled = !!b.running;
    btn.lastChild.textContent = b.running ? 'Building…' : 'New edition';
    if (b.running) {
      lastStage = b.stage;
      // overall progress: each show is a slice, a little for writing and most for voicing
      const per = b.total ? 1 / b.total : 0;
      const within = b.stage === 'voicing' ? 0.25 + 0.75 * ((b.line || 0) / (b.lines || 1)) : b.stage === 'writing' ? 0.1 : 0;
      const done = b.stage === 'finishing' ? 1 : b.i ? (b.i - 1 + within) * per : 0.02;
      show(
        el('div', { textContent: b.message || 'Working…' }),
        el('div', { className: 'bar' }, el('i', { style: `width:${Math.max(2, done * 100).toFixed(1)}%` })),
        el('div', { textContent: b.i ? `Show ${b.i} of ${b.total} · the radio keeps playing meanwhile` : 'The radio keeps playing meanwhile' }),
      );
      return;
    }
    if (lastStage && (b.stage === 'done' || b.stage === 'failed')) {
      // the build we were watching just finished
      lastStage = null;
      if (b.stage === 'done') {
        onEditionReady();
        show(el('div', { textContent: isPlaying() ? 'New edition ready. It starts with the next station you tune to.' : 'New edition ready.' }));
      } else {
        show(el('div', { textContent: b.message }), ...(b.log?.length ? [el('div', {}, code(b.log[b.log.length - 1]))] : []));
      }
    }
  }

  function explainKey() {
    show(
      el('div', { textContent: 'Ancher writes a new edition from your latest saves. It needs your Ancher API key, once:' }),
      el('ol', {},
        el('li', { textContent: 'Create a key in your Ancher settings.' }),
        el('li', {}, 'Add ', code('ANCHER_API_KEY=your-key'), ' to the ', code('.env'), ' file in the radio folder.'),
        el('li', { textContent: 'Press New edition again.' }),
      ),
      el('div', { textContent: 'The key stays in that file. The browser never sees it.' }),
    );
  }

  function confirmBuild() {
    const shows = getShows();
    confirming = true;
    const start = el('button', { className: 'btn primary', textContent: 'Write it' });
    const cancel = el('button', { className: 'btn', textContent: 'Not now' });
    start.onclick = async () => {
      confirming = false;
      show(el('div', { textContent: 'Starting…' }));
      const r = await fetch('api/edition', { method: 'POST' }).then((x) => x.json()).catch(() => null);
      if (r && !r.started && !r.hasKey && !r.replay) return explainKey();
      lastStage = 'starting';
      poll();
    };
    cancel.onclick = () => { confirming = false; show(); };
    show(
      el('div', { textContent: `Ancher writes ${shows || 'about 6'} shows from your latest saves, about one Ancher credit each${status.replay ? ' (test mode: recorded responses, no credits)' : ''}. The voices are made on this computer, free, in about 20 minutes. The radio keeps playing meanwhile.` }),
      el('div', { className: 'row' }, start, cancel),
    );
  }

  async function exportRoad() {
    if (exporting) return;
    exporting = true;
    const btn = $('btn-road');
    btn.disabled = true;
    btn.lastChild.textContent = 'Preparing…';
    show(el('div', { textContent: 'Stitching tonight’s shows into one MP3…' }));
    try {
      const r = await fetch('api/road', { method: 'POST' });
      const res = await r.json();
      if (!r.ok || res.error) throw new Error(res.error || 'Export failed');
      const name = res.file.split('/').pop();
      const a = el('a', { className: 'dl', href: res.file, download: name, textContent: 'Download again' });
      show(
        el('div', { textContent: `${name}: ${Math.round(res.duration / 60)} minutes, a chapter per station. AirDrop it to your phone, or drag it into the Music app, and play it in the car. ` }, a),
      );
      el('a', { href: res.file, download: name }).click();
    } catch (e) {
      show(el('div', { textContent: `Couldn’t make the MP3: ${e.message}` }));
    } finally {
      exporting = false;
      btn.disabled = false;
      btn.lastChild.textContent = 'Take it on the road';
    }
  }

  $('btn-edition').onclick = (e) => {
    e.currentTarget.blur();
    if (!status || status.build.running) return;
    if (confirming) { confirming = false; show(); return; }
    if (!status.hasKey && !status.replay) return explainKey();
    confirmBuild();
  };
  $('btn-road').onclick = (e) => { e.currentTarget.blur(); exportRoad(); };

  poll();
  return { poll };
}
