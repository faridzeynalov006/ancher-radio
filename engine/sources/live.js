// Live source: talks to Ancher through the official SDK. Needs ANCHER_API_KEY.
// Every method here has a twin in replay.js that reads the recorded responses instead.
import fs from 'node:fs';
import path from 'node:path';
import { createAncherSdk, consumeChat } from '@ancher-ai/sdk';
import { FIXTURES } from '../config.js';
import { toPlainText } from '../sourcetext.js';

const TEXT_TYPES = /^(text\/|application\/(json|xml|x-subrip))/;

// fetchImpl lets the tests run this exact code against a fake Ancher API.
export function createLiveSource({ apiKey, baseUrl, record = false, fetchImpl }) {
  const sdk = createAncherSdk({ apiKey, credentials: 'omit', ...(baseUrl ? { baseUrl } : {}), ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  const save = (rel, data) => {
    if (!record) return;
    const file = path.join(FIXTURES, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  };

  async function all(listPage) {
    const items = [];
    let page = await listPage({ limit: 100 });
    items.push(...page.items);
    while (page.has_more && page.next_cursor) {
      page = await listPage({ cursor: page.next_cursor });
      items.push(...page.items);
    }
    return items;
  }

  return {
    kind: 'live',

    async listCollections() {
      const items = await all((o) => sdk.Collection.list(o));
      const slim = items.map(({ id, name, color, description, status }) => ({ id, name, color, description, status }));
      save('collections.json', slim);
      return slim;
    },

    async listCollectionNotes(collectionId) {
      const items = await all((o) => sdk.Collection.notes(collectionId, o));
      const slim = items.map((n) => ({
        id: n.id, title: n.title, author: n.author, site_name: n.site_name, source: n.source, url: n.url,
        status: n.status, created_at: n.created_at, description: n.description,
      }));
      save(`notes/${collectionId}.json`, slim);
      return slim;
    },

    // The note's original saved text: uploaded text, the fetched page, the video transcript, the post text.
    // List responses leave the file lists out, so read the full note first.
    async noteSources(note) {
      const full = await sdk.Note.get(note.id);
      const files = [...(full.origin_files || []), ...(full.downloaded_files || []), ...(full.transcript_file ? [full.transcript_file] : [])]
        .filter((f) => TEXT_TYPES.test(f.mimetype || ''));
      const texts = [full.description || note.description || ''];
      for (const f of files) {
        try {
          const res = await sdk.Note.downloadFile(note.id, f.id);
          texts.push(toPlainText(await res.text(), f.mimetype, f.filename));
        } catch (e) {
          console.warn(`  ! could not read ${f.filename} of "${note.title}": ${e.message}`);
        }
      }
      save(`sources/${note.id}.txt`, texts.join('\n\n'));
      return texts;
    },

    // Ancher's agent answers from the library only (web search off).
    async ask(key, prompt) {
      // Collect the main agent's text ourselves: if Ancher's reviewer rejects a draft,
      // a fresh one streams next and the rejected text must be dropped.
      let text = '', failure = null;
      await consumeChat(
        sdk.Conversation.startChat({ content: prompt, enable_kb_search: true, enable_web_search: false }),
        {
          onText: (t, run) => { if (!run || run.isMain) text += t; },
          onReviewRejected: () => { text = ''; },
          onClarificationRequested: () => { failure = 'Ancher asked a clarifying question instead of answering'; },
          onError: (e) => { failure = e.message; },
        },
      );
      if (failure) throw new Error(`Ancher agent (${key}): ${failure}`);
      save(`asks/${key}.json`, { key, prompt, reply: text, recordedAt: new Date().toISOString() });
      return text;
    },

    // Option A: Ancher voices the episode with its own podcast engine.
    // The episode text becomes a note (filed in a "Radio" collection if there is one), then a podcast.
    async ancherPodcast(title, text, outDir) {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const until = async (get, done, label, timeoutMs = 10 * 60 * 1000) => {
        const t0 = Date.now();
        for (;;) {
          const v = await get();
          if (done(v)) return v;
          if (v.status === 'error') throw new Error(`${label} failed: ${v.error_message || 'unknown error'}`);
          if (Date.now() - t0 > timeoutMs) throw new Error(`${label} timed out`);
          await wait(5000);
        }
      };
      const note = await sdk.Note.createFromText({ text: `# ${title}\n\n${text}` });
      const radioCollection = (await sdk.Collection.list({ limit: 100 })).items.find((c) => c.name === 'Radio');
      if (radioCollection) await sdk.Collection.addNote(radioCollection.id, note.id);
      // a new note reads "fetched" for a minute or two after its text exists; podcasts need "ready"
      await until(() => sdk.Note.get(note.id), (n) => n.status === 'ready', 'Note processing');
      const created = await sdk.Podcast.createForNote(note.id);
      const pod = await until(() => sdk.Podcast.get(created.id), (p) => p.status === 'ready', 'Podcast');
      const download = async (file, name) => {
        const res = await (fetchImpl || fetch)(file.presigned_url);
        fs.writeFileSync(path.join(outDir, name), Buffer.from(await res.arrayBuffer()));
      };
      await download(pod.file, 'episode.mp3');
      let transcript = [];
      if (pod.transcript_file?.presigned_url) {
        transcript = await (await (fetchImpl || fetch)(pod.transcript_file.presigned_url)).json();
      }
      return { noteId: note.id, podcastId: pod.id, duration: pod.duration_seconds, transcript };
    },
  };
}
