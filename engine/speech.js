// Prepares text for the voice. The on-screen text (subtitles, note cards) keeps the original words;
// only what the voice reads is changed, and only in form: never meaning.

const UNITS = { ms: 'milliseconds', s: 'seconds', px: 'pixels', fps: 'frames per second', kb: 'kilobytes', mb: 'megabytes', gb: 'gigabytes' };

// "requestAnimationFrame" -> "request animation frame", "mask-image" -> "mask image"
export function speakIdentifier(token) {
  return token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\(\)$/, '')
    .toLowerCase()
    .trim();
}

export function forEar(text) {
  let s = String(text || '');
  s = s.replace(/`([^`]+)`/g, (_, code) => speakIdentifier(code));
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/https?:\/\/\S+/g, '');
  s = s.replace(/\*\*|__|[*#>]/g, '');
  // camelCase words with two or more humps outside code spans (e.g. "ScrollTrigger" stays, "requestAnimationFrame" splits)
  s = s.replace(/\b[a-z]+(?:[A-Z][a-z0-9]+){2,}\b/g, speakIdentifier);
  s = s.replace(/(\d+(?:\.\d+)?)\s?(ms|s|px|fps|kb|mb|gb)\b/gi, (_, n, u) => `${n} ${UNITS[u.toLowerCase()]}`);
  s = s.replace(/(\d+(?:\.\d+)?)\s?%/g, '$1 percent');
  s = s.replace(/\$(\d[\d,]*(?:\.\d+)?)\s?(M|B|K)\b/g, (_, n, u) => `${n} ${{ M: 'million', B: 'billion', K: 'thousand' }[u]} dollars`);
  s = s.replace(/\$(\d[\d,]*(?:\.\d+)?)/g, '$1 dollars');
  s = s.replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is').replace(/\bvs\.?\s/gi, 'versus ');
  s = s.replace(/\s&\s/g, ' and ');
  s = s.replace(/\s*[—–]\s*/g, ', ').replace(/\s-\s/g, ', ');
  s = s.replace(/…|\.\.\./g, '.');
  s = s.replace(/\s+([,.;:!?])/g, '$1').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
  return s;
}

export const wordCount = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
