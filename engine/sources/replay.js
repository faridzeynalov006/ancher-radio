// Replay source: the same calls as live.js, answered from responses recorded from Ancher
// (engine/fixtures). This is how the engine runs and is tested without an API key.
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, DEMO_FIXTURES } from '../config.js';

export function createReplaySource(dir = fs.existsSync(path.join(FIXTURES, 'collections.json')) ? FIXTURES : DEMO_FIXTURES) {
  const read = (rel) => {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) throw new Error(`No recorded response for ${rel} (run once with a key and --record)`);
    return fs.readFileSync(file, 'utf8');
  };
  return {
    kind: 'replay',
    dir,
    async listCollections() { return JSON.parse(read('collections.json')); },
    async listCollectionNotes(collectionId) {
      try { return JSON.parse(read(`notes/${collectionId}.json`)); } catch { return []; }
    },
    async noteSources(note) {
      try { return [read(`sources/${note.id}.txt`)]; } catch { return [note.description || '']; }
    },
    async ask(key, prompt) {
      const rec = JSON.parse(read(`asks/${key}.json`));
      if (rec.prompt.trim() !== prompt.trim()) {
        console.warn(`  ! the brief for ${key} changed since it was recorded; replaying the recorded reply`);
      }
      return rec.reply;
    },
  };
}
