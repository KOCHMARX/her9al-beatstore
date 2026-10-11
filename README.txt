HER9AL V17 — ALL CONTROLS

This is a clean /dj rebuild using the user's clean DDJ-FLX4 photo.

Implemented controls:
- LOAD A / B
- BACK / VIEW
- IN / OUT
- 4 BEAT / EXIT
- CUE/LOOP CALL previous / next
- 1/2X / 2X loop
- MEMORY cue
- BEAT SYNC
- TEMPO RANGE cycle
- CUE / PLAY-PAUSE on both decks
- SHIFT
- Channel CUE 1 / 2 state
- HOT CUE
- PAD FX1
- BEAT JUMP
- SAMPLER
- KEYBOARD
- PAD FX2
- BEAT LOOP
- KEY SHIFT
- 8 performance pads per deck
- SMART CFX
- FX SELECT
- BEAT minus / plus
- AUTO / TAP
- FX ON/OFF
- Tempo faders
- Channel faders
- Crossfader
- TRIM / HI / MID / LOW / FILTER
- MASTER
- FX LEVEL/DEPTH
- Jog seek/scratch
- Automatic jog rotation during playback
- Music Library
- Settings
- Loading screen

Audio:
- Web Audio API
- 3-band EQ
- filter
- delay/echo/filter FX modes
- beat FX timing
- hot cues
- sampler
- beat jump
- beat loop
- key-shift approximation through playback rate
- local WAV / MP3 / M4A
- existing /api/dj/tracks library if present
- decoded waveform for local tracks

Important:
A web browser cannot provide a true separate hardware headphone cue output without an explicitly selected second audio output device. CUE 1 / 2 state is implemented in the UI, but it does not create a separate physical headphone bus automatically.

No SQL migration.
No global CSS changes.
