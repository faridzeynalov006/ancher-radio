// Turns a note's saved file into plain text for quote checking.

// Flattens a transcript JSON (any shape) into its spoken text.
export function flattenTranscript(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenTranscript).join(' ');
  if (value && typeof value === 'object') {
    return ['text', 'content', 'segments', 'utterances', 'words']
      .filter((k) => k in value).map((k) => flattenTranscript(value[k])).join(' ');
  }
  return '';
}

// WebVTT / SRT captions: drop headers, cue numbers, timings and inline <c>/<00:00:01.000> tags,
// and keep each caption line once (auto-captions repeat every line as the next one scrolls in).
export function captionsToText(body) {
  const lines = [];
  let last = '';
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/<[^>]+>/g, '').trim();
    if (!line || /^WEBVTT|^Kind:|^Language:|^NOTE\b|^\d+$/.test(line) || line.includes('-->')) continue;
    if (line === last) continue;
    lines.push(line);
    last = line;
  }
  return lines.join(' ');
}

export function toPlainText(body, mimetype = '', filename = '') {
  if (/vtt|subrip|srt/.test(mimetype) || /\.(vtt|srt)$/i.test(filename)) return captionsToText(body);
  if (/json/.test(mimetype)) {
    try { return flattenTranscript(JSON.parse(body)); } catch { return body; }
  }
  return body;
}
