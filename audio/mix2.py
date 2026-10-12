"""Demo v2 mix: choreographed 45-50s show with vintage broadcast processing.

Writes audio/mix2.wav and audio/timeline2.json. Run with ~/Desktop/Ancher/.tts-venv/bin/python.
"""
import json, os, subprocess
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
FPS = 30

HOST_FX = ('highpass=f=170,lowpass=f=5200,equalizer=f=1100:t=q:w=1:g=3,equalizer=f=190:t=q:w=1:g=2,'
           'acompressor=threshold=-22dB:ratio=4:attack=4:release=90,volume=1.6,asoftclip=type=tanh,'
           'vibrato=f=0.7:d=0.015,aecho=0.85:0.5:17|29:0.14|0.09')
QUOTE_FX = ('highpass=f=330,lowpass=f=3300,equalizer=f=1500:t=q:w=1.2:g=5,acompressor=threshold=-20dB:ratio=5,'
            'volume=2.6,asoftclip=type=tanh,vibrato=f=0.9:d=0.025')
MUSIC_FX = 'highpass=f=260,lowpass=f=3900,equalizer=f=1200:t=q:w=1:g=3,volume=1.4,asoftclip=type=tanh'


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
    return x[max(0, idx[0] - int(pad * SR)): min(len(x), idx[-1] + int(pad * SR))]


db = lambda v: 10 ** (v / 20)
script = {s['id']: s for s in json.load(open(os.path.join(HERE, 'script2.json')))['segments']}
clips = {}
for sid, s in script.items():
    x = trim(load(os.path.join(HERE, 'vo2', sid + '.wav'), QUOTE_FX if s.get('quote') else HOST_FX))
    clips[sid] = x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * 0.11  # level-match every voice
dur = {k: len(v) / SR for k, v in clips.items()}

# ---------- choreography ----------
T = {}
T['c0'] = 0.55
T['h1'] = 3.2
T['q2'] = T['h1'] + dur['h1'] + 0.5
T['q3'] = T['q2'] + dur['q2'] + 0.6
tune = T['q3'] + dur['q3'] + 0.55
T['q4'] = tune + 2.4
T['q5'] = T['q4'] + 1.5
T['x1'] = max(T['q4'] + dur['q4'], T['q5'] + dur['q5']) + 0.45
T['x2'] = T['x1'] + dur['x1'] + 0.35
capture = T['x2'] + dur['x2'] + 0.5
T['j1'] = capture + 2.3
T['q6'] = T['j1'] + dur['j1'] + 0.4
T['e1'] = T['q6'] + dur['q6'] + 0.6
off = T['e1'] + dur['e1'] + 0.5
endcard = off + 0.45
total = endcard + 3.6

N = int(total * SR)
L = np.zeros(N, np.float32); R = np.zeros(N, np.float32)
voice_mono = np.zeros(N, np.float32)


def place(x, at, gain_db=0.0, pan=0.0, voice=False):
    i = int(at * SR)
    n = min(len(x), N - i)
    if n <= 0:
        return
    y = x[:n] * db(gain_db)
    L[i:i + n] += y * min(1, 1 - pan); R[i:i + n] += y * min(1, 1 + pan)
    if voice:
        voice_mono[i:i + n] += y


def curve(points):
    ts, vs = zip(*points)
    return db(np.interp(np.arange(N) / SR, ts, vs)).astype(np.float32)


for sid in clips:
    pan = -0.35 if sid == 'q4' else 0.35 if sid == 'q5' else 0.0
    g = -3 if sid in ('q4', 'q5') else 0
    g = -2 if sid == 'c0' else g
    place(clips[sid], T[sid], g, pan, voice=True)

# beds
def bed(path, fx=None):
    x = load(os.path.join(HERE, path), fx)
    x = np.tile(x, int(np.ceil(N / len(x))))[:N]
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * 0.1

tuner = bed('sfx/static-tuner.mp3', 'highpass=f=150')
hiss = bed('sfx/static-hiss.mp3', 'highpass=f=200')
music = load(os.path.join(HERE, 'sfx2/bigband-bed.mp3'), MUSIC_FX)
music = music / (np.sqrt(np.mean(music ** 2)) + 1e-9) * 0.1
mus = np.zeros(N, np.float32)
mus[:min(N, len(music))] = music[:N]
# second entrance of the band picks up later in the track, not from the top
m2_from = int(40 * SR)
m2_at = int((T['j1'] - 0.4) * SR)
seg = music[m2_from:m2_from + (N - m2_at)]
mus2 = np.zeros(N, np.float32); mus2[m2_at:m2_at + len(seg)] = seg

static_c = tuner * curve([(0, -9), (0.4, -11), (2.4, -16), (3.2, -34), (tune - 0.1, -40), (tune + 0.35, -7),
                          (T['q4'] - 0.1, -9), (T['q4'] + 0.6, -21), (T['x1'], -26), (capture, -30), (capture + 0.5, -60), (total, -60)])
hiss_c = hiss * curve([(0, -24), (total - 0.8, -24), (total, -70)])
mus_c = mus * curve([(0, -80), (2.3, -80), (3.0, -15), (T['h1'] - 0.1, -23), (tune - 0.4, -23), (tune + 0.2, -80), (total, -80)])
mus2_c = mus2 * curve([(0, -80), (T['j1'] - 0.4, -80), (T['j1'] + 0.4, -25), (T['e1'] + dur['e1'], -24),
                       (endcard, -7), (total - 1.2, -7), (total, -60)])
for b in (static_c, hiss_c, mus_c, mus2_c):
    L += b; R += b

# cues
sfx = lambda n: load(os.path.join(HERE, n))
place(sfx('sfx2/static-burst.mp3'), 0.08, -8)
place(sfx('sfx2/knob-ratchet.mp3'), tune, -6, 0.1)
place(sfx('sfx2/knob-ratchet.mp3'), tune + 0.8, -8, 0.1)
place(sfx('sfx2/knob-ratchet.mp3'), tune + 1.55, -9, 0.1)
place(sfx('sfx2/chime-bell.mp3'), capture + 0.1, -7)
place(sfx('sfx2/power-switch.mp3'), off, -3)

mix = np.stack([L, R], 1)
peak = np.max(np.abs(mix)); mix *= 0.89 / peak if peak > 0.89 else 1.0
raw = os.path.join(HERE, 'mix2.f32')
mix.astype(np.float32).tofile(raw)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', raw,
                '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-ar', str(SR), os.path.join(HERE, 'mix2.wav')], check=True)
os.remove(raw)

# ---------- timeline for the picture ----------
hop = SR // FPS
frames = int(total * FPS)
rms = np.array([np.sqrt(np.mean(voice_mono[i * hop:(i + 1) * hop] ** 2)) for i in range(frames)])
rms /= rms.max() + 1e-9
env = rms.copy()
for i in range(1, len(env)):
    env[i] = max(rms[i], env[i - 1] * 0.82)

segments = []
for sid, s in script.items():
    segments.append({'id': sid, 'part': s['part'], 'start': round(T[sid], 3), 'end': round(T[sid] + dur[sid], 3),
                     'text': s['text'], 'display': s.get('display', s['text']), 'quote': bool(s.get('quote')), 'card': s.get('card')})
segments.sort(key=lambda s: s['start'])
tl = {
    'fps': FPS, 'duration': round(total, 3), 'segments': segments,
    'events': {'title': [0.9, 3.4], 'tune': round(tune, 3), 'cross': round(T['q4'], 3), 'thread': [round(T['q4'] + 0.3, 3), round(T['q5'] + 1.8, 3)],
               'capture': round(capture, 3), 'reprint': [round(capture + 0.9, 3), round(capture + 2.0, 3)],
               'off': round(off, 3), 'endcard': round(endcard, 3)},
    'needle': [[0, -66], [tune, -66], [tune + 0.8, -30], [tune + 1.55, -52], [tune + 2.2, -44],
               [capture + 1.9, -44], [capture + 2.9, 114]],
    'env': [round(float(v), 3) for v in env],
}
json.dump(tl, open(os.path.join(HERE, 'timeline2.json'), 'w'), indent=1)
print('total', round(total, 2))
for s in segments:
    print(f"{s['id']:>3} {s['start']:6.2f}-{s['end']:6.2f}  {s['text'][:58]}")
print({k: v for k, v in tl['events'].items()})
