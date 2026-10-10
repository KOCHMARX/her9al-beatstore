HER9AL V13 — PHOTO LOCKED PRO

This patch is rebuilt from the user's exact high-resolution FLX4 photo.

Visual:
- same controller photo used as the base
- no browser slider handles drawn over the controller
- all click areas are transparent
- jog and knob sprites are cropped from the exact same photo and rotate in place
- top deck strips + dual waveform + studio bar + bottom dock
- actual waveforms are generated from the loaded local audio file

Audio/controls:
- two decks
- local MP3/WAV/M4A loading
- play/pause
- cue + double-click store cue
- jog seek/scratch
- tempo
- channel volume
- crossfader
- master
- trim
- 3-band EQ (low/mid/high)
- filter
- beat sync
- loop IN / OUT
- 4-beat loop
- half/double/exit loop
- 8 pads per deck
- hot-cue mode
- beat-jump mode
- pad-FX mode
- sampler mode
- delay Beat FX + depth
- tap BPM
- responsive without fixed-canvas stretching

No SQL migration.
No global CSS changes.

Install over HER9AL-GITHUB, then:
git add -A
git commit -m "HER9AL V13 photo locked pro DJ"
git push origin main
