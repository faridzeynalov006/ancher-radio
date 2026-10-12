// Pulls the episode JSON out of Ancher's reply and checks its shape.

export function extractJson(reply) {
  let s = String(reply || '').trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();
  const first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('No JSON object in the reply');
  return JSON.parse(s.slice(first, last + 1));
}

export function parseEpisode(reply) {
  const data = extractJson(reply);
  if (!Array.isArray(data.segments) || !data.segments.length) throw new Error('Reply has no segments');
  const segments = data.segments
    .map((x) => ({
      type: x.type === 'quote' ? 'quote' : 'host',
      text: String(x.text || '').trim(),
      ...(x.type === 'quote' ? { noteId: x.noteId || x.note_id || null, speaker: String(x.speaker || '').trim() } : {}),
    }))
    .filter((x) => x.text);
  if (!segments.some((x) => x.type === 'host')) throw new Error('Reply has no host lines');
  return { title: String(data.title || '').trim(), segments };
}
