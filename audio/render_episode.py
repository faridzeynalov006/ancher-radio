"""Voice and mix one episode.

    python audio/render_episode.py <script.json> <out_dir>

script.json: {"segments": [{"id", "kind": "host"|"quote", "speak", "voice", "speed"}],
              "model": path, "voices": path, "bed": optional music path}
Writes <out_dir>/episode.mp3 and <out_dir>/timing.json ({"duration", "segments": [{"id", "start", "end"}]}).

Voices are local Kokoro (free). Host lines get a warm valve-radio chain; quotes get a narrower
"broadcast clip" chain so you can hear they're someone else's words. Same chains as demo v2.
"""
import json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

SR = 48000
HOST_FX = ('highpass=f=170,lowpass=f=5200,equalizer=f=1100:t=q:w=1:g=3,equalizer=f=190:t=q:w=1:g=2,'
           'acompressor=threshold=-22dB:ratio=4:attack=4:release=90,volume=1.6,asoftclip=type=tanh,'
           'vibrato=f=0.7:d=0.015,aecho=0.85:0.5:17|29:0.14|0.09')
QUOTE_FX = ('highpass=f=330,lowpass=f=3300,equalizer=f=1500:t=q:w=1.2:g=5,acompressor=threshold=-20dB:ratio=5,'
            'volume=2.6,asoftclip=type=tanh,vibrato=f=0.9:d=0.025')
MUSIC_FX = 'highpass=f=260,lowpass=f=3900,equalizer=f=1200:t=q:w=1:g=3,volume=1.4,asoftclip=type=tanh'

# gaps between segments (seconds): breathing room before and after a quote
GAP = {('host', 'host'): 0.35, ('host', 'quote'): 0.5, ('quote', 'host'): 0.6, ('quote', 'quote'): 0.55}
LEAD_IN, TAIL = 1.2, 1.6


def run(cmd):
    return subprocess.run(cmd, capture_output=True, check=True)


def load(path, filters=None):
    cmd = ['ffmpeg', '-v', 'error', '-i', path]
    if filters:
        cmd += ['-af', filters]
    cmd += ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(run(cmd).stdout, dtype=np.float32).copy()


def trim(x, thr=0.004, pad=0.03):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx):
        return x
    return x[max(0, idx[0] - int(pad * SR)): min(len(x), idx[-1] + int(pad * SR))]


def main(script_path, out_dir):
    spec = json.load(open(script_path))
    os.makedirs(out_dir, exist_ok=True)
    k = Kokoro(spec['model'], spec['voices'])
    tmp = tempfile.mkdtemp(prefix='radio-')

    clips = []
    total_lines = len(spec['segments'])
    for n, seg in enumerate(spec['segments'], 1):
        voice = seg['voice']
        lang = 'en-gb' if voice.startswith('b') else 'en-us'
        audio, sr = k.create(seg['speak'], voice=voice, speed=seg.get('speed', 0.95), lang=lang)
        raw = os.path.join(tmp, seg['id'] + '.wav')
        sf.write(raw, audio, sr)
        x = trim(load(raw, QUOTE_FX if seg['kind'] == 'quote' else HOST_FX))
        x = x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * 0.11  # level-match every voice
        clips.append((seg, x))
        print(f"  voiced {seg['id']} ({n}/{total_lines}, {seg['kind']}, {voice}) {len(x) / SR:.1f}s", flush=True)

    # lay the segments end to end
    timing, t, prev = [], LEAD_IN, None
    for seg, x in clips:
        if prev:
            t += GAP[(prev, seg['kind'])]
        timing.append({'id': seg['id'], 'start': round(t, 3), 'end': round(t + len(x) / SR, 3)})
        t += len(x) / SR
        prev = seg['kind']
    total = t + TAIL
    N = int(total * SR)
    voice = np.zeros(N, np.float32)
    for (seg, x), tm in zip(clips, timing):
        i = int(tm['start'] * SR)
        voice[i:i + len(x)] += x[:N - i]

    mix = voice.copy()
    bed_path = spec.get('bed')
    if bed_path and os.path.exists(bed_path):
        bed = load(bed_path, MUSIC_FX)
        bed = np.tile(bed, int(np.ceil(N / len(bed))))[:N]
        bed = bed / (np.sqrt(np.mean(bed ** 2)) + 1e-9) * 0.1
        # music swells in the lead-in and tail, and sits low (ducked) under the voices
        tt = np.arange(N) / SR
        level = np.interp(tt, [0, LEAD_IN * 0.6, LEAD_IN, total - TAIL, total - TAIL * 0.4, total],
                          [-14, -12, -27, -27, -14, -40])
        mix += bed * (10 ** (level / 20)).astype(np.float32)

    raw_mix = os.path.join(tmp, 'mix.wav')
    sf.write(raw_mix, mix, SR)
    out = os.path.join(out_dir, 'episode.mp3')
    run(['ffmpeg', '-v', 'error', '-y', '-i', raw_mix, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
         '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', out])
    json.dump({'duration': round(total, 3), 'segments': timing}, open(os.path.join(out_dir, 'timing.json'), 'w'), indent=1)
    print(f'  wrote {out} ({total:.1f}s)', flush=True)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
    # Everything is written. Exit without the interpreter's teardown: onnxruntime (under Kokoro) can
    # abort with "recursive_mutex lock failed" while shutting down, which would read as a failed episode.
    sys.stdout.flush()
    os._exit(0)
