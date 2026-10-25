# LUNA (new version)

Clock-first kiosk display with timer, schedules, idle-hiding controls and experimental voice.
Plain HTML/CSS/JS, no build step, no dependencies. Serve the folder with any static web server.

## Run it

```bash
cd /home/calebj/LUNA-new
python3 -m http.server 8082          # port 8081 (the existing version) is never touched
```

Open `http://192.168.1.97:8082` on the Pi display (hard-refresh after copying new files: Ctrl+Shift+R).

If the on-screen controls are hidden and you cannot reveal them, open `http://192.168.1.97:8082/#settings`
(also `#timer`, `#schedules`, `#assistant`, `#backgrounds`).

## How the code is organised

Every file has one job and starts with a comment saying what it is. Nothing is bundled; `index.html` loads the files
in dependency order. `js/core/` is pure logic with **no DOM access** (unit-testable in Node). `js/app/` connects it to the page.

```
index.html                  page structure (screens, dialogs)
css/luna.css                all styling
js/core/                    PURE LOGIC (tested in Node)
  parser.js                   text/voice sentence -> action  ("set a five minute timer")
  timer-engine.js             timer state machine (idle/running/paused/done/ready)
  schedule-time.js            calendar maths: next run, due/missed, local time zone, DST
  schedule.js                 what a rule is: validation, collisions, sanitising stored data, wording
  scheduler.js                one tick: run due rules, never twice, record skipped/missed
  idle.js                     inactivity countdown with "holds" (open dialogs)
  voice-phrases.js            "Hey LUNA" matching + error wording
  voice-session.js            speech-recogniser state machine (honest about "listening")
js/app/                     PAGE CODE
  util.js  settings.js  nav.js  clock.js  sound.js  main.js     shared pieces + start-up
  timer-ui.js                 Timer screen, home readout, "time's up" alert
  rules-store.js              saved rules + activity log (localStorage)
  schedule-runner.js          1-second loop; the "start timer" action and conflict policy
  schedule-format.js          words/dates for rule cards
  schedule-ui.js              Schedules screen list
  schedule-editor.js          New/Edit rule form
  idle-ui.js                  hides/reveals controls
  voice-text.js  voice-view.js  voice-ui.js     voice wording / drawing / consent + control
  background-*.js  assistant.js  settings-ui.js   existing features (moved, tidied)
tests/
  run-core-tests.js           node tests/run-core-tests.js          (59 unit tests, ~1 s)
  run_ui_tests.py             python3 tests/run_ui_tests.py [name]  (233 browser checks)
  core/*.test.js, ui/test_*.py   one test file per module / screen
```

## Run the tests

```bash
node tests/run-core-tests.js                      # unit tests, no browser needed

pip install playwright && playwright install chromium
python3 tests/run_ui_tests.py                     # all browser tests (starts its own local server)
python3 tests/run_ui_tests.py schedule_run        # one group: legacy layout idle timer schedules schedule_run voice
LUNA_URL=http://192.168.1.97:8082/index.html python3 tests/run_ui_tests.py layout   # against a running server
```

The browser tests move a **simulated clock**, so "9:00 AM" and a 5-minute idle timeout run in milliseconds.
Voice tests use a **mock** speech recogniser. See the limits below.

## Schedules: how they behave

- Rules start a timer at a local time (device time zone), once / every day / chosen weekdays.
- They only run while this page is open and the device is awake. Nothing runs if the browser is closed or the device is off or asleep.
- A scheduled start never replaces a **running or paused** timer: it is skipped and logged. A **finished** timer is replaced.
- A rule created or enabled after today's time waits for the next occurrence.
- If a time passed while LUNA was closed/asleep: up to 5 minutes late it still starts (and says it was late);
  later than that it is recorded as **missed** and is *not* started.
- An occurrence is saved as "claimed" before the timer starts, so it cannot run twice (even across reloads).
- A running timer is **not** saved across a page reload (this was already true before); rules, settings and backgrounds are.

## Voice: what is and is not possible

- **Push-to-talk (Talk button)** is the dependable mode. **"Hey LUNA" always-listening is experimental.**
- Browsers have no on-device wake-word detection. The only option available to a web page is the browser's speech
  recognition, which in Chromium/Chrome **streams microphone audio to Google's servers**. LUNA says so and asks
  consent before turning voice on, and again (stronger wording) before always-listening. Nothing opens the microphone before the person taps Talk or agrees.
- LUNA only says "Listening" once the browser reports that audio has started, and shows "not verified" until it has really heard "Hey LUNA".
- The microphone needs a **secure page**. `http://192.168.1.97:8082` is *not* secure, so Chromium will block it.
  Either open `http://localhost:8082` on the Pi itself, or start Chromium with
  `--unsafely-treat-insecure-origin-as-secure=http://192.168.1.97:8082 --user-data-dir=/tmp/luna-profile`.
- Chromium builds shipped for Raspberry Pi OS commonly cannot reach Google's speech service at all, in which case LUNA reports the
  error instead of pretending. **This has not been tested on your Pi.** Test it there (steps below).
- Practical alternative if the browser route does not work: a small local wake-word program on the Pi
  (for example openWakeWord or Porcupine) that triggers LUNA. That is a separate piece of software and is not included.

## Check voice on the Pi (5 minutes)

1. Open LUNA on the Pi (use `http://localhost:8082` or the flag above). Settings -> **Turn voice on...** -> agree.
2. Assistant screen -> **Talk**. The browser asks for the microphone: Allow. Say "set a two minute timer".
   - Works: a 2:00 timer starts and the response shows on screen.
   - "speech service could not be reached" / "blocked": the Pi's Chromium cannot use cloud speech; use typed commands or the alternative above.
3. Only if step 2 works: Settings -> **Always listen for "Hey LUNA"** -> agree. Say "Hey LUNA, what time is it".
   The status should change from "not verified yet" to "heard it at least once".
