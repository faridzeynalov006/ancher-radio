"""Voice every segment in script.json with local Kokoro. Run with ~/Desktop/Ancher/.tts-venv/bin/python."""
import json, os, sys
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.expanduser('~/.cache/hyperframes/tts')
SCRIPT = os.environ.get('SCRIPT', 'script.json')
OUT = os.path.join(HERE, os.environ.get('VO_DIR', 'vo'))
os.makedirs(OUT, exist_ok=True)

k = Kokoro(os.path.join(CACHE, 'models/kokoro-v1.0.onnx'), os.path.join(CACHE, 'voices/voices-v1.0.bin'))
script = json.load(open(os.path.join(HERE, SCRIPT)))
only = set(sys.argv[1:])
for s in script['segments']:
    if only and s['id'] not in only:
        continue
    speed = s.get('speed', 0.98 if s['voice'] == 'af_heart' else 0.92 if s['voice'] == 'bm_george' else 0.95)
    audio, sr = k.create(s['text'], voice=s['voice'], speed=speed, lang='en-gb' if s['voice'].startswith('b') else 'en-us')
    sf.write(os.path.join(OUT, s['id'] + '.wav'), audio, sr)
    print(s['id'], s['voice'], round(len(audio) / sr, 2), 's')
