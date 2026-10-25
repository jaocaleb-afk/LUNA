# LUNA: project rules for Claude Code

Read `HANDOFF.md` first (state, what is unverified, gotchas), then `README.md` (file map, behaviour).

- Work only under `/home/calebj/LUNA-new`. The existing version on port 8081 must never be modified. The new version is served on port 8082.
- No build step, no dependencies, plain `<script>` globals. Script order in `index.html` matters. New core files must also be added to `tests/core/load.js`.
- Logic goes in `js/core/` (no DOM, injectable clocks, unit-tested). Page wiring goes in `js/app/`. Keep files short and single-purpose, with a header comment.
- Tests: `node tests/run-core-tests.js` and `python3 tests/run_ui_tests.py [group]`. Run both before saying anything is done. UI tests need Playwright + Chromium.
- When you change behaviour, break it on purpose once to confirm a test fails (mutation check), then restore it.
- Do not claim a feature works unless a test or a real-device check showed it. Voice has only been tested with a mock recogniser, not on the Pi.
