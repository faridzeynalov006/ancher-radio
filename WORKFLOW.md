# Ancher Radio — workflow

A mid-century table radio built entirely in code (Three.js r186, no models, no image files). The stations on the dial are Farid's real Ancher collections. Idea: turn the dial and Ancher plays a show made from that collection.

Status (2026-10-09): **demo v2** rendered, `renders/ancher-radio-demo-v2.mp4` (48s). Awaiting Farid's reaction. Earlier: look test v1 approved ("impressive"). Farid then asked what Ancher actually does here, so **demo v1** was made: an 89s show with real audio, at `renders/ancher-radio-demo-v1.mp4` (and a `-share` copy). Awaiting his reaction.

## What the radio plays (agreed concept)
- **On a station, the show (Create):** a host (af_heart) introduces your saves, and the saves themselves are played as voiced, verbatim quotes with credit. It's not a summary.
- **Between stations, the crossover (Connect):** Ancher's own agent finds the link between two collections (`mcp__ancher__ask`, conversation `01a0fd39-b0b7-7ae2-a79c-bd87ec88b8bf`).
- **Newest save (Capture):** a chime, then the latest thing saved. Demo v1 uses his own Oct 1 LinkedIn post, "Curation-First Planning Tools".
- Every quote is verbatim from Ancher `kind: content` chunks or the saved post text, checked with `retrieve_chunks`. Never use `markdown` chunks as quotes (they're Ancher's rewrite).

## Files
- `src/textures.js`: every surface painted procedurally (walnut, woven cloth with gold threads, brushed metal, machined knob tops, dial face, labels). `STATIONS` holds the collection names and dial angles.
- `src/radio.js`: geometry (cabinet, bezel, cloth and bars, plate, dial + domed glass + needle, knurled knobs, pilot lamp, feet).
- `src/studio.js`: reflection-only studio of softboxes; it drives the chrome and lacquer highlights.
- `src/main.js`: scene, lights, back-wall wash, bloom, vignette, depth of field, camera shots 1–5, power and tuning, `__capture`, `__film`.
- `serve.py`: static server plus `POST /save` for frame capture.
- `renders/`: `ancher-radio-looktest-v1.mp4` (10s, 1080p30) and three stills.

## Running it
macOS blocks the preview server from reading Desktop, so it serves a mirror in the session scratchpad. After edits:
`rsync -a --exclude .claude --exclude node_modules ./ <scratchpad>/radio-serve/`
Launch config `ancher-radio` lives in `~/Desktop/.claude/launch.json` (port 8140). Re-point it if the scratchpad path changes.

Keys: 1–5 cameras, drag to orbit, ← → tune, space power, T sway, H hide the HUD.

## Audio pipeline (`audio/`)
- `script.json`: the segments, voices, quote sources and notes.
- `gen_vo.py`: local Kokoro (`~/.cache/hyperframes/tts`), run with `~/Desktop/Ancher/.tts-venv/bin/python`. Host af_heart; quotes am_michael, am_adam, af_bella.
- `mix.py`: host EQ, a narrower "broadcast clip" EQ and saturation on the quotes, static beds and cues. It writes `mix.wav` and `timeline.json` (segment times, needle path, events, per-frame voice envelope).
- `sfx/`: HeyGen catalog static (`static-tuner`, `static-hiss`), idents (`ident-marimba`, `ident-synth`), plus the approved click and chime from october-10-v3.
- Video: `__show(t, name)` in `main.js` poses the camera from `timeline.json` (quotes go to the speaker cloth, host lines rotate through dial, hero and knob, and tuning gets the tight dial shot). `src/overlay.js` draws the on-air status, subtitles and source cards. Render with a loop over `i/30` to `show_%04d.jpg`, then mux with `audio/mix.wav`. The javascript tool times out at 45s, but loops keep running in the page, so watch the frame count from bash.

## Rendering
- Stills: `__radio.setState({power:1, station:1, sway:-0.3}); __radio.frameShot(__radio.SHOTS[2], true); await __capture('x.png')`. Frames land in `<mirror>/shots/`.
- Clip: loop `await __film(i/30, 'f_0000.png')`, then `ffmpeg -framerate 30 -i f_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16`.
- Capture works even when the pane is hidden (it poses the camera directly; rAF doesn't run in a hidden tab).

## Lessons
- Spot intensities above ~60 blow out everything. The softbox environment does most of the work.
- `anisotropy` on the brushed plate made a row of hot dots along its bevel, so it was removed.
- Bloom threshold is 1.4, so only the pilot lamp blooms. Lower values make the chrome edges sparkle like LEDs.
- Don't redraw or retype the Ancher logo (brand rules). The radio carries no logo yet.

## Next (only if approved)
1. Generate one show with Ancher's podcast feature (`create_note_podcast`) for one collection and check its quality.
2. Sound: real recorded static and a dial click (ask before downloading), then the show.
3. Shot list and edit: valves warming in the dark → walnut pass → finger on the knob → needle lands → pull back.

## Demo v2 (2026-10-09)
Farid's direction: keep the colours, give the radio an Ancher identity (a logo somewhere), use vintage-sounding voices instead of af_heart, and make the short demo impressive.
- **Identity:** an enamel badge on the speaker cloth with the official symbol (from `assets/brand/symbol-light.svg`, drawn from its own path data, Ink on Sand, half-height clear space) in a polished ring; the middle grille bar parts around it. Dial station markers use each collection's real Ancher colour. The end card uses the official white horizontal lockup (`lockup-horizontal-dark.svg`) and the tagline "Everything you kept, put to work."
- **Voices:** HeyGen TTS is out (the free plan has 4 seconds left), so it's local Kokoro with British voices for a wireless feel: host `bm_george` (speed 0.92), quotes `am_fenrir`, `am_echo`, `bf_emma`, `bm_fable`. British voices use `lang='en-gb'`. Processing: band-limited EQ, valve saturation (`asoftclip`), slight tape wobble (`vibrato`), small room (`aecho`). Kokoro reads "Ancher" correctly, so never respell it.
- **Sound:** fresh catalog SFX in `audio/sfx2/` (power click, knob ratchet, wavering bell, static burst), each md5-checked against every earlier Ancher project. Most popular catalog clicks, chimes and paper sounds are already used elsewhere. Plus a 1940s big-band bed (`bigband-bed.mp3`) through radio EQ under the host and the ending.
- **Story beats (45s):** cold open mid-quote, then "A radio that only plays what you saved." Then the host, two note cards rising out of the speaker (Stripe line, Superhuman question), the tuning knob ratchets and the needle wanders, two stations bleed together (q4 and q5 overlap, panned), and an orange thread draws itself on the dial between the two lit stations. Ancher's connection line follows, then a new save flies into the speaker, the dial reprints with a seventh station "Just Saved", the needle swings to it, and your post plays. "Your library. On air." Power off, end card.
- **Files:** `audio/script2.json`, `audio/mix2.py` → `mix2.wav` + `timeline2.json`; `src/cards.js` (3D Ancher note cards), `src/overlay2.js` (opening line, host subtitles, end card), live dial in `textures.js` (`createLiveDial`), `__show2(t, name)` in `main.js`.
- **Render:** start a non-awaited loop in the page (`window.__done` counter), poll the frame count from bash, then `ffmpeg -framerate 30 -i v2_%04d.jpg -i audio/mix2.wav …`.

## Oct 12 tests (`tests/`)
Upper team liked the Radio. Farid wants it pushed past a showcase and as Ancher-heavy as possible, built around **connections between notes in one collection** rather than open-ended "discovery". Free TTS models are fine.
- **Ancher's podcast feature** (`create_note_podcast`, one note per call): asked for 15 min, Ancher set target_minutes 9 and made 6:19. Took about 3 minutes. Two voices, host and expert. MP3 is 24 kHz mono, 64 kbps, −19.4 LUFS. Comes with a timed transcript JSON (start, end, text, role per line), which could drive subtitles and cards. The content is a faithful explainer of that one note. It isn't personal and doesn't connect to other saves; it opens "Welcome back to the show", in the NotebookLM style. Files: `tests/ancher-podcast-pg-dont-scale.*`. No other note had a podcast before this.
- **Connections** via the Ancher agent (`ask`, library only): First 100 Users and Personal Design and Motion each returned 3 sharp connections. Every quote checked verbatim. It flagged the empty Airbnb save on its own. Design and Motion turned Farid's own philosophy note against Emil's rules, and was the best result. See `tests/2026-10-12-connections-*.md`.
- **Data caveats:** YouTube transcript chunks repeat phrases 3 to 6 times, so never voice raw transcript text. Use the agent's clean quotes, checked against the source.
