HER9AL V12 — CLEAN REBUILD

This is a clean replacement for the /dj page.

Visual approach
- Uses the controller image cropped directly from the user's supplied TribeXR screenshot.
- Uses the exact 1351×630 page coordinate system from that screenshot.
- JavaScript scales the entire stage as one unit, so controls do not drift on different screens.
- Jog wheels and knob sprites are cropped from the same controller image.
- Native range controls are fully invisible so no fake white handles appear.
- TribeXR branding is replaced with HER9AL branding.

Functional controls included
- Deck A / Deck B local audio loading
- Play / pause
- Cue and stored cue
- Jog seek/scratch
- Tempo
- Channel faders
- Crossfader
- Master output
- Trim
- High / Mid / Low EQ using Web Audio API
- Filter using Web Audio API
- Beat sync
- Loop IN / OUT
- 4-beat loop
- Loop half / double / exit
- 8 pads per deck
- Hot Cue pad mode
- Beat Jump pad mode
- Pad FX pulse mode
- Echo Beat FX on/off + depth

No global CSS changes.
No SQL migration required.

Install:
Copy the ZIP contents over:
C:\Users\user\Downloads\HER9AL-GITHUB

Then:
git add -A
git commit -m "HER9AL V12 clean DJ rebuild"
git push origin main
