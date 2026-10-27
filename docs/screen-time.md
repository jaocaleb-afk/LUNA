# Screen Time Timer

A separate timer for limiting screen sessions. It has its own screen (**Screen Time** in the dock, or `/#screentime`),
its own saved data, and its own rules. It is not the ordinary timer: the ordinary timer's buttons and voice
commands cannot pause, stop or cancel it.

## What you see

| On screen | Meaning |
|---|---|
| **Weekday rules** / **Weekend rules** | Which rules apply right now (from today's local date) |
| **Ready** | A session may start now. The **Start 20-minute session** button is shown. |
| **Running** | A session is counting down. It cannot be paused, stopped, shortened or cancelled. |
| **Alert** | The session has ended. An alarm beeps and a full-screen alert with **Dismiss** is shown until Dismiss is pressed. |
| **Cooldown** | A break is required. The big number counts down to the earliest allowed start, and the text gives that time. |
| **Daily Limit Reached** | All 4 weekday sessions are used. The next start is at midnight (or 10 minutes after the last session ended, if that is later). |
| **Blocked** | The saved data could not be trusted, or the device clock reads earlier than the last session. See below. |
| "2 of 4 sessions used today · 2 remaining" | Weekday count. On weekends: "3 sessions started today · no daily limit on weekends". |

The only two buttons the feature has are **Start** (only shown when a session may legally begin) and **Dismiss**
(only shown while the alert is active). There is no pause, stop, cancel, reset, restart, skip or override control,
no keyboard shortcut, URL parameter or setting that changes these rules, and "Restore defaults" does not touch them.
While a session runs, the home screen shows its countdown under the clock area.

## The rules

Every session lasts exactly **20 minutes**. All times are the device's **local** time.

**Monday to Friday**
1. At most **4 sessions per calendar day** (counted by the day a session *started*).
2. A new session may start only when **10 full minutes** have passed since the previous session **ended**.
   Exactly 10:00 after the end is allowed. (Ends 3:00 PM → next start 3:10 PM.)
3. The count resets at **local midnight**, not 24 hours after the first session, and also while the page stays open overnight.
4. A session that crosses midnight runs its full 20 minutes and counts for the day it started. The 10-minute gap still
   applies after it. Example: the 4th session ends at 11:55 PM → the new day's 4 sessions exist from midnight, and the first can start at 12:05 AM.

**Saturday and Sunday**
1. No daily limit (the weekday limit of 4 does not apply).
2. Sessions may follow each other straight away.
3. A session is **back-to-back** when it starts **less than 10 minutes after the previous session ended**.
   After a back-to-back pair, the next session must wait until **10 minutes after the second one ended**.
4. Starting exactly 10:00 after an end is *not* back-to-back, so that session begins a new pair.

Example: 10:00 start → 10:20 end → 10:20 start (back-to-back) → 10:40 end → **cooldown until 10:50** →
10:50 start → 11:10 end → 11:10 start (back-to-back) → 11:30 end → cooldown until 11:40, and so on.

*Interpretation note.* The original brief said "less than 10 minutes after the previous session **started**". Because
sessions last 20 minutes and cannot overlap, that can never happen, so the rule would do nothing. Its worked example
(10:00 start, 10:20 start, then a wait) matches "after the previous session **ended**", which is what is implemented.
This is written down in `js/core/screen-time-policy.js` too. Ask if you meant something else.

**Always**
- Nothing can start while a session runs, or while the end-of-session alert has not been dismissed.
- Dismissing the alert does not refund the session or change any rule.
- Which rules apply is decided by the day it is **now**. Friday's last session ending at 11:55 PM does not stop a
  Saturday session at midnight (weekend rules have no gap after a single session). A back-to-back pair on Sunday
  night means Monday's first session waits for the weekday 10-minute gap.

## Timing and reliability

- The session's end is saved as an **absolute time**. The countdown is always recalculated from the clock, never by
  counting timer callbacks, so a throttled background tab cannot make it wrong. It catches up on the next tick and when the page becomes visible.
- While the page runs, LUNA also uses the browser's **monotonic clock** (`performance.now()`):
  - if the device clock is set **back** during a session, the session still ends after 20 real minutes, and the saved times move to the new clock;
  - if the device **sleeps**, the wall clock is trusted (real time passed), so a session that ended during sleep shows its alert on wake.
- **Reload / reopen**: the state is rebuilt from saved data. A running session continues with its true remaining
  time (never restarting from 20:00). A session that ended while the page was closed shows its alert straight away.
- **Clock earlier than the last session** after a reload (e.g. the clock was moved back, or a Pi without a real-time clock
  booted before getting network time): LUNA cannot know how much time really passed, so it shows **Blocked** and
  allows the next session only once the clock passes that session's end + 10 minutes.
- A web page only runs while the browser keeps it running. If the browser is closed, the tab is discarded or the
  device is off, nothing beeps; the correct state is shown the next time the page opens.

## Saved data

One localStorage key, `luna.screentime.v1`, separate from settings (so Restore defaults keeps it):

```json
{ "v": 1,
  "sessions": [ { "start": 1793023200000, "end": 1793024400000, "dismissed": true } ],
  "lockedUntil": 0,
  "lockReason": "" }
```

`start`/`end` are millisecond timestamps (`end` is always `start` + 20 minutes); `dismissed` records the alert dismissal.
Sessions older than two days are dropped, except the newest two. Nothing personal is stored.

Saved data is validated before use (`js/core/screen-time-storage.js`). If it is unreadable or anything about it is
unexpected (extra fields, wrong session length, overlapping or unsorted sessions, an old alert still pending, an
impossible lock), LUNA does **not** start over with a fresh allowance. It saves a lock until the next local midnight
and shows **Blocked**. If the browser refuses to save, a session is not started at all, because it could not be enforced after a reload.

## Alert and sound

- The alarm starts only when a session actually ends. It beeps every second (square-wave tones), with a flashing full-screen alert.
  Only one alarm loop ever runs. **Dismiss** stops the sound at once.
- The ordinary **Timer sound** setting does not silence it.
- Escape and clicking elsewhere do not dismiss it; only the Dismiss button does.
- Browsers block sound until the person has interacted with the page. If the alert begins without that (for example the
  page was reloaded during the alert), the alert says the sound is blocked, and the first tap anywhere starts it.
  On a dedicated Pi kiosk, Chromium's `--autoplay-policy=no-user-gesture-required` flag removes this restriction.
- If the device has no working audio output, or it is muted, only the visual alert remains.

## Voice and typed commands

- "How much time is left?" / "How much screen time is left?" answers with the Screen Time remaining when a session is running.
- "Cancel that timer", "stop screen time", "pause the timer" and similar are refused for Screen Time:
  "This timer cannot be cancelled. Your Screen Time session ends at 3:20 PM."
- If an ordinary timer is also running, those commands act on the ordinary timer only, and the reply says Screen Time keeps running.
- Sessions cannot be started by voice. Use the Start button.

## Limits (please read)

This is a **timer**, not a lock. It does not stop anyone from using the device. Because it is a web page running on the
device itself, someone who can do any of the following can get around it: clear or edit the browser's site data,
use developer tools, change the device clock or time zone, edit LUNA's files, use another browser or profile, or close
the page. Deleting the saved data cannot be told apart from a first run. Real enforcement needs something the user
cannot change: an operating-system-level kiosk or parental-control setup, or a separate trusted device or server that
keeps the record. LUNA makes the rules hard to break by accident and clear to follow. It does not make bypassing impossible.

## Where the code is

| File | Job |
|---|---|
| `js/core/screen-time-policy.js` | the rules: weekday/weekend, gap, back-to-back, daily limit, midnight |
| `js/core/screen-time-storage.js` | saved-data shape, validation, lock on corrupt data, pruning |
| `js/core/screen-time-timer.js` | the protected session: start, countdown, expiry, dismissal, clock handling (no stop method exists) |
| `js/app/screen-time-store.js` | localStorage read/write with read-back check |
| `js/app/screen-time-alarm.js` | repeating beep (WebAudio) |
| `js/app/screen-time-text.js` | every sentence shown or spoken |
| `js/app/screen-time-ui.js` | screen, home readout, alert overlay; Start and Dismiss buttons |
| `css/screen-time.css` | styles |
| `tests/core/screen-time-*.test.js`, `tests/ui/test_screen_time.py` | tests (fake clocks; no real 20-minute waits) |
