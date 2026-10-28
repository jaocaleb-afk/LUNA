"""Schedules actually RUNNING. The page clock is frozen and moved by hand, so "9:00 AM" takes milliseconds.
  advance(ms)  = time passing normally (every second's check runs)
  jump(ms)     = the device was asleep: time leaps and only one check happens afterwards"""
from helpers import go, open_page, advance, jump, la, rule_dict, rules_storage, create_rule_via_ui

MON = lambda h, m, s=0: la(2026, 10, 26, h, m, s)
STATE = "TimerEngine.snapshot()"


def page_with(browser, r, rules, at, **kw):
    return open_page(browser, r, clock=at, settings={'idleSec': 0}, storage=rules_storage(*rules), label='schedule-run', **kw)


def log_len(pg):
    return pg.evaluate("Rules.log().length")


def run(browser, r):
    r.group = 'schedule run: '
    chk = r.check

    # ---- the headline scenario: 9:00 AM, 2 minutes, every day ----
    ctx, pg = open_page(browser, r, clock=MON(8, 59, 50), settings={'idleSec': 0}, label='schedule-run')
    go(pg, 'schedules')
    create_rule_via_ui(pg, 'Morning timer', '09:00', 2, 0, 'Every day')
    advance(pg, 8000)
    chk('(08:59:58) nothing has started yet', pg.evaluate(STATE + '.state') == 'idle')
    advance(pg, 3000)
    s = pg.evaluate(STATE)
    chk('09:00:01: a 2-minute timer started by itself', s['state'] == 'running' and s['duration'] == 120000, s)
    chk('...labelled as coming from the rule, not started manually', s['source'] == 'rule' and s['label'] == 'Morning timer')
    chk('...with the remaining time counting from 2:00', 118000 <= s['remaining'] <= 120000, s['remaining'])
    pg.click('.screen.on [data-go=home]')
    chk('the home screen readout shows it', pg.is_visible('#tbadge') and 'Morning timer' in pg.inner_text('#tbl'), pg.inner_text('#tbl'))
    go(pg, 'schedules')
    chk('the card records what happened', 'Last: Started a 2 min timer' in pg.inner_text('#rlist .rule'), pg.inner_text('#rlist .rule'))
    chk('the card now shows tomorrow as the next run', 'Tue, Oct 27, 9:00 AM' in pg.inner_text('#rlist .next'), pg.inner_text('#rlist .next'))
    chk('an on-screen notice appears', 'Morning timer' in pg.inner_text('#toast'))
    pg.click('.screen.on [data-go=home]'); go(pg, 'timer')
    chk('the Timer screen says it was started by the schedule', 'Started automatically by schedule “Morning timer”' in pg.inner_text('#tsrc'), pg.inner_text('#tsrc'))

    # ---- never twice in the same scheduled minute ----
    advance(pg, 50000)
    chk('over the rest of the 9:00 minute it did not start again', log_len(pg) == 1 and pg.evaluate("Rules.log()[0].status") == 'started')

    # ---- timer finishes, alert shown, still only one run ----
    advance(pg, 75000)
    chk('after 2 minutes the finish alert shows with the rule name', pg.is_visible('#alarm') and 'Morning timer' in pg.inner_text('#als'), pg.inner_text('#als'))
    advance(pg, 600000)
    chk('ten more minutes later the rule still has run exactly once', log_len(pg) == 1)

    # ---- reload in the middle of the same minute never re-fires it ----
    pg.reload(); pg.wait_for_timeout(300)
    advance(pg, 5000)
    chk('after a reload the same occurrence does not run again', pg.evaluate(STATE + '.state') == 'idle' and log_len(pg) == 1, pg.evaluate(STATE))
    chk('the activity log and last result persisted across the reload', pg.evaluate("Rules.all()[0].lastResult.status") == 'started')
    ctx.close()

    skipped_when_busy(browser, r)
    replaced_when_finished(browser, r)
    missed_and_late(browser, r)
    day_rules(browser, r)
    disabled_and_edit(browser, r)


def skipped_when_busy(browser, r):
    chk = r.check
    # A manual timer is running when the rule comes due: the rule must NOT overwrite it, and must explain why.
    ctx, pg = page_with(browser, r, [rule_dict('Morning timer')], MON(8, 59, 0))
    pg.evaluate("TimerEngine.start(600000)")
    advance(pg, 62000)
    s = pg.evaluate(STATE)
    chk('a running manual timer is NOT overwritten by a schedule', s['source'] == 'manual' and s['duration'] == 600000 and s['state'] == 'running', s)
    last = pg.evaluate("Rules.all()[0].lastResult")
    chk('the skip is recorded with a plain explanation', last['status'] == 'skipped' and 'manual timer' in last['msg'] and 'never replace' in last['msg'], last)
    go(pg, 'schedules')
    chk('the skip is visible on the rule card and in recent activity', 'Skipped' in pg.inner_text('#rlist .rule') and 'Skipped' in pg.inner_text('#rlog'))
    chk('a skipped occurrence is not retried a second later', log_len(pg) == 1)
    ctx.close()

    # A PAUSED timer counts as active too.
    ctx, pg = page_with(browser, r, [rule_dict('Morning timer')], MON(8, 59, 0))
    pg.evaluate("TimerEngine.start(600000); TimerEngine.pause()")
    advance(pg, 62000)
    chk('a paused timer is also protected', pg.evaluate(STATE + '.state') == 'paused' and pg.evaluate("Rules.all()[0].lastResult.status") == 'skipped')
    ctx.close()

    # Two rules at the same minute: the first wins, the second explains it was skipped.
    ctx, pg = page_with(browser, r, [rule_dict('First', seconds=120), rule_dict('Second', seconds=60)], MON(8, 59, 0))
    advance(pg, 62000)
    s = pg.evaluate(STATE)
    results = pg.evaluate("Object.fromEntries(Rules.all().map(x => [x.name, x.lastResult.status]))")
    chk('two rules at the same time: exactly one timer runs', s['state'] == 'running', s)
    chk('...one started, the other was skipped', sorted(results.values()) == ['skipped', 'started'], results)
    ctx.close()


def replaced_when_finished(browser, r):
    chk = r.check
    ctx, pg = page_with(browser, r, [rule_dict('Morning timer', seconds=120)], MON(8, 59, 0))
    pg.evaluate("TimerEngine.start(5000)")
    advance(pg, 10000)
    chk('(setup) a manual timer has finished and its alert is showing', pg.is_visible('#alarm'))
    advance(pg, 52000)
    s = pg.evaluate(STATE)
    chk('a FINISHED timer is replaced by the scheduled one', s['state'] == 'running' and s['source'] == 'rule', s)
    chk('...and the old alert is dismissed', not pg.is_visible('#alarm'))
    ctx.close()


def missed_and_late(browser, r):
    chk = r.check
    ctx, pg = page_with(browser, r, [rule_dict('Morning timer')], MON(8, 0, 0))
    jump(pg, 100 * 60000 + 5000)   # the device "slept" until 09:40
    pg.wait_for_timeout(200)
    last = pg.evaluate("Rules.all()[0].lastResult")
    chk('slept through 9:00 until 9:40: reported as missed', last['status'] == 'missed' and 'Missed' in last['msg'], last)
    chk('...and the timer was NOT started 40 minutes late', pg.evaluate(STATE + '.state') == 'idle')
    go(pg, 'schedules')
    chk('the missed run is explained on the rule card', 'Missed: due 40 min ago' in pg.inner_text('#rlist .rule'), pg.inner_text('#rlist .rule'))
    ctx.close()

    ctx, pg = page_with(browser, r, [rule_dict('Morning timer')], MON(8, 0, 0))
    jump(pg, 63 * 60000)           # woke at 09:03, inside the 5 minute grace window
    pg.wait_for_timeout(200)
    last = pg.evaluate("Rules.all()[0].lastResult")
    chk('woke 3 minutes late: still started, and says it was late', last['status'] == 'started' and 'late' in last['msg'], last)
    ctx.close()

    # LUNA was closed from Friday and is opened on Monday at noon: 3 missed 9:00s, but ONE log entry and no timers.
    ctx, pg = page_with(browser, r, [rule_dict('Morning timer', armed=la(2026, 10, 23, 7, 0))], MON(12, 0, 0))
    advance(pg, 5000)
    chk('closed for days: one "missed" entry, never a burst of old timers',
        log_len(pg) == 1 and pg.evaluate("Rules.log()[0].status") == 'missed' and pg.evaluate(STATE + '.state') == 'idle', pg.evaluate("Rules.log()"))
    advance(pg, 60000)
    chk('...and it does not keep reporting the same miss', log_len(pg) == 1)
    ctx.close()


def day_rules(browser, r):
    chk = r.check
    # Monday-only rule, starting on Sunday evening: must wait for Monday.
    mon_only = rule_dict('Monday only', repeat='days', days=[1], armed=la(2026, 10, 25, 7, 0))
    ctx, pg = page_with(browser, r, [mon_only], la(2026, 10, 25, 8, 59, 50))
    advance(pg, 15000)
    chk('a Monday-only rule does not run on Sunday at 9:00', pg.evaluate(STATE + '.state') == 'idle' and log_len(pg) == 0)
    go(pg, 'schedules')
    chk('...and shows Monday as its next run', 'Mon, Oct 26, 9:00 AM' in pg.inner_text('#rlist .next'), pg.inner_text('#rlist .next'))
    jump(pg, 24 * 3600e3 - 10000)           # now Monday 08:59:55
    advance(pg, 10000)
    chk('...and does run on Monday', pg.evaluate(STATE + '.source') == 'rule', pg.evaluate(STATE))
    ctx.close()

    # One-time rule: runs once, then switches itself off.
    ctx, pg = page_with(browser, r, [rule_dict('Just once', repeat='once')], MON(8, 59, 50))
    advance(pg, 15000)
    chk('a one-time rule runs', pg.evaluate(STATE + '.source') == 'rule')
    go(pg, 'schedules')
    chk('...then turns itself off and says it is finished', pg.inner_text('#rlist .sw') == 'Off' and 'Finished (one-time rule)' in pg.inner_text('#rlist .next'), pg.inner_text('#rlist .next'))
    ctx.close()

    # A rule created AFTER today's time waits for tomorrow instead of firing immediately.
    ctx, pg = open_page(browser, r, clock=MON(9, 3, 0), settings={'idleSec': 0}, label='schedule-run')
    go(pg, 'schedules')
    create_rule_via_ui(pg, 'Late creation', '09:00', 2)
    advance(pg, 10000)
    chk('creating a 9:00 rule at 9:03 does not fire it immediately', pg.evaluate(STATE + '.state') == 'idle' and log_len(pg) == 0)
    chk('...its next run is tomorrow', 'Tue, Oct 27, 9:00 AM' in pg.inner_text('#rlist .next'), pg.inner_text('#rlist .next'))
    ctx.close()


def disabled_and_edit(browser, r):
    chk = r.check
    ctx, pg = page_with(browser, r, [rule_dict('Morning timer', enabled=False)], MON(8, 59, 50))
    advance(pg, 15000)
    chk('a disabled rule does not run', pg.evaluate(STATE + '.state') == 'idle' and log_len(pg) == 0)
    ctx.close()

    # Turning a rule on only counts FUTURE occurrences (no instant "catch-up" start).
    ctx, pg = page_with(browser, r, [rule_dict('Morning timer', enabled=False)], MON(9, 10, 0))
    go(pg, 'schedules'); pg.click('#rlist .sw')
    advance(pg, 10000)
    chk('enabling a rule after its time today does not fire it', pg.evaluate(STATE + '.state') == 'idle' and log_len(pg) == 0)
    ctx.close()

    # Editing the time to a moment still ahead makes it run today.
    ctx, pg = page_with(browser, r, [rule_dict('Morning timer', time='08:00')], MON(8, 59, 0))
    go(pg, 'schedules'); pg.click('#rlist button:has-text("Edit")')
    pg.fill('#r-time', '09:00'); pg.click('#redit button:has-text("Save rule")')
    advance(pg, 62000)
    chk('moving a rule to a later time today makes it run at the new time', pg.evaluate(STATE + '.source') == 'rule', pg.evaluate(STATE))
    ctx.close()

    # Deleting a rule mid-way leaves a running timer alone and nothing further fires.
    ctx, pg = page_with(browser, r, [rule_dict('Morning timer')], MON(8, 59, 50))
    advance(pg, 15000)
    go(pg, 'schedules'); pg.click('#rlist button:has-text("Delete")'); pg.click('#yes')
    chk('deleting a rule does not cancel the timer it already started', pg.evaluate(STATE + '.state') == 'running')
    ctx.close()
