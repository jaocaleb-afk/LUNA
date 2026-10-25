# LUNA: handoff notes

Written at the end of a build session in a cloud sandbox. Read this first, then `README.md` (file map, how to run, behaviour rules).

## Situation

LUNA is a clock + assistant kiosk page for a Raspberry Pi display. The **new version** lives in `/home/calebj/LUNA-new` and is served on **port 8082**
(`http://192.168.1.97:8082`). The **existing version on port 8081 must not be modified.** Only work under `/home/calebj/LUNA-new`.

The original project was `index.html`, `css/luna.css`, `js/core.js`, `js/app.js`, `Core.test.js`, `UI test.py`. The brief: center the clock, real "Hey LUNA"
voice, hide controls when idle, clear timer controls plus scheduled rules, preserve existing features (backgrounds, settings), test everything,
and never claim a feature works unless it was actually tested. The owner then asked for the code to be broken into short, readable files for code review.
All of that is done in the sandbox. **Nothing has been run on the real Pi yet.**

## State

- Unit tests: `node tests/run-core-tests.js` -> 59/59.
- Browser tests: `python3 tests/run_ui_tests.py` -> 233/233, zero console errors, stable over 3 consecutive runs (Playwright + Chromium, desktop Linux).
- Old `core.js`/`app.js` were deleted. The original test files were replaced by `tests/core/*` and `tests/ui/*` (the original UI checks live on in `tests/ui/test_legacy.py`).
- The deliverable was shipped as `LUNA-new.zip`. It still needs to be unpacked to `/home/calebj/LUNA-new` if that has not happened (check before overwriting anything).

## NOT verified (do these first)

1. **Real Pi + real browser.** Layout at the actual display resolution, tap targets, performance of the background animations.
2. **Voice on real hardware.** The voice tests use a *mock* `SpeechRecognition` (`tests/ui/helpers.py: MOCK_SPEECH`). They prove LUNA's logic only. Open questions:
   - `http://192.168.1.97:8082` is not a secure context, so the browser blocks the mic. Use `http://localhost:8082` on the Pi, or Chromium flag
     `--unsafely-treat-insecure-origin-as-secure=http://192.168.1.97:8082 --user-data-dir=...`.
   - Raspberry Pi OS Chromium often has no access to Google's speech service. Expect `network` / `service-not-allowed`. LUNA reports this honestly.
   - If cloud speech is unusable, the realistic alternative is a local wake-word process (openWakeWord or Porcupine) that triggers LUNA. Not built; needs the owner's decision.
   - Test steps are at the end of `README.md`.
3. **Touch on the real screen.** The "reveal tap must not press the button underneath" logic (`js/app/idle-ui.js`, `SWALLOW_MS = 700`) was only tested with emulated touch.
4. **A real multi-day run** of schedules on the Pi (sleep/wake, NTP clock correction after boot). Logic is unit-tested; the real device is not.

## Architecture in one minute

- No build step, no modules, no dependencies. Files are plain `<script>`s sharing globals. **Load order in `index.html` matters.**
- `js/core/*`: pure logic, no DOM, takes injected clocks/timers/recogniser so tests can fake them. `js/app/*`: wiring to the page. Keep that split.
- Core objects: `Parser`, `createTimerEngine`/`TimerEngine`, `ScheduleTime`, `Schedule`, `createScheduler`, `createIdle`, `VoicePhrases`, `VoiceCore`.
  Page objects: `Settings`, `Nav`, `Clock`, `TimerUI`, `Rules`, `ScheduleRunner`, `ScheduleUI`, `ScheduleEditor`, `Idle`, `VoiceUI`, `Assistant`, etc.
- `main.js` boots each module inside `safe(name, fn)` so one failing module is logged and the rest keep working.
- localStorage keys: `luna.settings.v1`, `luna.bg.v2`, `luna.rules.v1`, `luna.voice.consent.v1`. Everything read back is validated (`Settings` validators, `Schedule.clean`, `BgModel.clean`).

## Behaviour decisions (deliberate; change only if the owner asks)

- Home layout: `#clock` is `position:absolute; inset:0` and centered flex. Everything else (dock, timer badge, voice indicator) overlays it, so nothing can shift the clock. The AM/PM suffix is absolutely positioned so it does not skew centering.
- Idle: dock fades after `idleSec` (default 10 s; 0 = never). Other screens return to the clock after `max(idleSec, 30 s)`. Open dialogs "hold" the countdown. `/#settings` etc. always work.
- Schedules: device-local time only (the clock's display zone setting does NOT affect rules; a warning shows if they differ).
  - Only occurrences after `armedAt` count (set on create / edit / enable).
  - `lastKey` ("YYYY-MM-DD HH:MM") is saved *before* the action runs, so no double fire, including across reloads.
  - Grace window 5 min (`ScheduleTime.GRACE_MS`): later than that is logged as "missed" and not started.
  - A running/paused timer is never replaced (rule is logged "skipped"); a finished one is.
  - Max 20 rules. Only action: `timer.start`.
- Voice: consent dialogs come first. The mic is never opened before Talk or the always-listen consent. "Listening" is only shown after the recogniser reports audio started. Always-listen resumes after reload only if consent exists *and* the browser already holds mic permission.
- A running timer is not persisted across page reload (also true of the original). Rules/settings/backgrounds are.

## Gotchas learned the hard way

- **Test through HTTP, not `file://`.** Chromium intermittently lost localStorage across reloads on `file://` (about 1 run in 4). `run_ui_tests.py` serves the project on a random local port; `LUNA_URL=... ` tests a running server.
- **Fake clock:** `helpers.open_page(clock=...)` installs Playwright's fake clock a few seconds early and freezes at the given time. Use **timezone-aware** datetimes (`helpers.la(...)`); a naive datetime is read as UTC and makes everything 7 hours off.
  `advance(ms)` = time passing normally (every 1 s scheduler tick runs). `jump(ms)` = device slept (only one tick afterwards). Both coerce to `int`; Playwright rejects floats.
- The idle `keydown` listener must be **non-passive** (it calls `preventDefault` to move focus to the revealed dock); the other listeners are passive.
- Timer buttons are rebuilt only when the timer *state* changes, not every 250 ms tick. Rebuilding per tick swallows taps and drops focus.
- With a mouse, a click lands on the element under pointer-*down*, so "reveal tap must not press the button" only fails with **touch** events. `test_idle.py` has a touch case for this; keep it.
- `tests/core/load.js` loads the core files with `vm.runInThisContext` (same realm, so `assert.deepStrictEqual` works on their objects). Add new core files to its `CORE_FILES`/`NAMES` **and** to `index.html`.
- Core tests set `TZ=America/Los_Angeles` (in `harness.js`) so DST cases are deterministic.

## How the tests were validated (repeat when changing behaviour)

Passing is not enough; the tests were mutation-checked. Break the code on purpose and confirm a test fails. Examples that were run, all caught:
remove the `lastKey` dedupe; ignore `armedAt`; infinite grace; claim after firing; overwrite an active timer; remove the reveal-tap swallow (touch); show "listening" while still starting;
open the mic on consent; skip the always-listen consent dialog; offset the clock by 100 px. Restore the file afterwards and re-run.

## Suggested next steps

1. Unpack to `/home/calebj/LUNA-new`, serve on 8082, run both test suites on the Pi's own machine or against `LUNA_URL`.
2. Do the real-device checks above; fix whatever the Pi shows (resolution, touch, voice).
3. Decide voice strategy from the Pi result: push-to-talk only, or a local wake-word helper.
4. Small known polish items (none block use):
   - The toast (up to 5-9 s after a scheduled start) can cover the bottom buttons on the Timer screen visually; it ignores taps (`pointer-events:none`).
   - Optional: persist a running timer across reloads.
   - Remaining long lines (>140 chars) are user-facing sentences, not logic.

## Rules for editing

Keep files small and single-purpose. Put logic in `js/core` with tests, wiring in `js/app`. Don't tell the user a feature is done until a test or a real-device check has shown it. Never touch port 8081 or anything outside `/home/calebj/LUNA-new`.
