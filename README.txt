HER9AL V16 — DJ STUDIO PRO, CLEAN REBUILD

Built from the user's clean DDJ-FLX4 image, not from a page screenshot.

Visual
- Clean 4K-upscaled controller asset generated from the supplied controller photo
- Professional dark/blue waveform interface inspired by the supplied reference layout
- Controller stays visually clean: interaction zones are transparent
- Rotating controls are cropped from the exact same controller image
- Loading screen for the DJ controller

Functional
- Account-only DJ page
- Deck A/B
- Local MP3/WAV/M4A
- Existing /api/dj/tracks library when available
- Real decoded waveform for local tracks
- Play / Pause
- CUE + stored CUE
- Automatic jog/vinyl rotation linked to currentTime
- Jog scratch/seek
- Tempo
- Channel faders
- Crossfader
- Master
- Trim
- LOW / MID / HI EQ through Web Audio API
- Filter
- Beat Sync
- Loop IN / OUT
- 4-beat loop
- Half / Double / Exit loop
- Hot Cue / Pad FX / Beat Jump / Sampler pads
- Beat FX delay + depth
- Music Library drawer
- Settings drawer
- Moving fader cap sprites from the same controller image
- Responsive desktop/mobile layout

No global CSS changes.
No SQL migration required if the existing DJ table/API already exists.
Local file loading works without the DJ table.

Install:
Copy this ZIP over:
C:\Users\user\Downloads\HER9AL-GITHUB

Then:
git add -A
git commit -m "HER9AL V16 DJ Studio Pro clean rebuild"
git push origin main
