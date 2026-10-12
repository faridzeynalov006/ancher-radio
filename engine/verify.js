// Every quote the host plays must appear word for word in the saved note.
// We compare against the note's original text (the fetched page, uploaded text, video transcript
// or post text), never against Ancher's rewritten summary, so a paraphrase can't pass.

export function normalize(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown links keep their text
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Auto-captions often repeat every line several times ("a b a b a b c d c d c d").
// Collapse any run of an n-gram repeated back to back into a single copy.
export function collapseRepeats(text) {
  let words = text.split(' ');
  const same = (a, b, n) => {
    for (let k = 0; k < n; k++) if (words[a + k] !== words[b + k]) return false;
    return true;
  };
  for (let n = 12; n >= 1; n--) {
    const out = [];
    let i = 0;
    while (i < words.length) {
      if (i + 2 * n <= words.length && same(i, i + n, n)) {
        let j = i + n;
        while (j + n <= words.length && same(i, j, n)) j += n;
        out.push(...words.slice(i, i + n));
        i = j;
      } else {
        out.push(words[i]);
        i++;
      }
    }
    words = out;
  }
  return words.join(' ');
}

const stripEnds = (q) => q.replace(/^[\s"'.,;:!?-]+|[\s"'.,;:!?-]+$/g, '');

// sources: { [noteId]: string[] } of original texts
export function buildCorpus(sources) {
  const corpus = {};
  for (const [id, texts] of Object.entries(sources)) {
    const joined = normalize(texts.filter(Boolean).join('\n'));
    corpus[id] = [joined, collapseRepeats(joined)];
  }
  return corpus;
}

// Finds the quote in its claimed note, or in another note on the same shelf (and says so).
export function verifyQuote(quote, noteId, corpus) {
  const q = stripEnds(normalize(quote));
  if (q.length < 8) return { ok: false, reason: 'too short' };
  if (/\.\.\.|…/.test(quote)) return { ok: false, reason: 'joined with an ellipsis' };
  const inNote = (id) => (corpus[id] || []).some((t) => t.includes(q));
  if (noteId && inNote(noteId)) return { ok: true, noteId };
  const other = Object.keys(corpus).find((id) => id !== noteId && inNote(id));
  if (other) return { ok: true, noteId: other, corrected: true };
  return { ok: false, reason: 'not found word for word in the saved text' };
}

// Drops quotes that fail. Returns the kept segments plus a report.
export function verifyEpisode(episode, corpus) {
  const report = [];
  const segments = [];
  for (const seg of episode.segments) {
    if (seg.type !== 'quote') { segments.push(seg); continue; }
    const r = verifyQuote(seg.text, seg.noteId, corpus);
    report.push({ text: seg.text, claimed: seg.noteId, ...r });
    if (r.ok) segments.push({ ...seg, noteId: r.noteId });
  }
  return { episode: { ...episode, segments }, report };
}
