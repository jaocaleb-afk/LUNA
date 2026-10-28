"""Screen Time Timer in the real page, with Playwright's fake clock (no real 20-minute waits).
Checks the controls offered, the weekday and weekend rules, reloads, the alert and alarm, corrupt data,
and independence from the ordinary timer and its voice/typed commands."""
import json
from helpers import go, open_page, la, advance, jump

SETTINGS = {'idleSec': 0}
MIN = 60000
KEY = 'luna.screentime.v1'
FORBIDDEN = ('pause', 'stop', 'cancel', 'reset', 'restart', 'override', 'skip', 'end session', 'add time')


def page(browser, r, clock, storage=None, settings=SETTINGS):
    ctx, pg = open_page(browser, r, settings=settings, storage=storage, clock=clock, label='screen-time')
    go(pg, 'screentime')
    return ctx, pg


def text(pg, sel):
    return pg.inner_text(sel)


def state(pg):
    return text(pg, '#stst')


def screen_buttons(pg):
    """Every visible button on the Screen Time screen and the alert, lower-cased."""
    return pg.evaluate("""[...document.querySelectorAll('[data-screen=screentime] button, #stalert button')]
        .filter(b => b.offsetParent !== null).map(b => b.textContent.trim().toLowerCase())""")


def typed(pg, command):
    """Run a typed assistant command and return LUNA's reply."""
    return pg.evaluate("t => Assistant.run(t).msg", command)


def finish_session(pg):
    """Start, run 20 minutes, dismiss."""
    pg.click('#ststart'); advance(pg, 20 * MIN); pg.click('#stdismiss')


def run(browser, r):
    r.group = 'screen time: '
    weekday(browser, r)
    weekday_limit_and_midnight(browser, r)
    weekend(browser, r)
    integrity(browser, r)


def weekday(browser, r):
    chk = r.check
    ctx, pg = page(browser, r, la(2026, 10, 26, 15, 0, 0))            # Monday 3:00 PM
    chk('the screen is titled "Screen Time Timer" and shows weekday mode', 'Screen Time Timer' in text(pg, '.screen.on h2') and 'Weekday' in text(pg, '#stmode'))
    chk('Ready, 0 of 4 used, a Start button', state(pg) == 'Ready' and '0 of 4 sessions used today · 4 remaining' in text(pg, '#stused') and pg.is_visible('#ststart'))
    chk('no pause/stop/cancel/reset/override control exists', not any(w in b for b in screen_buttons(pg) for w in FORBIDDEN), screen_buttons(pg))

    pg.click('#ststart')
    chk('Start begins a 20:00 session', state(pg) == 'Running' and text(pg, '#std') == '20:00')
    chk('while running there is no Start button and still no stop/pause/cancel control',
        not pg.is_visible('#ststart') and screen_buttons(pg) == ['home'], screen_buttons(pg))
    chk('the session explains it cannot be stopped and when it ends', 'ends at 3:20 PM' in text(pg, '#stwhy') and 'cannot be paused' in text(pg, '#stwhy'))
    advance(pg, 7 * MIN)
    chk('the countdown follows the clock (13:00 after 7 minutes)', text(pg, '#std') == '13:00', text(pg, '#std'))
    jump(pg, 5 * MIN)                                                  # the page's timers fire only once: like a throttled tab
    chk('after a delayed/throttled callback the remaining time is still right (8:00)', text(pg, '#std') == '8:00', text(pg, '#std'))
    pg.click('.screen.on [data-go=home]')
    chk('the home screen shows the Screen Time countdown', pg.is_visible('#stbadge') and text(pg, '#stbt') == '8:00', text(pg, '#stbadge'))

    # ---- the assistant can answer about it, but never control it ----
    reply = typed(pg, 'how much time is left?')
    chk('"how much time is left?" answers with the Screen Time remaining', reply == 'Your Screen Time session has 8 minutes remaining.', reply)
    reply = typed(pg, 'Cancel that timer.')
    chk('"cancel that timer" is refused: "This timer cannot be cancelled."', reply.startswith('This timer cannot be cancelled.') and '3:20 PM' in reply, reply)
    for cmd in ('pause the timer', 'reset the timer', 'stop screen time', 'cancel the screen time timer'):
        typed(pg, cmd)
    chk('...as are pause, reset and stop; the session keeps running', pg.evaluate("ScreenTimeUI.view().state") == 'running' and text(pg, '#stbt') == '8:00')

    # ---- the ordinary timer is independent ----
    go(pg, 'timer'); pg.click('[data-m="2"]'); pg.click('#tctl [data-act=start]')
    pg.click('#tctl [data-act=pause]'); pg.click('#tctl [data-act=reset]'); pg.click('#tctl [data-act=cancel]')
    chk('the ordinary timer\'s Pause/Reset/Cancel buttons do not touch Screen Time', pg.evaluate("ScreenTimeUI.view().state") == 'running' and pg.evaluate("TimerEngine.snapshot().state") == 'idle')
    typed(pg, 'set a 3 minute timer')
    reply = typed(pg, 'cancel that timer')
    chk('with both running, "cancel that timer" cancels the ordinary one and says Screen Time continues',
        reply == 'Timer cancelled. The Screen Time session keeps running.' and pg.evaluate("ScreenTimeUI.view().state") == 'running', reply)

    # ---- reload ----
    pg.reload(); pg.wait_for_timeout(200)
    go(pg, 'screentime')
    chk('a reload does not restart the countdown or offer a new session', state(pg) == 'Running' and text(pg, '#std') == '8:00' and not pg.is_visible('#ststart'), text(pg, '#std'))

    # ---- expiry: alert and alarm until Dismiss ----
    advance(pg, 8 * MIN)
    chk('at 20:00 the alert appears with a Dismiss button', pg.is_visible('#stalert') and pg.is_visible('#stdismiss') and state(pg) == 'Alert')
    chk('...Dismiss has the keyboard focus', pg.evaluate("document.activeElement.id") == 'stdismiss')
    chk('...and the alarm loop is running', pg.evaluate("ScreenTimeAlarm.isRunning()"))
    bursts = pg.evaluate("ScreenTimeAlarm.bursts()")
    advance(pg, 5000)
    gained = pg.evaluate("ScreenTimeAlarm.bursts()") - bursts
    chk('...it beeps once a second, one loop only (no overlapping loops)', 4 <= gained <= 6, gained)
    jump(pg, 30 * MIN)
    advance(pg, 2000)
    chk('the alert is still active half an hour later', pg.is_visible('#stalert') and pg.evaluate("ScreenTimeAlarm.isRunning()"))
    pg.reload(); pg.wait_for_timeout(200)
    chk('a reload during the alert brings the alert and alarm back', pg.is_visible('#stalert') and pg.evaluate("ScreenTimeAlarm.isRunning()"))
    pg.keyboard.press('Escape')
    chk('...Escape does not dismiss it (there is no other way to dismiss)', pg.is_visible('#stalert'))
    pg.click('#stdismiss')
    bursts = pg.evaluate("ScreenTimeAlarm.bursts()")
    advance(pg, 3000)
    chk('Dismiss stops the alarm immediately and hides the alert', not pg.is_visible('#stalert') and not pg.evaluate("ScreenTimeAlarm.isRunning()") and pg.evaluate("ScreenTimeAlarm.bursts()") == bursts)
    go(pg, 'screentime')
    chk('dismissing did not refund the session: 1 of 4 used', '1 of 4 sessions used' in text(pg, '#stused'), text(pg, '#stused'))
    ctx.close()

    # ---- weekday cooldown boundary (with the ordinary "Timer sound" setting OFF) ----
    ctx, pg = page(browser, r, la(2026, 10, 26, 14, 40, 0), settings={'idleSec': 0, 'sound': False})
    pg.click('#ststart'); advance(pg, 20 * MIN)
    bursts = pg.evaluate("ScreenTimeAlarm.bursts()")
    advance(pg, 3000)
    chk('"Timer sound: Off" does not silence the Screen Time alarm', pg.evaluate("ScreenTimeAlarm.bursts()") - bursts >= 2)
    pg.click('#stdismiss')                                             # session ended 3:00 PM; it is now 3:00:03
    chk('after a weekday session: Cooldown, next start 3:10 PM', state(pg) == 'Cooldown' and '3:10 PM' in text(pg, '#stwhy') and text(pg, '#std') == '9:57', (state(pg), text(pg, '#stwhy'), text(pg, '#std')))
    chk('...no Start button during the cooldown', not pg.is_visible('#ststart'))
    advance(pg, 10 * MIN - 4000)
    chk('...still blocked one second before the boundary', state(pg) == 'Cooldown' and text(pg, '#std') == '0:01', text(pg, '#std'))
    advance(pg, 1000)
    chk('...Start appears exactly at 3:10 PM', state(pg) == 'Ready' and pg.is_visible('#ststart'))
    ctx.close()


def seeded(*starts):
    """localStorage seed holding finished, dismissed sessions that started at the given (aware) datetimes."""
    sessions = [{'start': int(t.timestamp() * 1000), 'end': int(t.timestamp() * 1000) + 20 * MIN, 'dismissed': True} for t in starts]
    return {KEY: json.dumps({'v': 1, 'sessions': sessions, 'lockedUntil': 0, 'lockReason': ''})}


def weekday_limit_and_midnight(browser, r):
    chk = r.check
    # Tuesday: three sessions earlier today, then the fourth through the UI at 11:20 PM (ends 11:40 PM).
    earlier = seeded(la(2026, 10, 27, 9, 0), la(2026, 10, 27, 12, 0), la(2026, 10, 27, 18, 0))
    ctx, pg = page(browser, r, la(2026, 10, 27, 23, 20, 0), storage=earlier)
    chk('three sessions used earlier today: 3 of 4, one remaining', '3 of 4 sessions used today · 1 remaining' in text(pg, '#stused'), text(pg, '#stused'))
    finish_session(pg)
    chk('after four weekday sessions: Daily Limit Reached', state(pg) == 'Daily Limit Reached', state(pg))
    chk('...4 of 4 used, explained, with the next start at midnight', '4 of 4 sessions used today · 0 remaining' in text(pg, '#stused') and
        'resets at midnight' in text(pg, '#stwhy') and '12:00 AM tomorrow' in text(pg, '#stwhy'), text(pg, '#stwhy'))
    chk('...the fifth session cannot be started (no Start button; start() refuses)', not pg.is_visible('#ststart') and
        pg.evaluate("ScreenTimeUI.view().canStart") is False)
    pg.reload(); pg.wait_for_timeout(200)
    go(pg, 'screentime')
    chk('...a reload does not grant a new session', state(pg) == 'Daily Limit Reached')
    advance(pg, la(2026, 10, 28, 0, 0, 0).timestamp() * 1000 - pg.evaluate("Date.now()") - 1000)
    chk('...still blocked at 11:59:59 PM', state(pg) == 'Daily Limit Reached')
    advance(pg, 1000)
    chk('with the page left open, the allowance resets at local midnight', state(pg) == 'Ready' and '0 of 4 sessions used' in text(pg, '#stused'), state(pg))
    ctx.close()

    # a session running across midnight is not cut short
    ctx, pg = page(browser, r, la(2026, 10, 27, 23, 50, 0))
    pg.click('#ststart')
    advance(pg, 15 * MIN)
    chk('a session crossing midnight keeps running (5:00 left at 12:05 AM)', state(pg) == 'Running' and text(pg, '#std') == '5:00', text(pg, '#std'))
    advance(pg, 5 * MIN)
    chk('...and ends after its full 20 minutes', state(pg) == 'Alert')
    ctx.close()


def weekend(browser, r):
    chk = r.check
    # Saturday: four sessions this morning, each 10 minutes after the previous ended (so none is back-to-back).
    morning = seeded(la(2026, 10, 31, 8, 0), la(2026, 10, 31, 8, 30), la(2026, 10, 31, 9, 0), la(2026, 10, 31, 9, 30))
    ctx, pg = page(browser, r, la(2026, 10, 31, 10, 0, 0), storage=morning)
    chk('Saturday uses weekend rules with no daily limit', 'Weekend' in text(pg, '#stmode') and 'no daily limit' in text(pg, '#stused'))
    chk('four sessions already today and a fifth may start (no weekday cap on weekends)', state(pg) == 'Ready' and pg.is_visible('#ststart'))
    finish_session(pg)                                                 # 10:00 - 10:20
    chk('on a weekend the next session may start straight away', state(pg) == 'Ready' and pg.is_visible('#ststart'))
    finish_session(pg)                                                 # 10:20 - 10:40, back-to-back
    chk('after two back-to-back sessions: Cooldown until 10:50 AM, explained',
        state(pg) == 'Cooldown' and 'back-to-back' in text(pg, '#stwhy') and '10:50 AM' in text(pg, '#stwhy'), text(pg, '#stwhy'))
    pg.reload(); pg.wait_for_timeout(200)
    go(pg, 'screentime')
    chk('...a reload keeps the weekend tracking', state(pg) == 'Cooldown' and text(pg, '#std') == '10:00', (state(pg), text(pg, '#std')))
    advance(pg, 10 * MIN - 1000)
    chk('...still in cooldown at 10:49:59', state(pg) == 'Cooldown')
    advance(pg, 1000)
    chk('...allowed again at exactly 10:50', state(pg) == 'Ready')
    chk('six weekend sessions and still allowed', '6 sessions started today' in text(pg, '#stused'), text(pg, '#stused'))
    ctx.close()


def integrity(browser, r):
    chk = r.check
    ctx, pg = page(browser, r, la(2026, 10, 26, 9, 0, 0))
    pg.click('#ststart')
    saved = json.loads(pg.evaluate("localStorage.getItem('%s')" % KEY))
    chk('the record holds only the documented fields', set(saved) == {'v', 'sessions', 'lockedUntil', 'lockReason'} and
        set(saved['sessions'][0]) == {'start', 'end', 'dismissed'} and saved['sessions'][0]['end'] - saved['sessions'][0]['start'] == 20 * MIN, saved)
    pg.click('.screen.on [data-go=home]'); go(pg, 'settings')
    pg.click('#reset'); pg.click('#yes')
    chk('Restore defaults keeps the Screen Time history', json.loads(pg.evaluate("localStorage.getItem('%s')" % KEY)) == saved and
        pg.evaluate("ScreenTimeUI.view().state") == 'running')
    chk('no ordinary setting relates to Screen Time (nothing to switch it off)', 'screen time' not in pg.inner_text('#sets').lower())
    ctx.close()

    for name, value in [('edited', json.dumps({'v': 1, 'sessions': [], 'lockedUntil': 0, 'lockReason': '', 'extra': 4})),
                        ('unparseable', '{"v":1,"sess')]:
        ctx, pg = page(browser, r, la(2026, 10, 26, 9, 0, 0), storage={KEY: value})
        chk('%s saved data does not grant sessions: Blocked until midnight, explained' % name,
            state(pg) == 'Blocked' and not pg.is_visible('#ststart') and 'could not be read' in text(pg, '#stwhy'), text(pg, '#stwhy'))
        ctx.close()

    # Storage that refuses writes: the session must not start (it could not be enforced after a reload)
    block = "(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === '%s') throw new Error('QuotaExceededError'); return set.call(this, k, v); }; })();" % KEY
    ctx, pg = open_page(browser, r, settings=SETTINGS, clock=la(2026, 10, 26, 9, 0, 0), scripts=[block], label='screen-time')
    go(pg, 'screentime'); pg.click('#ststart')
    chk('if the browser will not save, no session starts and the reason is shown', state(pg) == 'Ready' and 'did not save' in text(pg, '#toast'), text(pg, '#toast'))
    ctx.close()
