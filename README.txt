HER9AL V18 — GEOMETRY CALIBRATED

This build was recalibrated against the two recordings supplied on 2026-10-11.

Important fixes vs V17:
- Target site's waveform/header is ~63 px, not 96 px.
- Studio bar is ~31 px.
- Controller is ~69% of the 1588px viewport in the supplied Tribe recording.
- Prior builds used coordinates from the wrong crop. V18 maps controls against the actual clean 1749x989 controller image.
- All mixer knob visual overlays were REMOVED. They were the source of duplicated/broken-looking knobs.
- The clean 4K controller image remains untouched.
- Mixer controls use invisible drag zones.
- Only the two jog platters are visually overlaid because they need to visibly rotate/scratch.
- Jog positions/radii were calibrated from the clean image itself (left center ≈ 304,425; right ≈ 1444,426; radius ≈ 258).

Functional:
Deck A/B, local audio, /api/dj/tracks, waveform, play/pause, cue, jog rotation/scratch,
loops, sync, tempo ranges, pads, pad modes, tempo, channel volume, crossfader,
trim, 3-band EQ, filter, master, delay/echo/filter FX, tap BPM, music library/settings.

No SQL migration.
No globals.css modifications.
