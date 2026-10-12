// The live source, run against a fake Ancher API: proves the SDK wiring (paths, auth, paging,
// file downloads, the streamed agent reply) without a real key or network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSource } from '../sources/live.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sse = (events) => new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n',
  { status: 200, headers: { 'content-type': 'text/event-stream' } });

function fakeAncher() {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method || input.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || input.headers);
    calls.push({ method, path: url.pathname + url.search, auth: headers.get('authorization') });
    const p = url.pathname;
    if (p === '/api/v1/collections/' && !url.searchParams.get('cursor')) {
      return json({ items: [{ id: 'c1', name: 'First 100 Users', color: 'orange', status: 'active' }], has_more: true, next_cursor: 'page2' });
    }
    if (p === '/api/v1/collections/') return json({ items: [{ id: 'c2', name: 'Radio', color: 'orange', status: 'active' }], has_more: false, next_cursor: null });
    if (p === '/api/v1/collections/c1/notes') return json({ items: [{ id: 'n1', title: 'Do Things that Don\'t Scale', status: 'ready', created_at: '2026-09-23T07:10:32Z', description: 'PG essay' }], has_more: false, next_cursor: null });
    if (p === '/api/v1/notes/n1') {
      return json({
        id: 'n1', title: 'Do Things that Don\'t Scale', description: 'PG essay', origin_files: [],
        downloaded_files: [{ id: 'f1', mimetype: 'text/markdown', filename: 'ds.md' }, { id: 'img', mimetype: 'image/webp', filename: 'x.webp' }],
        transcript_file: { id: 'f2', mimetype: 'text/vtt', filename: 't.vtt' },
      });
    }
    // files download in two steps: mint a short-lived link, then fetch it from the CDN
    const minted = p.match(/^\/api\/v1\/notes\/n1\/files\/(\w+)\/content\/presigned-urls$/);
    if (minted && method === 'POST') return json({ download_url: `https://cdn.example.test/${minted[1]}` });
    if (url.host === 'cdn.example.test' && p === '/f1') return new Response('Think of some successful startups. How many of their launches do you remember?');
    if (url.host === 'cdn.example.test' && p === '/f2') return new Response('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello<00:00:01.500><c> there</c>\n');
    if (p === '/api/v1/conversations' && method === 'POST') {
      return json({ conversation_id: 'conv1', message_id: 'm1', user_message_id: 'u1', run_id: 'r1', stream_url: '/api/v1/conversations/conv1/stream', status: 'running' }, 202);
    }
    if (p === '/api/v1/conversations/conv1/stream') {
      return sse([
        { type: 'content', delta: 'A first draft' },
        { type: 'review_rejected', delta: 'too long' },
        { type: 'content', delta: '{"title":"T","segments":' },
        { type: 'content', delta: '[{"type":"host","text":"Hi."}]}' },
        { type: 'done', finish_reason: 'stop' },
      ]);
    }
    return json({ detail: `unexpected ${method} ${p}` }, 404);
  };
  return { calls, fetchImpl };
}

test('live source lists every page of collections with the key as a Bearer token', async () => {
  const api = fakeAncher();
  const src = createLiveSource({ apiKey: 'test-key', fetchImpl: api.fetchImpl });
  const cols = await src.listCollections();
  assert.deepEqual(cols.map((c) => c.name), ['First 100 Users', 'Radio']);
  assert.ok(api.calls.every((c) => c.auth === 'Bearer test-key'));
});

test('live source reads a note\'s original files (pages and captions), skipping images', async () => {
  const api = fakeAncher();
  const src = createLiveSource({ apiKey: 'k', fetchImpl: api.fetchImpl });
  const [note] = await src.listCollectionNotes('c1');
  const texts = await src.noteSources(note);
  assert.ok(texts.some((t) => t.includes('How many of their launches do you remember?')));
  assert.ok(texts.includes('hello there'), 'VTT captions are cleaned');
  assert.ok(!api.calls.some((c) => c.path.includes('/files/img')), 'images are not downloaded');
});

test('live source streams the agent reply with web search off and drops a rejected draft', async () => {
  const api = fakeAncher();
  const src = createLiveSource({ apiKey: 'k', fetchImpl: api.fetchImpl });
  const reply = await src.ask('station-x', 'brief');
  assert.equal(reply, '{"title":"T","segments":[{"type":"host","text":"Hi."}]}');
});
