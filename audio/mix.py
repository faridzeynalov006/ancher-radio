"""Lay out the show, process voices like a radio, mix beds and cues.

Writes audio/mix.wav and audio/timeline.json (segment times, needle moves,
cue times and a per-frame voice envelope that drives the dial glow).
Run with ~/Desktop/Ancher/.tts-venv/bin/python.
"""
import json, os, subprocess
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
FPS = 30


def load(path, filters=None):
    cmd = ['ffmpeg', '-v', 'error', '-i', path]
    if filters:
        cmd += ['-af', filters]
    cmd += ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()


def trim(x, thr=0.004, pad=0.03):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx):
        return x
    a = max(0, idx[0] - int(pad * SR)); b = min(len(x), idx[-1] + int(pad * SR))
    return x[a:b]


def db(v):
    return 10 ** (v / 20)


HOST_FX = 'highpass=f=110,lowpass=f=7500,equalizer=f=220:t=q:w=1:g=2,acompressor=threshold=-20dB:ratio=3:attack=5:release=80'
QUOTE_FX = 'highpass=f=320,lowpass=f=3600,equalizer=f=1400:t=q:w=1.2:g=4,volume=2.2,asoftclip=type=tanh,acompressor=threshold=-18dB:ratio=4'

script = json.load(open(os.path.join(HERE, 'script.json')))
segs = script['segments']

# ---------- place the voices ----------
t = 5.6  # first host line, after power-on and the station ident
voice_track = []
timeline = {'fps': FPS, 'segments': [], 'events': {}}
prev = None
for s in segs:
    if s['part'] == 'cross' and prev and prev['part'] == 'show':
        timeline['events']['tune'] = round(t + 0.5, 3)
        t += 0.5 + 3.0  # tuning gap
        timeline['events']['cross'] = round(t, 3)
    if s['part'] == 'latest' and prev and prev['part'] == 'cross':
        timeline['events']['chime'] = round(t + 0.7, 3)
        t += 0.7 + 1.3
        timeline['events']['latest'] = round(t, 3)
    elif prev:
        q = s.get('quote') or prev.get('quote')
        t += 0.45 if q else 0.38
    x = load(os.path.join(HERE, 'vo', s['id'] + '.wav'), QUOTE_FX if s.get('quote') else HOST_FX)
    x = trim(x)
    x *= db(-4) if s.get('quote') else db(-1)
    start = t
    t += len(x) / SR
    voice_track.append((start, x))
    timeline['segments'].append({
        'id': s['id'], 'part': s['part'], 'start': round(start, 3), 'end': round(t, 3),
        'text': s['text'], 'quote': bool(s.get('quote')), 'source': s.get('source'),
    })
    prev = s
end_voice = t
total = end_voice + 3.2
timeline['duration'] = round(total, 3)
timeline['events']['power'] = 1.0
timeline['events']['end'] = round(end_voice, 3)

N = int(total * SR)
voice = np.zeros(N, np.float32)
for start, x in voice_track:
    i = int(start * SR); voice[i:i + len(x)] += x[: N - i]

# ---------- beds and cues ----------
bed = np.zeros(N, np.float32)
fx = np.zeros(N, np.float32)


def place(buf, x, at, gain_db):
    i = int(at * SR)
    if i >= N:
        return
    n = min(len(x), N - i)
    buf[i:i + n] += x[:n] * db(gain_db)


def env_curve(points):
    """piecewise-linear gain in dB over time: [(t, dB), ...]"""
    tt = np.arange(N) / SR
    ts, vs = zip(*points)
    return db(np.interp(tt, ts, vs)).astype(np.float32)


tuner = load(os.path.join(HERE, 'sfx/static-tuner.mp3'), 'highpass=f=150')
hiss = load(os.path.join(HERE, 'sfx/static-hiss.mp3'), 'highpass=f=200')
tuner = np.tile(tuner, int(np.ceil(N / len(tuner))))[:N]
hiss = np.tile(hiss, int(np.ceil(N / len(hiss))))[:N]
for b in (tuner, hiss):
    b /= (np.sqrt(np.mean(b ** 2)) + 1e-9)  # normalise to RMS 1
    b *= 0.1

ev = timeline['events']
tune, cross, chime, latest = ev['tune'], ev['cross'], ev['chime'], ev['latest']
# tuner static: swells while warming up, again while tuning, low under the crossover
bed += tuner * env_curve([
    (0, -80), (1.25, -80), (1.6, -9), (3.6, -8), (4.4, -40), (tune - 0.05, -48), (tune + 0.5, -6),
    (tune + 2.3, -7), (cross - 0.2, -22), (cross + 1.0, -27), (chime - 0.2, -27), (chime + 0.6, -60), (total, -60),
])
# faint vintage hiss under everything once on air
bed += hiss * env_curve([(0, -80), (4.0, -80), (5.0, -24), (total - 1.5, -24), (total, -80)])

click = load(os.path.join(HERE, 'sfx/click.mp3'))
chime_snd = load(os.path.join(HERE, 'sfx/chime.mp3'))
ident_a = load(os.path.join(HERE, 'sfx/ident-marimba.wav'))
ident_b = load(os.path.join(HERE, 'sfx/ident-synth.wav'))
place(fx, click, 1.0, -4)                     # power switch
place(fx, ident_a, 4.2, -13)                   # lands on First 100 Users
place(fx, click, tune, -10)                   # hand on the dial
place(fx, ident_b, cross - 1.0, -15)          # the crossover locks in
place(fx, chime_snd, chime, -8)               # newest save
place(fx, click, total - 1.0, -6)             # off

mix = voice + bed + fx
peak = np.max(np.abs(mix))
mix *= 0.89 / peak if peak > 0.89 else 1.0
stereo = np.stack([mix, mix], axis=1)
raw = os.path.join(HERE, 'mix.f32')
stereo.astype(np.float32).tofile(raw)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', raw,
                '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', str(SR), os.path.join(HERE, 'mix.wav')], check=True)
os.remove(raw)

# ---------- voice envelope for the dial glow ----------
hop = SR // FPS
frames = int(total * FPS)
rms = np.array([np.sqrt(np.mean(voice[i * hop:(i + 1) * hop] ** 2)) for i in range(frames)])
rms = rms / (rms.max() + 1e-9)
smooth = np.copy(rms)
for i in range(1, len(smooth)):
    smooth[i] = max(rms[i], smooth[i - 1] * 0.82)
timeline['env'] = [round(float(v), 3) for v in smooth]

# needle path (degrees): off -> First 100 Users; tuning wanders to the gap before Product Stories
timeline['needle'] = [
    [0, -122], [3.0, -122], [4.4, -66],
    [tune, -66], [tune + 0.9, -34], [tune + 1.6, -50], [tune + 2.3, -42], [cross - 0.4, -44],
]
json.dump(timeline, open(os.path.join(HERE, 'timeline.json'), 'w'), indent=1)
print('total', round(total, 2), 's  tune', tune, 'cross', cross, 'chime', chime)
for s in timeline['segments']:
    print(f"{s['id']:>3} {s['start']:6.2f}-{s['end']:6.2f} {'Q' if s['quote'] else ' '} {s['text'][:60]}")
