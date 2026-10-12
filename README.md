# Ancher Radio

A mid-century table radio, built entirely in code, whose stations are your Ancher collections. Turn the dial and the radio plays a show made from what you saved in that collection.

Built with Claude Code (Claude Opus 5.5), with Ancher as the source of everything the radio plays.

## Run it

You need Node (for `npm`) and Python 3.

```bash
npm install
python3 serve.py
```

Open http://localhost:8140.

| Key | Does |
| --- | --- |
| drag | orbit the radio |
| 1–5 | camera shots (hero, dial, knob, speaker cloth, profile) |
| ← → | tune to the previous / next station |
| space | power on / off |
| T | slow sway on / off |
| H | hide the on-screen help |

The live page is the interactive radio. It is **silent**: the shows with voices were rendered to video frame by frame (see "How the demo films were made").

## How it was built

**No 3D models and no image files.** Every surface is generated in code with Three.js (r186):

| File | What it makes |
| --- | --- |
| `src/textures.js` | Procedural textures: walnut grain, woven speaker cloth with gold threads, brushed aluminium, machined knob tops, the dial face and labels. `STATIONS` holds the collection names, colours and dial positions. `createLiveDial` redraws the dial when a station is added. |
| `src/radio.js` | Geometry: cabinet, bezel, cloth and grille bars, faceplate, dial with domed glass and needle, knurled knobs, pilot lamp, feet, the enamel Ancher badge. |
| `src/studio.js` | An invisible studio of softboxes used only for reflections. It's what makes the chrome and lacquer look real. |
| `src/main.js` | Scene, lights, bloom, vignette, depth of field, camera shots, power-on (valves warming), tuning, and the frame-capture hooks for rendering. |
| `src/cards.js` | 3D Ancher note cards that rise out of the speaker during a show. |
| `src/overlay.js`, `src/overlay2.js` | On-air status, subtitles, source cards and the end card, drawn over the frames. |
| `serve.py` | A static server, plus `POST /save` so the page can write rendered frames to disk. |
| `assets/brand/` | Official Ancher symbol and lockup SVGs (used as-is, never redrawn). |

Lighting lessons are in `WORKFLOW.md` (for example, spot lights above ~60 blow everything out; the softbox reflections do most of the work).

## Where Ancher comes in

- **The stations are real collections** from the Ancher library (names and colours from Ancher).
- **What the radio says comes from Ancher:**
  - quotes are pulled from saved notes;
  - the "crossover" between two stations was written by Ancher's own agent (`ask`), connecting two collections;
  - every quote was checked word for word against the saved text with Ancher retrieval (`retrieve_chunks`).
- **A new save** comes on air as its own station ("Just saved").

All of this ran through the Ancher MCP tools inside Claude Code. The data is baked into `audio/script*.json` and `audio/timeline*.json`, so the radio does not call Ancher live yet.

## Audio pipeline (`audio/`)

1. `script.json` / `script2.json`: the show, segment by segment (host lines, quotes, sources, voices).
2. `gen_vo.py`: voices every segment with local, free Kokoro TTS (vintage British voices for v2).
3. `mix.py` / `mix2.py`: radio EQ, valve saturation, slight tape wobble, static beds, idents and sound effects. Writes the final mix plus `timeline*.json`, which holds segment times, needle path, events and the voice envelope.

Generated voice files, mixes and the sound effects (from the HeyGen catalog) are not in the repo, so re-running the mix needs those added back to `audio/sfx/` and `audio/sfx2/`.

## How the demo films were made

`window.__show2(t, name)` poses the camera and overlays for time `t` of `timeline2.json` and saves a frame through `serve.py`. A loop renders every frame at 30 fps, then `ffmpeg` joins them with the mix. Details are in `WORKFLOW.md`.

## Status and next steps

- The look is approved, and demo v2 (48s) is rendered.
- Next is making the content smarter: Ancher's agent finds **connections between notes in the same collection** (tested, with strong results), possibly voiced by Ancher's own podcast engine.
- After that, making it update itself from new saves, so it works as a real station rather than a scripted demo.

`WORKFLOW.md` is the full build log.
