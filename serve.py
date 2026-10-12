"""Static server that can also receive captured frames.

POST /save?name=foo.png with a PNG data URL body writes to $SHOTS_DIR/foo.png.
"""
import base64, os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8140
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
SHOTS = os.environ.get('SHOTS_DIR', os.path.join(ROOT, 'shots'))
os.makedirs(SHOTS, exist_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = os.path.basename(q.get('name', ['frame.png'])[0])
        body = self.rfile.read(int(self.headers['Content-Length'])).decode()
        data = base64.b64decode(body.split(',', 1)[1])
        with open(os.path.join(SHOTS, name), 'wb') as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

    def log_message(self, *a):
        pass


ThreadingHTTPServer(('', PORT), Handler).serve_forever()
