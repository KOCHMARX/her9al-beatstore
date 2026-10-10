HER9AL V10.6 — Tribe-layout interactive DJ patch

This version is built from the user's own recording as the visual reference.
It does NOT copy Tribe's proprietary source code.

Replace only:
- app/dj/page.tsx
- app/dj/dj.module.css
- public/ddj-flx4-reference.png
- public/ddj-jog-left.png
- public/ddj-jog-right.png
- public/ddj-knob.png

Install:
1) Copy the contents over HER9AL-GITHUB.
2) git add -A
3) git commit -m "HER9AL V10.6 exact layout interactive DJ"
4) git push origin main

Notes:
- No new SQL required if V10 DJ tables already exist.
- Local MP3/WAV loading works.
- Existing /api/dj/tracks is used when available.
- Jog wheels, knobs, faders, cue, play, sync and 4-beat loop are interactive.
