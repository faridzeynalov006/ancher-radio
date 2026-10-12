// Settings for the edition engine: radio.config.json plus an optional .env file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Your own recordings and edition stay on your machine (gitignored).
export const FIXTURES = path.join(ROOT, 'engine', 'fixtures');
export const EDITION_DIR = path.join(ROOT, 'edition');
// The public demo: a few stations recorded from Ancher, with source texts trimmed to the quoted passages.
export const DEMO_FIXTURES = path.join(ROOT, 'engine', 'demo');
export const DEMO_EDITION_DIR = path.join(ROOT, 'demo-edition');

// Minimal .env reader (KEY=value per line), so the engine needs no extra dependency.
export function loadEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

export function loadConfig() {
  const env = { ...loadEnv(), ...process.env };
  const radio = JSON.parse(fs.readFileSync(path.join(ROOT, 'radio.config.json'), 'utf8'));
  const cache = path.join(os.homedir(), '.cache', 'hyperframes', 'tts');
  const firstExisting = (...files) => files.find((f) => f && fs.existsSync(f)) || files[0];
  return {
    ...radio,
    apiKey: env.ANCHER_API_KEY || '',
    baseUrl: env.ANCHER_BASE_URL || undefined,
    voice: env.RADIO_VOICE || radio.voice || 'host',
    python: env.TTS_PYTHON || 'python3',
    kokoroModel: firstExisting(env.KOKORO_MODEL, path.join(ROOT, 'models', 'kokoro-v1.0.onnx'), path.join(cache, 'models', 'kokoro-v1.0.onnx')),
    kokoroVoices: firstExisting(env.KOKORO_VOICES, path.join(ROOT, 'models', 'voices-v1.0.bin'), path.join(cache, 'voices', 'voices-v1.0.bin')),
  };
}
