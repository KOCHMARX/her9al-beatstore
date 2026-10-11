HER9AL V15 — DJ STUDIO FROM ZERO

This is a full clean rebuild of /dj, not a patch layered over the older DJ implementations.

Visual method
- The page uses the user's own screenshot of the target page as the exact 1351x630 coordinate reference.
- The full scene scales as one object, so positions do not drift.
- The controller stays at the same reference coordinates.
- Dynamic track info/waveforms replace only the demo areas.
- Third-party page branding is covered and replaced with HER9AL.

Critical fix
- Jog/vinyl wheels now rotate automatically while tracks play.
- Rotation is tied to audio.currentTime using requestAnimationFrame, so it is smooth and stays synchronized.
- Dragging a jog also seeks/scratches the track.

Functional controls
- A/B local audio loading
- real decoded waveform
- play/pause
- cue + stored cue
- jog seek/scratch + automatic rotation
- tempo
- channel faders
- visual moving fader caps
- crossfader + moving cap
- master
- trim
- 3-band EQ
- filter
- beat sync
- loop IN / OUT
- 4 beat loop
- half/double/exit loop
- 8 hot-cue pads per deck
- delay Beat FX and depth

No global CSS changes.
No SQL migration required.

Install:
Copy over:
C:\Users\user\Downloads\HER9AL-GITHUB

Then:
git add -A
git commit -m "HER9AL V15 DJ Studio from zero"
git push origin main
