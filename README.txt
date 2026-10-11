HER9AL V19 — REFERENCE CALIBRATED

This version was rebuilt after comparing the supplied HER9AL recording against the supplied TribeXR reference recording.

Measured target geometry from the supplied 1588px-wide recording:
- Web DJ design canvas: 1588 x 756
- Top deck/waveform header: 63 px
- Studio bar: 31 px
- Controller source-image transform on the target recording:
  x ≈ 247.7 px
  y ≈ 127.7 px in the full browser recording
  scale ≈ 0.6282 from the 1749x989 clean controller image
- After browser chrome removal, controller top is ≈ 89.7 px.
- Previous HER9AL recording was ≈ 12.2 px too low.

V19 fixes:
- Locks the whole DJ scene to a 1588x756 design canvas and scales it as one unit.
- Uses the user's clean controller image as the untouched visual base.
- Removes all visual knob overlays.
- Only jog platters are overlaid because they must visibly rotate and scratch.
- Adds the blue platter-touch visual seen in the supplied target recording.
- Jog rotation follows audio.currentTime continuously.
- Includes ?debug=1 calibration mode for invisible hit areas; normal users never see it.

Functional controls:
- LOAD / BACK / VIEW
- IN / OUT / 4 BEAT loop
- half / double loop
- beat sync
- tempo range
- play / pause
- cue + stored cue
- shift
- channel cue state
- trim
- high / mid / low EQ
- filter
- master
- FX depth
- tempo faders
- channel faders
- crossfader
- HOT CUE
- PAD FX1
- BEAT JUMP
- SAMPLER
- KEYBOARD
- PAD FX2
- BEAT LOOP
- KEY SHIFT
- 8 pads per deck
- SMART CFX / SMART FADER
- FX SELECT
- beat minus / plus
- AUTO / TAP
- FX ON/OFF
- local MP3/WAV/M4A
- /api/dj/tracks when present
- decoded waveform for local files
- Music Library / Settings
- loading screen

No SQL migration.
No globals.css changes.
