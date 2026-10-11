HER9AL V19.1 SCALE HOTFIX

Fixes the tiny DJ Studio rendering caused by the unsupported CSS expression:
scale(min(calc(100vw / 1588), calc(100vh / 756)))

The page now calculates:
scale = min(window.innerWidth / 1588, window.innerHeight / 756)
in React and updates it on resize.

Result:
- 1588x756 reference canvas fills the browser correctly
- controller returns to the intended size
- hitboxes stay aligned because the entire reference canvas scales together

Replace V19 with this hotfix.
