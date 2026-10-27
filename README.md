# LUNA (new version)

Clock-first kiosk display with timer, schedules, idle-hiding controls, push-to-talk voice commands and an
optional PIN-protected fullscreen kiosk mode.
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
(also `#timer`, `#schedules`, `#assistant`, `#backgrounds`).

Saved data is **per address**: settings, schedules, backgrounds and the PIN saved at `http://localhost:8082` are
separate from those saved at `https://192.168.1.97:8443`. Set things up on the address the display will actually use.

## How the code is organised

Every file has one job and starts with a comment saying what it is. Nothing is bundled; `index.html` loads the files
in dependency order. `js/core/` is pure logic with **no DOM access** (unit-testable in Node). `js/app/` connects it to the page.

```
index.html                  page structure (screens, dialogs, PIN gate)
css/luna.css                all styling
js/core/                    PURE LOGIC (tested in Node)
  parser.js                   text/voice sentence -> action  ("set a five minute timer")
  timer-engine.js             timer state machine (idle/running/paused/done/ready)
  schedule-time.js            calendar maths: next run, due/missed, local time zone, DST
  schedule.js                 what a rule is: validation, collisions, sanitising stored data, wording
  scheduler.js                one tick: run due rules, never twice, record skipped/missed
  idle.js                     inactivity countdown with "holds" (open dialogs)
  voice-phrases.js            wording of voice problems, each with how to fix it
  voice-session.js            push-to-talk recogniser state machine (honest about "listening")
  pin.js                      exit-PIN rules, salted PBKDF2 hashing (Web Crypto), wrong-PIN limiter
  kiosk-gate.js               fullscreen kiosk modes: normal / kiosk / confirm-exit / locked
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
  pin-store.js                the saved PIN hash (its own storage key) + every PIN check
  pin-ui.js                   Settings card: set / change / remove the exit PIN
  kiosk.js                    Fullscreen API wiring, dock button, Settings card, the PIN gate overlay
  background-*.js  assistant.js  settings-ui.js   existing features
deploy/
  Caddyfile.luna-https        example Caddy site: HTTPS on port 8443 in front of the existing port 8082
tests/
  run-core-tests.js           node tests/run-core-tests.js          (80 unit tests, ~1 s)
  run_ui_tests.py             python3 tests/run_ui_tests.py [name]  (323 browser checks, a few minutes)
  core/*.test.js, ui/test_*.py   one test file per module / screen
```

localStorage keys: `luna.settings.v1`, `luna.bg.v2`, `luna.rules.v1`, `luna.voice.consent.v1`, `luna.pin.v1` (PIN hash only),
`luna.kiosk.v1` (true while in kiosk mode, so a reload comes back to the PIN screen).

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

- Tap **Talk** (home screen or Assistant screen), say a command ("set a five minute timer", "what time is it",
  "pause the timer", "open settings"). No wake phrase is needed or used: the first full sentence heard is the command.
- One tap = one command. The microphone opens for that one sentence and closes again. If nothing is heard for 8 seconds,
  LUNA says "I didn't catch a command" and stops. While it is starting the button says **Cancel**, while listening **Stop**.
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

**Use**: the dock's **Fullscreen** button (or Settings → *Kiosk mode*) enters fullscreen. Then:

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

## Run the tests

```bash
node tests/run-core-tests.js                      # unit tests, no browser needed

pip install playwright && playwright install chromium
python3 tests/run_ui_tests.py                     # all browser tests (starts its own local server)
python3 tests/run_ui_tests.py kiosk               # one group: legacy layout idle timer schedules schedule_run voice pin kiosk
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
- **PIN** tests run the real Web Crypto PBKDF2 code in Node and in Chromium, and check what is actually written to localStorage.
- Insecure pages are simulated in the default run by overriding `isSecureContext` / `crypto.subtle`. Run the suite with
  `LUNA_URL` against the real HTTPS address to also test the real secure context.

## Real-device checks (not automated; do these on the ChromeOS device and on the Pi)

**Voice (ChromeOS, after the HTTPS steps):**
1. Open `https://192.168.1.97:8443`. Settings shows "Secure page: https://…".
2. Settings → **Turn voice on…** → agree. Home → **Talk**. Chrome asks for the microphone: Allow.
3. Say "set a two minute timer". Expected: "Listening…" appears only once the mic is live, then a 2:00 timer starts and the response shows.
4. Tap Talk and stay silent: after about 8 s, "I didn't catch a command", and the microphone indicator in Chrome goes away.
5. Tap Talk, then Stop: the microphone closes at once.
6. Site settings → Microphone → Block, reload: LUNA explains the blocked permission. Set it back to Allow.
7. If you see "speech service could not be reached" / "refused to start speech recognition": the browser cannot use cloud speech here (offline, policy, or no service). Typed commands still work.

**Fullscreen and PIN (ChromeOS, and the Pi's display):**
1. Set a PIN. Tap **Fullscreen**. Tap **Exit fullscreen**: the PIN prompt appears; a wrong PIN keeps fullscreen; the right one exits.
2. Enter fullscreen again and press **Esc** (on Chrome you may need to hold it). Expected: fullscreen ends and the LUNA PIN screen covers everything.
3. On the PIN screen: tap **Return to fullscreen** (tap again if the browser refuses). Then exit with the browser's own control and unlock with the right PIN.
4. In kiosk mode, reload (Ctrl+R): the PIN screen is shown after the reload.
5. On the Pi's touchscreen: the on-screen keypad works with taps, and the first tap is not lost when the controls had faded.

**Pi display (unchanged from before):** layout at the real resolution, tap targets, background animation performance, and a multi-day run of schedules.
