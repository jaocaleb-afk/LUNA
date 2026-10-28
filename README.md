# LUNA (new version)

Clock-first kiosk display with timer, schedules, idle-hiding controls, push-to-talk voice commands with spoken
replies, basic calculations, a protected **Screen Time Timer**, and an optional PIN-protected fullscreen kiosk mode.
Plain HTML/CSS/JS, no build step, no dependencies. Serve the folder with any static web server.

## Run it

```bash
cd /home/calebj/LUNA-new
python3 -m http.server 8082          # port 8081 (the existing version) is never touched
```

- On the Pi's own display, open **`http://localhost:8082`**. `localhost` counts as a secure page, so voice and the exit PIN can work there.
- From another device (e.g. the ChromeOS test machine), plain `http://192.168.1.97:8082` works for the clock, timer,
  schedules, backgrounds and settings, but **not** for voice or the exit PIN: the browser does not treat a plain-http
  LAN address as secure. Use the HTTPS address from [HTTPS on the local network](#https-on-the-local-network) instead:
  `https://192.168.1.97:8443`.

Hard-refresh after copying new files: Ctrl+Shift+R.
If the on-screen controls are hidden and you cannot reveal them, open `…/#settings`
(also `#timer`, `#screentime`, `#schedules`, `#assistant`, `#backgrounds`).

## Controls (sized for the 7-inch touchscreen)

- The home screen has one compact toolbar: **Timer · Screen Time · Schedules · More · Talk**. **More** opens a small menu with
  **Assistant, Backgrounds, Settings** and **Fullscreen**. It closes when you choose an item, tap elsewhere, press Esc, or when
  the controls fade out. At 800×480 the toolbar is a single row (it used to take two rows).
- Every button and field is at least 44×44 px (about 8 mm on an 800×480 7-inch panel), button text at least 14 px.
  Buttons have a small line icon plus a text label; icons are inline SVG, so they do not depend on an emoji font.
- Settings is grouped (Clock; Display and sound; Voice; Spoken replies; Kiosk; PIN), one line per setting with a segmented
  control, and a section bar at the top that jumps to each group and stays visible while scrolling.
- On the Timer screen the minutes/seconds entry and the Start button share one line, so the screen fits 800×480 without scrolling.

Saved data is **per address**: settings, schedules, backgrounds and the PIN saved at `http://localhost:8082` are
separate from those saved at `https://192.168.1.97:8443`. Set things up on the address the display will actually use.

## How the code is organised

Every file has one job and starts with a comment saying what it is. Nothing is bundled; `index.html` loads the files
in dependency order. `js/core/` is pure logic with **no DOM access** (unit-testable in Node). `js/app/` connects it to the page.

```
index.html                  page structure (screens, dialogs, PIN gate, Screen Time alert)
css/luna.css                all styling except:
css/screen-time.css         Screen Time screen, home readout and alert
docs/screen-time.md         Screen Time Timer: rules, storage, alert, limits (read this for that feature)
js/core/                    PURE LOGIC (tested in Node)
  duration-parser.js          "3 hours, 2 minutes and 19 seconds" -> 10939 s; rejects anything ambiguous; reads durations back in words
  arithmetic.js               safe calculator (+ − × ÷, brackets, decimals, negatives, %), no eval(); refuses ÷ 0
  math-request.js             "what is 15 percent of 80?" -> "15% of 80 = 12"; never takes other sentences for sums
  parser.js                   text/voice sentence -> action, by intent  ("set a five minute timer", "how much time is left?")
  timer-engine.js             timer state machine (idle/running/paused/done/ready)
  schedule-time.js            calendar maths: next run, due/missed, local time zone, DST
  schedule.js                 what a rule is: validation, collisions, sanitising stored data, wording
  scheduler.js                one tick: run due rules, never twice, record skipped/missed
  idle.js                     inactivity countdown with "holds" (open dialogs)
  voice-phrases.js            wording of voice problems, each with how to fix it
  voice-session.js            push-to-talk recogniser state machine (honest about "listening")
  pin.js                      exit-PIN rules, salted PBKDF2 hashing (Web Crypto), wrong-PIN limiter
  kiosk-gate.js               fullscreen kiosk modes: normal / kiosk / confirm-exit / locked
  speech-text.js              screen reply -> words for a voice ("25 + 17 = 42" -> "25 plus 17 equals 42.", "LUNA" -> "Luna")
  speech-output.js            spoken replies (text-to-speech): most natural voice, fallback, newest-reply-wins, safe when unsupported
  miss-counter.js             "I didn't catch that." then "Sorry, that command isn't supported." for misunderstood voice commands
  screen-time-policy.js       Screen Time rules: weekday limit + gap, weekend back-to-back rule, local midnight
  screen-time-storage.js      Screen Time saved-data shape and validation (corrupt data locks, never grants)
  screen-time-timer.js        the protected 20-minute session (there is no stop/pause/cancel method)
js/app/                     PAGE CODE
  util.js  settings.js  nav.js  clock.js  sound.js  main.js     shared pieces + start-up
  icons.js                    small inline-SVG line icons for buttons (no emoji font or icon download needed)
  dock-menu.js                the home toolbar's "More" menu (opens/closes; Escape, tap elsewhere, idle)
  timer-ui.js                 Timer screen, home readout, "time's up" alert
  timer-replies.js            what LUNA does/answers for timer commands (ordinary timer + Screen Time questions)
  speech.js                   spoken replies on the page + the Settings "Spoken replies" card
  screen-time-store.js  screen-time-alarm.js  screen-time-text.js  screen-time-ui.js   Screen Time storage / beep / wording / screen
  rules-store.js              saved rules + activity log (localStorage)
  schedule-runner.js          1-second loop; the "start timer" action and conflict policy
  schedule-format.js          words/dates for rule cards
  schedule-ui.js              Schedules screen list
  schedule-editor.js          New/Edit rule form
  idle-ui.js                  hides/reveals controls
  voice-text.js  voice-view.js  voice-ui.js     voice wording / drawing / consent + control
  pin-store.js                the saved PIN hash (its own storage key) + every PIN check
  pin-ui.js                   Settings card: set / change / remove the exit PIN
  kiosk.js                    Fullscreen API wiring, toolbar (More menu) button, Settings card, the PIN gate overlay
  background-*.js  assistant.js  settings-ui.js   existing features
deploy/
  Caddyfile.luna-https        example Caddy site: HTTPS on port 8443 in front of the existing port 8082
tests/
  run-core-tests.js           node tests/run-core-tests.js          (171 unit tests, ~2 s)
  run_ui_tests.py             python3 tests/run_ui_tests.py [name]  (485 browser checks, ~10 minutes)
  core/*.test.js, ui/test_*.py   one test file per module / screen
```

localStorage keys: `luna.settings.v1`, `luna.bg.v2`, `luna.rules.v1`, `luna.voice.consent.v1`, `luna.pin.v1` (PIN hash only),
`luna.kiosk.v1` (true while in kiosk mode, so a reload comes back to the PIN screen), `luna.screentime.v1` (Screen Time sessions;
see `docs/screen-time.md`). Restore defaults resets `luna.settings.v1` and backgrounds only.

## Schedules: how they behave

- Rules start a timer at a local time (device time zone), once / every day / chosen weekdays.
- They only run while this page is open and the device is awake. Nothing runs if the browser is closed or the device is off or asleep.
- A scheduled start never replaces a **running or paused** timer: it is skipped and logged. A **finished** timer is replaced.
- A rule created or enabled after today's time waits for the next occurrence.
- If a time passed while LUNA was closed/asleep: up to 5 minutes late it still starts (and says it was late);
  later than that it is recorded as **missed** and is *not* started.
- An occurrence is saved as "claimed" before the timer starts, so it cannot run twice (even across reloads).
- A running timer is **not** saved across a page reload (this was already true before); rules, settings and backgrounds are.

## Voice commands (push-to-talk)

- Tap **Talk** (home screen or Assistant screen), say a command (see the list below). No wake phrase is needed or used:
  the first full sentence heard is the command. Starting with "LUNA, …" or "Hey LUNA, …" is fine; the name is ignored.
- One tap = one command. The microphone opens for that one sentence and closes again. If nothing is heard for 8 seconds,
  LUNA says "I didn't hear anything" and stops. While it is starting the button says **Cancel**, while listening **Stop**.
- There is no always-listening mode. (Older versions had a "Hey LUNA" wake phrase; it has been removed. Its saved
  setting and consent are deleted automatically on the first load of this version.)
- Voice is off until you turn it on in Settings, after a disclosure: the browser's speech recognition (Chrome/Chromium)
  **sends microphone audio to Google's servers** to turn it into text, so it needs an internet connection. LUNA never records or stores audio.
- LUNA only says "Listening" after the browser reports that audio has really started. A page load never opens the
  microphone or shows a permission prompt; LUNA only *reads* the current permission to explain a blocked microphone.

What has to be true for voice to work, and what LUNA shows when it is not:

| Requirement | If it is missing, LUNA says |
|---|---|
| A **secure page**: `https://` with a certificate the device trusts, or `http://localhost` | "Not a secure page: http://…" and how to fix it; voice cannot be turned on |
| A browser with speech recognition (Chrome on ChromeOS, Chrome/Chromium on desktop) | "This browser has no speech recognition…" |
| Microphone permission for the site (and, on ChromeOS, microphone access allowed in the system's privacy settings) | "Microphone permission is blocked… Site settings → Microphone → Allow" |
| The browser's online speech service reachable | "The browser's speech service could not be reached…" / "refused to start speech recognition…" |
| A microphone | "No microphone was found…" |

Settings → *Voice commands* shows "Secure page: <address>" or "Not a secure page: <address>", so you can check the HTTPS setup from the screen.
Everything that is not voice keeps working when voice is unavailable.

### What you can say

These are examples, not exact phrases: LUNA looks for the intent (set / check / pause / cancel …) and reads the duration
separately, so word order, singular/plural, punctuation, "a"/"an", number words and digits all work. The same commands can be typed in the Assistant box.

| Kind | Examples |
|---|---|
| Start a timer | "Set a timer for 10 minutes." · "Set a 10-minute timer." · "Start a timer for 30 seconds." · "Set a timer for 2 hours." · "Set a 3 hour, 2 minute, 19 second timer." · "Start a countdown for 1 hour and 15 minutes." · "I need a timer for 45 minutes and 12 seconds." · "Give me a five-minute timer." · "Start a timer for 0 hours, 3 minutes, and 5 seconds." · "Set a timer for half an hour." · "…an hour and a half" · "…1.5 hours" · "…5m 30s" |
| Check it | "How much time is left?" · "How long is left on my timer?" · "Check the timer." · "Tell me the remaining time." · "When will my timer finish?" (gives the clock time) · "How much screen time is left?" |
| Control it | "Pause the timer" · "Resume" / "Continue" · "Reset the timer" · "Cancel that timer" / "Stop the countdown" / "Turn off the timer" |
| Calculate | "What is 25 plus 17?" · "Calculate 144 divided by 12." · "What is 8 times 7?" / "8 x 7" · "What is 15 percent of 80?" · "Calculate 12 plus 6 times 3." (= 30, × before +) · "What is 20 minus 35?" · "What is negative 5 times 3?" · "Calculate open bracket 12 plus 6 close bracket times 3" · "What is 3.5 times 2?" |
| Other | "What time is it?" · "Open settings" / "Show the schedules screen" / "Open screen time" · "Go home" |

The confirmation always reads back what LUNA understood, and the timer on screen shows the same duration:
"Set a 3 hour, 2 minute, 19 second timer." → **"Starting a timer for 3 hours, 2 minutes, and 19 seconds."** and 3:02:19.

**Durations LUNA refuses rather than guesses** (it says why, on screen and aloud): a number without a unit ("set a timer for 5",
"5 minutes and 30"), the same unit twice, a range ("10 to 15 minutes"), "1:30" (minutes or hours?), vague amounts
("a few minutes"), fractions other than "half" ("a quarter of an hour"), negative values, decimals that are not whole
seconds ("1.33 minutes"), zero, and anything over 24 hours. Number words are read up to the hundreds ("one hundred and twenty seconds").

**Calculations** show the sum and the answer ("12 + 6 × 3 = 30") and, for voice, say it in words ("12 plus 6 times 3
equals 30."). Standard order of operations; brackets; decimals; negative numbers; "N percent" (= N/100) and "N percent of X".
Answers are rounded to 4 decimal places and marked "≈" / "about" when rounded ("1 ÷ 3 ≈ 0.3333"). Dividing by zero is
explained ("You can't divide by zero, so 10 ÷ 0 has no answer."), never shown as Infinity or NaN. Something that looks like
a sum but cannot be worked out gets "I couldn't work that out…". The calculator only accepts numbers, + − × ÷, brackets,
% and "of"; it never runs the text as code (no `eval`). Limits: answers must be below 10^15; no powers, roots or memory.

### When LUNA does not understand a voice command

| What happened | LUNA says (and shows) |
|---|---|
| 1st voice command in a row that was not understood, or understood but not supported by voice | "I didn't catch that." |
| 2nd in a row | "Sorry, that command isn't supported." — then the count starts again |
| A command LUNA understood and carried out | its normal reply; the count goes back to zero |
| A supported command with a problem LUNA can ask about ("set a timer for 5") | that specific question; counts as understood |
| The browser heard speech but could not make words of it ("no-match"), or marks its own guess as very unsure (confidence below 0.3) | treated as not understood; nothing is run |
| Silence (nothing said) | "I didn't hear anything." — not counted, as no command was given |

Heard text alone is not success: only a command that matches and runs resets the count. Each Talk carries an id, so a
browser that reports one sentence twice is counted once. Typed commands keep their detailed messages
("Unsupported command: …"), because there you can read them.

Parsing limits: English only; ordinals, "dozen", "quarter" and the like are not understood; timers start immediately
(there is no "at 3 PM"); one ordinary timer at a time. Speech recognition may still mishear you, which is why the
duration is read back.

### Spoken replies

When you give a **voice** command, LUNA also says its reply aloud (the same words as on screen), using the browser's
built-in speech synthesis (`speechSynthesis`); no API key or paid service. This is separate from speech *recognition*:
a browser can have one without the other.

- Voice choice (automatic): among the voices for the selected language (Settings → Language), LUNA prefers ones whose
  names mark them as natural-sounding (Natural / Neural / Enhanced / Premium / Piper, then Google's), then the system
  default, then on-device voices; formant voices such as eSpeak only if nothing better exists; joke/effect voices never.
  If none suits, the browser's default voice is used. The voice in use is named in Settings.
- Settings → Spoken replies → **Voice**: "Automatic" or any voice this device has in that language. A hand-picked voice the
  device does not have (for example a setting copied from another computer) falls back to automatic, and the card says so.
- Wording for the ear: the reply on screen is spoken with symbols read as words ("25 + 17 = 42" → "25 plus 17 equals 42."),
  "LUNA" said as a name rather than spelled out, and quotation marks/arrows dropped. Replies are short sentences.
- Rate and pitch are left at the voice's own natural values, except eSpeak, which is slowed slightly (0.9×) because its
  default pace is brisk. Exaggerated pitch or slow speech makes voices sound less human, not more.
- Late voice lists: Chrome loads its voices after the page. The first reply waits for them (at most 1.5 s), then speaks.
- A voice that fails (for example an online voice with no internet) is skipped from then on, and that reply is retried once
  with the next best voice.
- **No voice is guaranteed to sound human.** It depends on the voices installed on the device. On Raspberry Pi OS the
  default eSpeak voices sound robotic; a neural voice such as Piper can be added to speech-dispatcher, but that is a
  system change (not done by LUNA, not tested, and possibly slow on a Pi Zero 2 W).
- Only answers to voice commands are spoken (confirmations, answers, errors, "I didn't hear anything"). Typed commands,
  ticking timers and other screen updates are silent.
- A new reply replaces one still being spoken; replies never queue up. Tapping **Talk** silences LUNA first, so it
  does not talk over you and the microphone does not hear it.
- Settings → **Spoken replies**: On / Off, **Test voice** and the **Voice** choice. Off (or a browser without speech synthesis) means text replies only.
- On Raspberry Pi OS, Chromium usually needs `speech-dispatcher` with a voice such as `espeak-ng` installed to speak at all,
  and those voices sound robotic. Chrome on ChromeOS has built-in voices. Not yet tested on either device.

Chromium's `--unsafely-treat-insecure-origin-as-secure` flag can make a plain-http address count as secure for a quick
**temporary test** on one machine. It is not a fix: it weakens that browser's security and is not used in the instructions below.

## HTTPS on the local network

Goal: `https://192.168.1.97:8443` serves the existing LUNA-new (port 8082) over HTTPS, with a certificate the ChromeOS
device trusts. Changing JavaScript cannot make plain http secure; this needs a separate HTTPS server, which these steps add.
The example uses **Caddy** in front of the existing server. Nothing on ports 8081 (old LUNA), 8082 (LUNA-new), 80, 443 or JaoDrive is changed.

What was checked in the build sandbox (Linux, Caddy 2.10.2, headless Chromium, not your devices): `caddy validate` accepts
`deploy/Caddyfile.luna-https`; Caddy issued a certificate for the IP address; with Caddy's root certificate trusted, the page
loaded over HTTPS with `isSecureContext === true` and Web Crypto available, and the whole browser test suite passed against it;
without trusting the root, Chromium refused it (`ERR_CERT_AUTHORITY_INVALID`); plain `http://<LAN IP>:8082` reported not secure; port 80 was not used.

### 1. On the Pi: check what is already running

```bash
sudo ss -ltnp | grep -E ':(80|443|8081|8082|8443)\b'   # 8443 must be free; note what owns 80/443
systemctl status caddy --no-pager                       # is Caddy already installed/running (e.g. for JaoDrive)?
curl -sI http://127.0.0.1:8082/ | head -1               # LUNA-new must answer here: "HTTP/1.0 200 OK"
```

If 8443 is taken, pick another free port and use it everywhere below.

### 2. Install Caddy (skip if it is already installed)

```bash
sudo apt update && sudo apt install caddy
```

### 3. Add the LUNA site

- **Caddy is already used for something else (e.g. JaoDrive):** do *not* replace its Caddyfile. Back it up and **append**
  the `https://192.168.1.97:8443 { … }` block from `deploy/Caddyfile.luna-https`. Put the two global options
  (`auto_https disable_redirects`, `skip_install_trust`) into the existing `{ … }` block at the top if there is one
  (there may be only one, and it must be first). If the other site relies on HTTP→HTTPS redirects, leave out `auto_https disable_redirects`.
- **Caddy was just installed only for this:** the package's default Caddyfile serves a welcome page on port 80. Back it up and replace it:

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%F)
sudo cp /home/calebj/LUNA-new/deploy/Caddyfile.luna-https /etc/caddy/Caddyfile
```

Then validate and apply:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile   # must print "Valid configuration"
sudo systemctl reload caddy          # or: sudo systemctl restart caddy
sudo ss -ltnp | grep ':8443'         # caddy is listening
sudo ufw status 2>/dev/null | grep -q active && sudo ufw allow 8443/tcp   # only if the ufw firewall is on
```

Keep `python3 -m http.server 8082` running (Caddy forwards to it).

### 4. Get Caddy's root certificate

Caddy creates its own small certificate authority the first time it serves the site. With the Debian/Raspberry Pi OS
package (service user `caddy`) the root certificate is here:

```bash
sudo cp /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt /home/calebj/luna-caddy-root.crt
sudo chown calebj: /home/calebj/luna-caddy-root.crt
openssl x509 -in /home/calebj/luna-caddy-root.crt -noout -subject -fingerprint -sha256   # write the fingerprint down
curl --cacert /home/calebj/luna-caddy-root.crt -sI https://192.168.1.97:8443/ | head -1   # HTTP/2 200 = HTTPS works
```

(If Caddy runs as another user, find it with `sudo find / -path '*pki/authorities/local/root.crt' 2>/dev/null`.)
This is the **public** root certificate: safe to copy. Never copy `root.key`. Only the root needs trusting; Caddy renews the site certificate itself.

### 5. Trust it on the ChromeOS device

1. Copy `luna-caddy-root.crt` to the Chromebook (USB stick, or `scp` into the Linux files folder, or Google Drive).
2. Open `chrome://certificate-manager` (or Settings → Privacy and security → Security → **Manage certificates**).
   - Newer ChromeOS: **Local certificates** → **Custom** → **Import**, choose the file, and allow it to identify websites.
   - Older ChromeOS (`chrome://settings/certificates`): **Authorities** tab → **Import**, choose the file, tick
     **"Trust this certificate for identifying websites"** → OK.
   Labels differ between ChromeOS versions; the result must be a trusted *authority* for websites.
3. Check the imported certificate's SHA-256 fingerprint matches the one from step 4.
4. A school/work-managed Chromebook may not allow importing authorities; then the administrator has to push the
   certificate through the Google Admin console, or test on an unmanaged device.

Do not click through certificate warnings instead: a page reached that way is not a trusted HTTPS page.

(To use the HTTPS address on the Pi's own Chromium too: `sudo apt install libnss3-tools` then
`certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "Caddy Local CA (LUNA)" -i /home/calebj/luna-caddy-root.crt`, and restart Chromium.
Or keep using `http://localhost:8082` on the Pi, which is already secure.)

### 6. Verify on the ChromeOS device

1. Open `https://192.168.1.97:8443`. There must be **no** certificate warning; the site controls by the address show the connection is secure.
2. In LUNA: Settings → *Voice commands* must say **"Secure page: https://192.168.1.97:8443"**.
   The *Exit PIN* card must offer **Set a PIN…** (not "Web Crypto API is unavailable").
3. Optional, if developer tools are allowed: Ctrl+Shift+J, type `isSecureContext` → `true`.

## Fullscreen kiosk mode and the exit PIN

**Set up** (Settings → *Exit PIN*): **Set a PIN…**, type 4–8 digits twice. *Change PIN…* and *Remove PIN…* need the current PIN.
The card says plainly when **no PIN is set: exit protection is NOT active**.

**Use**: **More → Fullscreen** on the home toolbar (or Settings → *Kiosk mode*) enters fullscreen. Then:

- LUNA's own **Exit fullscreen** button asks for the PIN first. Wrong PIN: stays fullscreen with an error. Cancel: stays fullscreen.
- If fullscreen ends any other way (Esc, the browser's exit-fullscreen control, a reload), LUNA covers the whole screen with
  a PIN screen. The controls behind it are disabled (inert). It offers the PIN (keyboard or on-screen keypad) or
  **Return to fullscreen**. Browsers only allow fullscreen after a tap, so that button may need a second tap; LUNA says so if the browser refuses.
- A reload while in kiosk mode comes back to the PIN screen. After 5 wrong PINs, entry pauses for 30 s (then 60 s, … up to 5 min). It never locks permanently.
- In Chrome, LUNA also asks the browser to require *holding* Esc to leave fullscreen (Keyboard Lock); where that is unavailable, a single Esc press exits fullscreen and LUNA shows the PIN screen.

**How the PIN is stored**: only a salted PBKDF2-SHA256 hash (600,000 iterations, 16-byte random salt, Web Crypto), in its own key
`luna.pin.v1`. Setting, changing or removing it does not touch settings, schedules or backgrounds, and *Restore defaults* keeps it.
Web Crypto only exists on secure pages, so on plain `http://192.168…` LUNA refuses to set a PIN and explains why; it never stores a PIN in plain text.
Hashing deliberately takes a moment ("Checking…"); on a Raspberry Pi it may take a second or two.

**Forgot the PIN?** Clear this site's data in the browser (site settings → Delete data). That removes the PIN *and* everything else LUNA saved for that address.

### Limits: this is not a locked-down kiosk

A web page cannot stop the browser or the device from doing what it is told. The PIN protects **LUNA's own screen**, not the device:

- The browser can always leave fullscreen (Esc, its controls, F11, menus). LUNA only notices afterwards (`fullscreenchange`) and covers itself.
  It cannot keep the browser's tabs and address bar hidden.
- Anyone can close the tab or window, open a new tab, use OS shortcuts, sign out, or restart the device. None of these need the PIN.
- Someone with access to the browser's developer tools or site settings can delete the stored PIN hash or all site data.
- A short numeric PIN can be guessed by someone who copies the stored hash; the hashing slows that down but does not prevent it. Do not reuse an important PIN.
- If F11/browser fullscreen is used instead of LUNA's button, LUNA is not in kiosk mode and cannot protect anything.

For real enforcement, use the device's kiosk features as well: on ChromeOS, a managed kiosk app or kiosk policies from the
Google Admin console; on the Raspberry Pi, start Chromium with `--kiosk` (no browser UI) under a dedicated user account.

## Screen Time Timer

A separate, protected 20-minute session timer (home toolbar → **Screen Time**). Full rules, storage, alert behaviour and limits are
in **[docs/screen-time.md](docs/screen-time.md)**. In short:

- **Weekdays:** up to 4 sessions per local calendar day, each followed by a 10-minute gap (measured from when the session
  ended). The count resets at local midnight.
- **Weekends:** no daily limit; after two back-to-back sessions (the second started less than 10 minutes after the first
  ended), the next waits until 10 minutes after the second ended.
- A running session cannot be paused, stopped, shortened or cancelled. There is no control for it, and the ordinary timer's
  buttons and voice commands cannot reach it. When it ends, an alarm beeps until **Dismiss** is pressed. Dismissing refunds nothing.
- State survives reloads and is recalculated from saved timestamps. Corrupt or edited data locks starting until midnight rather than granting sessions.
- It is a timer, not a lock: anyone who can change browser data, the clock or LUNA's files can get around it (see the doc).

## Run the tests

```bash
node tests/run-core-tests.js                      # unit tests, no browser needed

pip install playwright && playwright install chromium
python3 tests/run_ui_tests.py                     # all browser tests (starts its own local server)
python3 tests/run_ui_tests.py kiosk               # one group: legacy layout idle timer schedules schedule_run voice speech assistant compact screen_time pin kiosk
LUNA_URL=https://192.168.1.97:8443/index.html python3 tests/run_ui_tests.py   # against a running server (here: the HTTPS one)
```

The browser tests move a **simulated clock**, so "9:00 AM" and a 5-minute idle timeout run in milliseconds.

### What the automated tests do and do not prove

- **Voice** tests use a **mock** speech recogniser. They prove LUNA's logic: consent first, one session per tap, honest
  "listening" state, commands without a wake phrase, silence/timeout, stop/cancel, every error message, insecure-page
  rejection without touching the microphone, unsupported browsers, blocked permission, and that all other features work
  without voice. They do **not** prove that a real microphone or Google's speech service works on your device.
- **Fullscreen** tests use headless Chromium's **real** Fullscreen API (clicks provide the user gesture). Automation cannot
  press the browser's own Esc/exit control, so a script calls `document.exitFullscreen()` as a stand-in: the page gets the
  same `fullscreenchange` event, but the real browser control is only covered by the manual check below.
- **Spoken replies** use a **mock** `speechSynthesis` that records what LUNA says and keeps a real queue. They prove: what is
  said, that it matches the screen, newest-reply-wins, Talk silences LUNA, the off switch, voice choice/fallback, and no crash
  without speech synthesis. One check also runs the real headless-Chromium `speechSynthesis` for errors. Nothing was *heard*.
- **Calculations** are unit-tested in Node (`arithmetic.test.js`: + − × ÷, precedence, brackets, decimals, negatives,
  percentages, malformed input, letters/code refused, division by zero, size limits; plus every example request from the brief)
  and end-to-end typed and spoken (`test_assistant.py`).
- **Misunderstood commands**: the counter (`miss-counter.test.js`), the recogniser's no-match / low-confidence / one-command-per-Talk
  handling (`voice-session.test.js`) and the full spoken sequence through the mock recogniser (`test_assistant.py`).
- **Compact layout** (`test_compact.py`): toolbar on one row and clear of the clock at 800×480, no horizontal scrolling at four sizes,
  every visible control ≥ 44×44 px and text ≥ 14 px on every screen at 800×480 and 480×800, the More menu (open, Esc, tap elsewhere,
  choose, idle, keyboard), segmented settings with `aria-pressed`, the section bar. Measured in headless Chromium, not on the panel.
- **Command parsing** is unit-tested in Node (`duration-parser.test.js`, `parser-commands.test.js`: every example from the brief,
  zero components, number words, singular/plural, rejected inputs, limits) and end-to-end through the mock recogniser.
- **Screen Time** core tests use injected fake wall and monotonic clocks (delayed callbacks, reloads, midnight, DST, clock set back,
  device sleep, corrupt data, failed saves). Browser tests use Playwright's fake clock in the real page, with earlier sessions
  seeded into storage so no test waits real minutes. The alarm loop is checked by counting beep groups; whether it is audible is not testable here.
- **PIN** tests run the real Web Crypto PBKDF2 code in Node and in Chromium, and check what is actually written to localStorage.
- Insecure pages are simulated in the default run by overriding `isSecureContext` / `crypto.subtle`. Run the suite with
  `LUNA_URL` against the real HTTPS address to also test the real secure context.

## Real-device checks (not automated; do these on the ChromeOS device and on the Pi)

**Voice (ChromeOS, after the HTTPS steps):**
1. Open `https://192.168.1.97:8443`. Settings shows "Secure page: https://…".
2. Settings → **Turn voice on…** → agree. Home → **Talk**. Chrome asks for the microphone: Allow.
3. Say "set a two minute timer". Expected: "Listening…" appears only once the mic is live, then a 2:00 timer starts and the response shows.
4. Tap Talk and stay silent: after about 8 s, "I didn't hear anything", and the microphone indicator in Chrome goes away.
5. Tap Talk, then Stop: the microphone closes at once.
6. Site settings → Microphone → Block, reload: LUNA explains the blocked permission. Set it back to Allow.
7. If you see "speech service could not be reached" / "refused to start speech recognition": the browser cannot use cloud speech here (offline, policy, or no service). Typed commands still work.

**Fullscreen and PIN (ChromeOS, and the Pi's display):**
1. Set a PIN. Tap **More → Fullscreen**. Tap **Exit fullscreen**: the PIN prompt appears; a wrong PIN keeps fullscreen; the right one exits.
2. Enter fullscreen again and press **Esc** (on Chrome you may need to hold it). Expected: fullscreen ends and the LUNA PIN screen covers everything.
3. On the PIN screen: tap **Return to fullscreen** (tap again if the browser refuses). Then exit with the browser's own control and unlock with the right PIN.
4. In kiosk mode, reload (Ctrl+R): the PIN screen is shown after the reload.
5. On the Pi's touchscreen: the on-screen keypad works with taps, and the first tap is not lost when the controls had faded.

**Spoken replies (ChromeOS and the Pi):**
1. Settings → Spoken replies: note the voice named and the list under **Voice**. Tap **Test voice**: you should hear
   "Hi, I'm Luna. This is how I sound." (said "Luna", not spelled out). Try another voice from the list and compare.
   On the Pi, if nothing is heard: `sudo apt install speech-dispatcher espeak-ng`, restart Chromium, and try again.
2. Voice on → Talk → "set a 3 hour, 2 minute, 19 second timer": LUNA says "Starting a timer for 3 hours, 2 minutes, and 19 seconds." and the readout shows 3:02:19.
3. "How much time is left?": the spoken answer matches the readout. Then tap Talk while LUNA is speaking: it stops at once.
4. Spoken replies → Off: commands still show their reply, silently.

**Calculations and misunderstood commands (ChromeOS, voice on):**
1. "What is 25 plus 17?" → shows "25 + 17 = 42", says "25 plus 17 equals 42." Try "Calculate 12 plus 6 times 3" (30),
   "What is 15 percent of 80?" (12), "What is 20 minus 35?" (−15, said "negative 15"), "What is 10 divided by zero?" (explained).
   Note how Chrome writes what you said (digits, "+", "x"…) in the bubble; if a form is not understood, report the exact text.
2. Say something LUNA does not do ("what's the weather"): "I didn't catch that." Say another: "Sorry, that command isn't supported."
   A third: "I didn't catch that." again. Then a real command works, and the next miss starts at "I didn't catch that."
3. Mumble or cough after tapping Talk: expect "I didn't catch that." (Chrome's "no match"), not an error, and nothing happens.

**Compact controls (the Pi's 7-inch touchscreen):**
1. Home: the toolbar is one row; every button is easy to hit with a fingertip, without hitting its neighbour.
2. More → each item opens its screen; tapping beside the menu closes it; it is gone after the controls fade.
3. Settings: the section bar stays at the top while scrolling; each section button jumps there; segmented choices are easy to tap.
4. Timer: minutes, seconds and Start fit on one line, with no scrolling.

**Screen Time (on the Pi's display):**
1. Start a session. Confirm there is no way to pause/stop it from the screen, the Timer screen, or by voice ("cancel that timer").
2. Let it finish (or test with patience): the alarm must be clearly audible and continue until Dismiss. Dismiss silences it at once.
3. Reload during the alert: the alert returns. If the browser blocks sound, the alert says so; one tap starts the beeping.
4. Check the cooldown time shown, the 4-session weekday limit, and (overnight) the reset at midnight.
5. After a reboot without network, if the clock is wrong, expect **Blocked** until the clock is correct.

**Pi display (unchanged from before):** layout at the real resolution, tap targets, background animation performance, and a multi-day run of schedules.
