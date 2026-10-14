"""Ancher Radio's local server: serves the radio and runs the engine when you press its buttons.

    python3 serve.py [port] [root]          (npm start)

GET  /api/status    is there an API key, is an edition being built (and how far along), new saves since
POST /api/edition   start building a new edition (engine/build.js); the old one keeps playing until it's done
POST /api/road      export tonight's edition as one MP3 (engine/road.js) and return its path
POST /save?name=x   receives captured frames (used for renders)

The API key is read from .env by the engine itself and never sent to the browser.
Nothing runs on a schedule: the engine only runs when someone presses "New edition".
Set RADIO_SOURCE=replay to let the button rebuild from recorded responses instead (no key, for testing).
"""
import base64, json, os, re, shutil, subprocess, sys, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8140
ROOT = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.getcwd())
SHOTS = os.environ.get('SHOTS_DIR', os.path.join(ROOT, 'shots'))
REPLAY = os.environ.get('RADIO_SOURCE') == 'replay'
CHECK_EVERY = 10 * 60  # seconds between "new saves since" checks (reading the library is free)


def find_node():
    found = os.environ.get('NODE') or shutil.which('node')
    for f in [found, os.path.expanduser('~/.local/node/bin/node'), '/opt/homebrew/bin/node', '/usr/local/bin/node']:
        if f and os.path.exists(f):
            return f
    return 'node'


NODE = find_node()


def has_key():
    if os.environ.get('ANCHER_API_KEY'):
        return True
    try:
        with open(os.path.join(ROOT, '.env')) as f:
            return any(re.match(r'\s*ANCHER_API_KEY\s*=\s*\S', line) for line in f)
    except OSError:
        return False


class Build:
    """One edition build at a time, run as a child process; its progress lines become a status the page polls."""

    def __init__(self):
        self.lock = threading.Lock()
        self.state = {'running': False}

    def snapshot(self):
        with self.lock:
            return dict(self.state)

    def start(self):
        with self.lock:
            if self.state.get('running'):
                return False
            self.state = {'running': True, 'stage': 'starting', 'message': 'Starting…', 'startedAt': time.time()}
        threading.Thread(target=self._run, daemon=True).start()
        return True

    def _set(self, **kw):
        with self.lock:
            self.state.update(kw)

    def _run(self):
        cmd = [NODE, os.path.join(ROOT, 'engine', 'build.js'), '--progress'] + (['--replay'] if REPLAY else [])
        log, step = [], {}
        try:
            proc = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            for line in proc.stdout:
                line = line.rstrip()
                log = (log + [line])[-40:]
                if line.startswith('@@progress '):
                    e = json.loads(line[len('@@progress '):])
                    stage = e['stage']
                    if stage == 'reading':
                        self._set(stage=stage, message='Reading your shelves…')
                    elif stage == 'planned':
                        self._set(stage=stage, total=len(e['jobs']), message=f"{len(e['jobs'])} shows to write tonight")
                    elif stage == 'writing':
                        step = e
                        self._set(stage=stage, i=e['i'], total=e['n'], label=e['label'], line=None, lines=None,
                                  message=f"Ancher is writing {e['label']}…")
                    elif stage == 'voicing':
                        self._set(stage=stage, label=e['label'], lines=e['lines'], line=0,
                                  message=f"Voicing {e['label']}…")
                    elif stage == 'skipped':
                        self._set(message=f"Skipped {e['label']}, keeping its last episode")
                    elif stage == 'built':
                        self._set(stage='finishing', message='Swapping in the new edition…')
                    continue
                m = re.search(r'voiced \S+ \((\d+)/(\d+)', line)
                if m:
                    self._set(line=int(m.group(1)), lines=int(m.group(2)),
                              message=f"Voicing {step.get('label', '')}: line {m.group(1)} of {m.group(2)}")
                elif 'voice unchanged' in line:
                    self._set(message=f"{step.get('label', '')}: same script as before, keeping its audio")
                elif line.startswith('No ANCHER_API_KEY'):
                    self._set(error='no-key')
            code = proc.wait()
            ok = code == 0 and not self.snapshot().get('error')
            self._set(running=False, stage='done' if ok else 'failed', finishedAt=time.time(),
                      message='New edition ready' if ok else 'The build stopped. Nothing changed; the last edition still plays.',
                      log=log[-8:] if not ok else None)
        except Exception as e:  # never leave the page waiting on a dead build
            self._set(running=False, stage='failed', finishedAt=time.time(), message=f'Could not run the engine: {e}')


BUILD = Build()
FRESH = {'checkedAt': 0, 'result': None, 'checking': False}


def fresh_saves():
    """Saves added since this edition, checked in the background at most every few minutes (needs a key)."""
    if not has_key() or FRESH['checking'] or time.time() - FRESH['checkedAt'] < CHECK_EVERY:
        return FRESH['result']

    def check():
        FRESH['checking'] = True
        try:
            out = subprocess.run([NODE, os.path.join(ROOT, 'engine', 'build.js'), '--check'], cwd=ROOT,
                                 capture_output=True, text=True, timeout=120).stdout.strip().splitlines()
            FRESH['result'] = json.loads(out[-1]) if out else None
        except Exception:
            FRESH['result'] = None
        FRESH['checkedAt'] = time.time()
        FRESH['checking'] = False

    threading.Thread(target=check, daemon=True).start()
    return FRESH['result']


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def status(self):
        return {'hasKey': has_key(), 'replay': REPLAY, 'build': BUILD.snapshot(), 'fresh': fresh_saves()}

    def do_GET(self):
        if urlparse(self.path).path == '/api/status':
            return self.send_json(self.status())
        return super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        if url.path == '/api/edition':
            if not (has_key() or REPLAY):
                return self.send_json({**self.status(), 'started': False}, 409)
            started = BUILD.start()
            if started:
                FRESH['checkedAt'] = 0
            return self.send_json({**self.status(), 'started': started})
        if url.path == '/api/road':
            r = subprocess.run([NODE, os.path.join(ROOT, 'engine', 'road.js'), '--json'], cwd=ROOT, capture_output=True, text=True)
            try:
                res = json.loads(r.stdout.strip().splitlines()[-1])
            except Exception:
                res = {'error': (r.stderr or 'Export failed').strip()[-300:]}
            return self.send_json(res, 500 if 'error' in res else 200)
        # captured frames for renders
        q = parse_qs(url.query)
        name = os.path.basename(q.get('name', ['frame.png'])[0])
        body = self.rfile.read(int(self.headers['Content-Length'])).decode()
        data = base64.b64decode(body.split(',', 1)[1])
        os.makedirs(SHOTS, exist_ok=True)
        with open(os.path.join(SHOTS, name), 'wb') as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

    def end_headers(self):
        # always serve the latest files (browsers otherwise keep stale ES modules after an update)
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    print(f'Ancher Radio on http://localhost:{PORT}')
    ThreadingHTTPServer(('', PORT), Handler).serve_forever()
