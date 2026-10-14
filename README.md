# Ancher Radio

A 1950s table radio, built entirely in code, whose stations are your Ancher collections.
Switch it on and each station plays a two-to-three-minute show about **the connections between the things you saved on that shelf**: where two saves agree, where they quietly disagree, the detail in one that changes how you read another. Tune between two stations and you hear the crossover between them. A "Just saved" bulletin covers your newest save.

Ancher writes every word the host says, from your notes. Every quote the radio plays is checked word for word against what you actually saved. The radio, the engine and the sound were built with Claude Code (Claude Opus 5.5).

```
 Your Ancher library ──▶ the engine (npm run edition) ──▶ edition/ ──▶ the radio (npm start)
   collections, notes        Ancher's agent writes the        episodes:      plays it live in the
                             shows; quotes are checked;       audio + text   browser: tuning, static,
                             local voices read them           + timings      note cards, captions
```

## Play it

You need [Node](https://nodejs.org) 20 or newer and Python 3.

```bash
npm install
npm start
```

Open http://localhost:8140, then **click the radio or press space** to switch it on (browsers only allow sound after a click).

| Control | Does |
| --- | --- |
| click / space | power on and off |
| ← → | tune to the previous / next station |
| ↑ ↓ | volume |
| C | captions on/off |
| P | show or hide tonight's programme (click a show to tune to it) |
| ? | the key list |
| 1–5 | camera shots (hero, dial, knob, speaker, profile) |
| A | let the camera follow the show again |
| drag | orbit the radio |
| H | hide the on-screen text |

The panel on the right is **tonight's programme**: every show in dial order with its length. Click one to tune straight to it. While a show plays you get a progress bar, captions, and under each quote a link to the original you saved.

A fresh clone plays the **demo edition** (`demo-edition/`): three stations built from a real Ancher library (First 100 Users, Design & Motion, Product Stories) and their crossover. Once you build your own edition it plays yours instead.

## Make it yours: build an edition from your own library

1. Create an API key in your Ancher settings.
2. Make a file called `.env` in this folder:
   ```
   ANCHER_API_KEY=your-key
   ```
3. Set up the free local voices once (see "Voices" below).
4. Press **New edition** in the radio's programme panel (or run `npm run edition` in a terminal).

The radio keeps playing while the new edition is made. The panel shows the progress ("Ancher is writing First 100 Users…", "Voicing First 100 Users: line 12 of 18"). When it's finished, the new edition starts with the next station you tune to. The engine builds into `edition.next/` and swaps it in only when everything worked, so a failed build leaves the old edition playing. Once a key is set, the edition line under the controls also says how many saves you've added since (counting reads your library, which is free).

**What it costs:** Ancher credits only for the agent writing the shows, about one per show (6 for an edition with 4 stations, a crossover and a bulletin). The voices run on your computer and are free. The key stays in `.env`; the browser never sees it.

Nothing runs on its own: no schedule, no background process. A new edition is made when someone presses the button or types the command. Without a key, the button and `npm run edition` change nothing and explain how to add one. To try the button without a key, start the server with `RADIO_SOURCE=replay npm start`: it rebuilds from the recorded responses.

`npm run edition -- --record` also saves every Ancher response under `engine/fixtures/`, so the same edition can be rebuilt later without a key (`npm run edition:replay`).

### What the engine does, step by step (`engine/build.js`)

1. **Reads your shelves.** Lists your collections and their notes through the official SDK (`@ancher-ai/sdk`). Ancher's built-in `[Sample]` collections and the `Radio` collection are skipped (`radio.config.json`). A collection with fewer than 3 notes becomes a quiet station (static and nothing else) rather than a thin show.
2. **Ancher writes the show.** For each station, Ancher's agent gets a brief (`engine/brief.js`): find the 2–3 strongest connections between these notes, talk to me as "you", 4–7 exact quotes as evidence, end with one question for my next piece of work. Web search is off, so it can only use your library. The same goes for the crossover (the two richest stations) and the "Just saved" bulletin (your newest note).
3. **Checks every quote** (`engine/verify.js`). Each quote must appear word for word in the note's original saved text: the fetched page, the uploaded text, the video's caption track or the post itself, never Ancher's rewritten summary. Auto-captions that repeat every line are cleaned first. A quote that fails is dropped and logged; if it's found in a different note on the same shelf, it's re-attributed.
4. **Prepares it for the ear** (`engine/speech.js`): strips code formatting, says "300ms" as "300 milliseconds", splits `requestAnimationFrame` into words. Only what the voice reads changes; captions and note cards keep the original words.
5. **Voices and mixes it** (`audio/render_episode.py`): a vintage British host for Ancher's lines, different voices for the quotes, a warm valve-radio chain on the host, a narrower "broadcast clip" chain on the quotes, a music bed if one is present, then mastered to -16 LUFS. If an episode's script hasn't changed since the last edition, its audio is reused.
6. **Writes the edition** to `edition/`: `edition.json` plus one folder per episode with `episode.mp3` and `episode.json` (every line, its timing, and for quotes the source note's title, author, site and save date).

If one station fails (a network blip, an unexpected reply), the engine keeps that station's previous episode and carries on.

### Voices

The voices are [Kokoro](https://github.com/thewh1teagle/kokoro-onnx), free and local.

```bash
python3 -m venv .venv
.venv/bin/pip install kokoro-onnx soundfile numpy
mkdir -p models
curl -L -o models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -o models/voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
echo "TTS_PYTHON=.venv/bin/python" >> .env
```

You also need `ffmpeg` (`brew install ffmpeg`). Voicing takes 10–15 seconds per line on an M1, so a full edition of about 80 lines takes around 15–20 minutes.

**Ancher's own voice instead:** `npm run edition -- --voice ancher` (or `"voice": "ancher"` in `radio.config.json`) hands each script to Ancher's podcast engine. The episode is saved as a note in your `Radio` collection and voiced by Ancher. You get no custom radio sound, and the transcript drives the captions.

## Take it on the road

**Take it on the road** (in the programme panel, or `npm run road`) turns tonight's edition into one MP3: every show in dial order, a few seconds of tuning static between them, a chapter per show, and the radio as cover art. About 12 minutes, saved in `exports/`. AirDrop it to your phone or drag it into the Music app, then play it in the car over CarPlay or Bluetooth. It only uses the files already in the edition: no credits, no network.

## Tests

```bash
npm test
```

23 tests, no key and no network needed:

- **Live connection**: the live source runs against a fake Ancher API. It checks Bearer auth, paging, file downloads through minted links, caption cleanup, and that a draft Ancher's reviewer rejected is dropped.
- **Replay**: the demo edition rebuilds from the recorded responses, and every quote verifies.
- **Misquote**: a planted misquote is caught and dropped.
- **No key**: without a key, the engine changes nothing.
- **Road export and safe swap**: the MP3's running order matches the dial, and a failed build leaves the playing edition untouched.
- **Unit tests**: quote checking, speech cleanup, station planning and reply parsing.

## How the radio is built

**No 3D models and no image files.** Every surface is generated in code with Three.js (r186).

| File | What it makes |
| --- | --- |
| `src/textures.js` | Procedural textures: walnut grain, woven speaker cloth with gold threads, brushed aluminium, machined knob tops, the dial face, the note cards. |
| `src/radio.js` | Geometry: cabinet, bezel, cloth and grille bars, faceplate, dial with glass and needle, knurled knobs, pilot lamp, feet, the enamel Ancher badge. |
| `src/studio.js` | An invisible studio of softboxes used only for reflections. It's what makes the chrome and lacquer read as real. |
| `src/main.js` | Scene, lights, bloom, vignette, camera shots, power and needle, the render loop, film-rendering hooks. |
| `src/live.js` | Live mode: loads the edition, lays out the dial, tuning, static, note cards, the camera following the show. |
| `src/player.js` | The sound (Web Audio): episodes, static between stations, knob and switch sounds. |
| `src/ui.js`, `index.html` | Now playing, the programme, progress bar, captions and controls (plain HTML, so they never cost the 3D scene a frame). |
| `src/server.js` | The "New edition" and "Take it on the road" buttons. They hide themselves when the page is served without `serve.py`. |
| `src/quality.js` | Live and film quality modes (below). |
| `serve.py` | Local server (no caching, so changes show up on reload). It runs the engine for the two buttons and saves frames for film renders. |
| `engine/road.js` | The car export: stitches the edition into one chaptered MP3 with ffmpeg. |
| `assets/brand/` | Official Ancher symbol and lockup (used as-is, never redrawn). |

### Performance

Measured on a base M1 MacBook at a 1512×945 window:

| Setting | Frames per second |
| --- | --- |
| original (film) settings | 21–28 |
| without real glass transmission | 54 |
| live mode (default) | **60 on every camera shot** |

The glass dome's real transmission was drawing the whole scene twice per frame. Live mode uses a clear-coated shell that keeps the highlights, caps the resolution at 1.5×, uses a 2048 shadow map, drops depth of field, and anti-aliases inside the post-processing.

The resolution also adapts: if the frame rate falls under 50 (a busy machine), it steps down, and it steps back up once things are smooth. Add `?fps` to the address to see the live frame rate.

**Film mode:** `?mode=film` restores the full-quality settings for rendering videos frame by frame. In that mode `window.__film(t, name)` and `window.__show2(t, name)` pose the radio for time `t` and save a frame through `serve.py`, and `ffmpeg` joins the frames with the audio.

## What's in this repo, and what isn't

| In the repo (public) | Only on your machine (gitignored) |
| --- | --- |
| all code, the engine, the tests | `edition/`: the edition built from your own library |
| `demo-edition/`: three demo stations with audio | `engine/fixtures/`: Ancher responses recorded from your library |
| `engine/demo/`: the recorded responses behind the demo; source texts trimmed to the quoted passages | `.env`: your key and local paths |
| | `exports/`: your road MP3s |
| `radio.config.json` | `audio/sfx*/`: licensed sound effects (the radio falls back to generated static without them) |

`npm run edition:demo` rebuilds the demo edition from `engine/demo/`.

