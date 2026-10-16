# Emmavengers Studio

A CapCut-style video editor that runs in the browser (Chrome on Android first, desktop too). No AI features, no server:
everything happens on the device and works offline.

**Live:** https://emmavengerskidsworld-design.github.io/emmavengers-studio/

## v1 features
- Import videos, photos and sounds from the phone (or drag & drop on desktop)
- Multi-track timeline: main (magnetic) track, overlay tracks, text tracks, audio tracks
- Fixed centre playhead, scroll to scrub, pinch / buttons / ctrl+wheel to zoom
- Tap to select, drag edges to trim, long-press (touch) or drag (mouse) to move / reorder, snapping
- Split at playhead, duplicate, delete, undo / redo (100 steps)
- Per-clip speed 0.25x–4x, volume 0–200 %, photo / text duration, fit / fill, filters
- Text: font, colour, size, outline, background box, alignment; drag / pinch / rotate on the preview
- Adjust: position, scale, rotation, opacity (the renderer already supports keyframes for these)
- Aspect ratio 9:16 (default), 16:9, 1:1 and background colour
- Export 720p / 1080p at 24 / 30 / 60 fps to MP4 (H.264 + AAC, or Opus where AAC encoding is unavailable)
  using WebCodecs + mp4-muxer; frame-exact and usually faster than real time. Real-time MediaRecorder fallback.
- Autosave to IndexedDB (media files + project), offline PWA with automatic update prompt

## Code map
| file | role |
|---|---|
| `js/registry.js` | **extension points**: track kinds, filters, transitions, keyframe props, fonts, colours |
| `js/project.js` | project JSON model + pure edit operations (split, trim, move, …) |
| `js/store.js` | state, undo/redo, autosave |
| `js/render.js` | compositor shared by preview and export (what you see = what you export) |
| `js/player.js` | live preview with `<video>`/`<audio>` elements synced to a master clock, Web Audio gain |
| `js/framesource.js` | export frames: mp4box.js + WebCodecs `VideoDecoder`, `<video>` seeking fallback |
| `js/export.js` | audio mix (OfflineAudioContext) + encoders + MP4 muxer, MediaRecorder fallback |
| `js/timeline.js` | timeline UI and gestures |
| `js/panels.js`, `js/app.js` | sheets, toolbars, export screen, wiring |

Adding a feature = new fields on a clip + an entry in `registry.js` (e.g. a transition with `render(ctx, drawA, drawB, p)`).

## Development
```
python3 tools/build_sw.py          # after ANY change (regenerates sw.js; never edit sw.js by hand)
python3 tests/test_e2e.py          # Playwright + Google Chrome end-to-end test (needs ffmpeg/ffprobe)
```
Vendored: `js/vendor/mp4-muxer.js` (MIT, Vanilagy), `js/vendor/mp4box.all.min.js` (BSD-3, GPAC).
