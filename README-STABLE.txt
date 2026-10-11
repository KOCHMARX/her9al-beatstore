HER9AL V20 STABLE

This build is based on V19.1 and includes the viewport-scaling hotfix.

Additional production hardening:
- removed debug calibration mode from the normal build
- safer audio play handling
- safer jog seek duration checks
- preserves the fixed 1588x756 reference canvas scaling
- no global CSS changes
- no SQL migration required

Important:
No software build can truthfully be guaranteed to have literally zero bugs without live testing in the target deployment/browser.
This is the cleanest/stablest packaged build from the current HER9AL DJ implementation and fixes the tiny-page scaling bug shown in the last screenshot.
