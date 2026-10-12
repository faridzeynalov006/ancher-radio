// The briefs Ancher's agent receives. Ancher writes every word the host says;
// the engine only checks quotes and prepares the text for speech.

const fmtDate = (d) => {
  if (!d) return 'date unknown';
  const t = new Date(typeof d === 'number' ? d * 1000 : d);
  return isNaN(t) ? 'date unknown' : t.toISOString().slice(0, 10);
};

export function noteLine(n) {
  const who = [n.author, n.site_name].filter(Boolean).join(', ');
  return `- ${n.id} | ${n.title || 'Untitled'}${who ? ` | ${who}` : ''} | saved ${fmtDate(n.created_at)}`;
}

const FORMAT = `Reply in this chat with JSON only. Do not create an artifact, a document or a page. Use this exact shape:
{"title": "...", "segments": [{"type": "host", "text": "..."}, {"type": "quote", "noteId": "<id from the list>", "speaker": "<who said it>", "text": "<exact words from the note>"}]}`;

const VOICE_RULES = `Write it for the ear, as one warm, late-evening radio host talking to me:
- Talk to me as "you", the person who saved these notes. Never say "the user", "someone" or "they" for me.
- Plain spoken sentences. No markdown, no code formatting, no lists, no URLs. Say symbols in words (say "three hundred milliseconds", not "300ms").
- Host lines under 40 words each.
- Quotes are evidence, copied exactly from the notes, word for word: one continuous passage under 35 words, no "..." joins, no fixes to grammar or spelling.
- Only use what is in these notes. No web research.`;

export function stationBrief(station, { newSince = [] } = {}) {
  const fresh = newSince.length
    ? `\nSaved since the last episode (lead with these if they connect to anything):\n${newSince.map(noteLine).join('\n')}\n`
    : '';
  return `You are writing tonight's episode of my personal radio station "${station.name}". It plays the connections between the notes in my Ancher collection "${station.name}".

Notes on this shelf (id | title | author, site | saved):
${station.notes.map(noteLine).join('\n')}
${fresh}
Find the 2 or 3 strongest connections between these notes: the same idea told by different people, a tension where they disagree, or a detail in one note that changes how another reads. Prefer connections I probably wouldn't notice myself. Don't summarise notes one by one.

${VOICE_RULES}
- Open by naming the station, with a short hook about what's odd on this shelf tonight.
- For each connection, set it up, then play 1 or 2 quotes as evidence.
- End with one question I could take into my next piece of work, then a short sign-off.
- 4 to 7 quotes in total. The whole episode should take two to three minutes to read aloud (about 300 to 420 words).

${FORMAT}`;
}

export function crossoverBrief(a, b) {
  return `You are writing a short crossover for my personal radio station: the moment I tune between two of my Ancher collections, "${a.name}" and "${b.name}".

Notes in "${a.name}" (id | title | author, site | saved):
${a.notes.map(noteLine).join('\n')}

Notes in "${b.name}":
${b.notes.map(noteLine).join('\n')}

Find the single most surprising link between these two shelves: one idea that runs through both, or one that clashes.

${VOICE_RULES}
- Open by naming both stations, as if the signal is caught between them.
- Exactly 2 quotes, one from each collection.
- About 45 to 70 seconds read aloud (roughly 110 to 170 words). End on one line that leaves me thinking.

${FORMAT}`;
}

// elsewhere: notes from other stations, used when the new save's own shelf has nothing else on it
export function bulletinBrief(note, station, elsewhere = []) {
  const neighbours = station ? station.notes.filter((n) => n.id !== note.id) : [];
  const context = neighbours.length
    ? `\nIt sits in my collection "${station.name}", alongside:\n${neighbours.map(noteLine).join('\n')}`
    : elsewhere.length
      ? `${station ? `\nIt's the only note in my collection "${station.name}".` : ''} Other things I've saved:\n${elsewhere.map(noteLine).join('\n')}`
      : '';
  return `You are writing the "Just saved" bulletin for my personal radio station: a short news-style flash about the newest thing I saved to Ancher.

The newest save:
${noteLine(note)}${context}

${VOICE_RULES}
- Open with "Just saved." and say what it is in one line.
- 1 or 2 quotes from the new save, then, if it connects to one of the other notes listed, say which one and how in one line.
- 25 to 45 seconds read aloud (roughly 60 to 110 words).

${FORMAT}`;
}
