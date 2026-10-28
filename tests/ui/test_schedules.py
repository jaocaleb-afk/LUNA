"""Schedules screen: creating, editing, enabling/disabling, deleting and validating rules; persistence."""
import json
from helpers import go, open_page, advance, la, rule_dict, rules_storage, create_rule_via_ui

START = la(2026, 10, 26, 8, 0, 0)  # a Monday
OPEN = dict(clock=START, settings={'idleSec': 0}, label='schedules')


def cards(pg):
    return pg.eval_on_selector_all('#rlist .rule h3', 'els => els.map(e => e.textContent)')


def run(browser, r):
    r.group = 'schedules: '
    chk = r.check

    # ---- the explanation people must see ----
    ctx, pg = open_page(browser, r, **OPEN)
    go(pg, 'schedules')
    info = pg.inner_text('#rinfo')
    chk('explains that the page must stay open and the device awake', 'only run while this LUNA page is open' in info and 'device is awake' in info)
    chk('explains that an active timer is never interrupted', 'never interrupts' in info)
    chk('says schedules use the device time zone and names it', 'local time zone' in info and 'America/Los_Angeles' in info)
    chk('empty state invites the first rule', 'No schedules yet' in pg.inner_text('#rlist'))

    # ---- create the example rule from the task ----
    create_rule_via_ui(pg, 'Morning timer', '09:00', 2, 0, 'Every day')
    chk('the example rule (Morning timer, 9:00 AM, 2 min, every day) is created', cards(pg) == ['Morning timer'])
    card = pg.inner_text('#rlist .rule')
    chk('the card shows time, action, duration and repeat', '9:00 AM · Start timer · 2 min · Every day' in card, card)
    chk('the card shows the next run', 'Next run: Mon, Oct 26, 9:00 AM' in card, card)
    chk('the card shows enabled status', pg.get_attribute('#rlist .sw', 'aria-checked') == 'true' and pg.inner_text('#rlist .sw') == 'On')
    chk('the editor closes after saving', not pg.is_visible('#redit'))
    chk('the Timer screen summarises the next scheduled start',
        pg.evaluate("document.getElementById('tnext').textContent").startswith('Next scheduled start: “Morning timer”'))

    # ---- persistence ----
    pg.reload(); pg.wait_for_timeout(300)
    go(pg, 'schedules')
    chk('the rule survives a reload', cards(pg) == ['Morning timer'])
    stored = json.loads(pg.evaluate("localStorage.getItem('luna.rules.v1')"))
    chk('...stored with its fields', stored['rules'][0]['time'] == '09:00' and stored['rules'][0]['seconds'] == 120 and stored['rules'][0]['repeat'] == 'daily')

    # ---- disable / enable ----
    pg.click('#rlist .sw')
    chk('disabling shows Off and "will not run"', pg.inner_text('#rlist .sw') == 'Off' and 'Disabled' in pg.inner_text('#rlist .next'))
    chk('...and the timer-screen summary stops mentioning it', 'No schedules are enabled' in pg.evaluate("document.getElementById('tnext').textContent"))
    pg.click('#rlist .sw')
    chk('enabling shows On and the next run again', pg.inner_text('#rlist .sw') == 'On' and 'Next run' in pg.inner_text('#rlist .next'))

    # ---- edit ----
    pg.click('#rlist button:has-text("Edit")')
    chk('Edit opens the form filled with the rule', pg.input_value('#r-name') == 'Morning timer' and pg.input_value('#r-time') == '09:00' and pg.input_value('#r-min') == '2')
    pg.fill('#r-name', 'Evening timer'); pg.fill('#r-time', '18:30'); pg.fill('#r-min', '10')
    pg.click('#redit button:has-text("Save rule")')
    card = pg.inner_text('#rlist .rule')
    chk('edits are saved (name, time, duration)', cards(pg) == ['Evening timer'] and '6:30 PM · Start timer · 10 min' in card, card)
    chk('editing does not create a duplicate', pg.locator('#rlist .rule').count() == 1)

    # ---- cancel keeps the rule unchanged ----
    pg.click('#rlist button:has-text("Edit")'); pg.fill('#r-name', 'Changed'); pg.click('#redit button:has-text("Cancel")')
    chk('Cancel discards form changes', cards(pg) == ['Evening timer'] and not pg.is_visible('#redit'))

    # ---- delete (with confirmation) ----
    pg.click('#rlist button:has-text("Delete")')
    chk('Delete asks for confirmation first', pg.evaluate("document.getElementById('dlg').open") and 'Evening timer' in pg.inner_text('#dlgt'))
    pg.click('#no'); chk('Keep leaves the rule in place', cards(pg) == ['Evening timer'])
    pg.click('#rlist button:has-text("Delete")'); pg.click('#yes')
    chk('Confirm deletes it', cards(pg) == [] and 'No schedules yet' in pg.inner_text('#rlist'))
    pg.reload(); pg.wait_for_timeout(300)
    chk('...and it stays deleted after a reload', pg.evaluate("Rules.all().length") == 0)
    ctx.close()

    validation(browser, r)
    weekdays_and_warnings(browser, r)
    bad_storage(browser, r)


def validation(browser, r):
    chk = r.check
    ctx, pg = open_page(browser, r, **OPEN)
    go(pg, 'schedules'); pg.click('#rnew')

    pg.fill('#r-name', ''); pg.fill('#r-min', '0'); pg.fill('#r-sec', '0')
    pg.click('#redit button:has-text("Save rule")')
    errors = pg.inner_text('#rerr')
    chk('saving an empty name is refused with a clear message', 'Give the rule a name' in errors, errors)
    chk('saving a zero duration is refused with a clear message', 'duration between 1 second and 24 hours' in errors, errors)
    chk('errors are announced (role=alert) and nothing was saved', pg.get_attribute('#rerr ul', 'role') == 'alert' and pg.evaluate("Rules.all().length") == 0)
    chk('the form stays open so nothing typed is lost', pg.is_visible('#redit'))

    pg.fill('#r-name', 'Ok name')
    chk('errors update live once fixed', 'Give the rule a name' not in pg.inner_text('#rerr'))
    pg.fill('#r-time', '')
    pg.click('#redit button:has-text("Save rule")')
    chk('a missing start time is refused', 'Choose a start time' in pg.inner_text('#rerr'), pg.inner_text('#rerr'))
    pg.fill('#r-time', '09:00')

    pg.click('#redit button:has-text("Selected days")')
    for d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']:
        pg.click('#redit .days button:has-text("%s")' % d)   # defaults start selected: this deselects them all
    pg.click('#redit button:has-text("Save rule")')
    chk('"Selected days" with no day picked is refused', 'Pick at least one day' in pg.inner_text('#rerr'), pg.inner_text('#rerr'))

    pg.fill('#r-min', '1500'); pg.click('#redit button:has-text("Save rule")')
    chk('a duration over 24 hours is refused', 'duration between 1 second and 24 hours' in pg.inner_text('#rerr'))
    pg.fill('#r-name', 'x' * 40)
    chk('the name field stops at 40 characters', len(pg.input_value('#r-name')) == 40)
    pg.fill('#r-min', '1.5'); pg.click('#redit button:has-text("Save rule")')
    chk('a fractional duration is refused', 'duration between' in pg.inner_text('#rerr'))
    chk('(all of the above left storage empty)', pg.evaluate("Rules.all().length") == 0)
    ctx.close()


def weekdays_and_warnings(browser, r):
    chk = r.check
    ctx, pg = open_page(browser, r, storage=rules_storage(rule_dict('Early bird', '09:00', 600)), **OPEN)
    go(pg, 'schedules')
    create_rule_via_ui(pg, 'Weekday walk', '07:30', 15, 0, 'Selected days')   # Mon-Fri preselected
    chk('selected days are shown as "Weekdays"', 'Weekdays' in pg.inner_text('#rlist'), pg.inner_text('#rlist'))

    pg.click('#rnew'); pg.fill('#r-name', 'Clashing'); pg.fill('#r-time', '09:00'); pg.fill('#r-min', '1')
    chk('an exactly-simultaneous rule shows a warning BEFORE saving (without a failed Save)',
        'starts at the same time' in pg.inner_text('#rerr') and 'Early bird' in pg.inner_text('#rerr'), pg.inner_text('#rerr'))
    pg.click('#redit button:has-text("Save rule")')
    chk('the warning names the other rule and explains the outcome',
        'Early bird' in pg.inner_text('#toast') and 'one of them will be skipped' in pg.inner_text('#toast'), pg.inner_text('#toast'))
    chk('warnings do not block saving', 'Clashing' in pg.inner_text('#rlist'))

    pg.click('#rnew'); pg.fill('#r-name', 'Overlap'); pg.fill('#r-time', '09:05'); pg.fill('#r-min', '1')
    pg.click('#redit button:has-text("Save rule")')
    chk('an overlapping rule explains that the later start is skipped', 'overlaps with' in pg.inner_text('#toast') and 'skipped' in pg.inner_text('#toast'), pg.inner_text('#toast'))
    ctx.close()


def bad_storage(browser, r):
    chk = r.check
    junk = {'luna.rules.v1': json.dumps({'rules': [
        rule_dict('Good one'), {'id': 'x', 'name': '', 'time': '99:99'}, None, 'text', 7,
        dict(rule_dict('Bad duration', rid='r2'), seconds=-5), dict(rule_dict('Bad repeat', rid='r3'), repeat='weekly')], 'log': 'nope'})}
    ctx, pg = open_page(browser, r, storage=junk, **OPEN)
    go(pg, 'schedules')
    chk('corrupt stored rules are dropped; the valid one is kept', cards(pg) == ['Good one'], cards(pg))
    chk('a corrupt activity log does not break the page', 'Nothing has run yet' in pg.inner_text('#rlog'))
    ctx.close()
    ctx, pg = open_page(browser, r, storage={'luna.rules.v1': '{not json'}, **OPEN)
    chk('unparseable storage falls back to no rules', pg.evaluate("Rules.all().length") == 0)
    ctx.close()
