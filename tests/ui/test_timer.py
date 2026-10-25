"""Timer screen: every control, the remaining-time display, source labelling, and the finish alert."""
from helpers import open_page, advance, la

START = la(2026, 10, 26, 8, 0, 0)


def buttons(pg):
    return pg.eval_on_selector_all('#tctl button', 'els => els.map(e => e.dataset.act)')


def run(browser, r):
    r.group = 'timer: '
    chk = r.check
    ctx, pg = open_page(browser, r, clock=START, settings={'idleSec': 0}, label='timer')
    pg.click('#dock [data-go=timer]')

    chk('idle: only Start is offered, with the duration inputs', buttons(pg) == ['start'] and pg.is_visible('#tin') and pg.is_visible('#presets'))
    pg.click('[data-m="2"]')
    chk('the 2 min preset sets the duration to 2:00', pg.inner_text('#td') == '2:00' and pg.input_value('#tm') == '2')
    pg.click('[data-act=start]')
    chk('Start: running, remaining time shown, started manually',
        pg.inner_text('#tst') == 'Running' and pg.inner_text('#td') == '2:00' and pg.inner_text('#tsrc') == 'Started manually')
    chk('running: Pause, Reset and Cancel are offered', buttons(pg) == ['pause', 'reset', 'cancel'])
    chk('the duration inputs are hidden while a timer exists', not pg.is_visible('#tin'))

    pause = pg.query_selector('[data-act=pause]')
    advance(pg, 5000)
    chk('remaining time counts down', pg.inner_text('#td') == '1:55', pg.inner_text('#td'))
    chk('buttons are NOT rebuilt on every tick (taps and focus are safe)', pause.evaluate('e => e.isConnected'))
    chk('the home screen readout matches', pg.evaluate("document.getElementById('tbt').textContent") == '1:55')

    pg.click('[data-act=pause]')
    chk('Pause: paused; Resume/Reset/Cancel offered', pg.inner_text('#tst') == 'Paused' and buttons(pg) == ['resume', 'reset', 'cancel'])
    advance(pg, 30000)
    chk('paused time does not drain', pg.inner_text('#td') == '1:55')
    pg.click('[data-act=resume]'); advance(pg, 5000)
    chk('Resume continues from where it stopped', pg.inner_text('#tst') == 'Running' and pg.inner_text('#td') == '1:50', pg.inner_text('#td'))

    pg.click('[data-act=reset]')
    chk('Reset: back to the full duration, ready to start', pg.inner_text('#tst') == 'Ready' and pg.inner_text('#td') == '2:00' and buttons(pg) == ['start', 'cancel'])
    pg.click('[data-act=start]'); chk('Start from ready runs again', pg.inner_text('#tst') == 'Running')
    pg.click('[data-act=cancel]')
    chk('Cancel: back to idle, nothing running', pg.inner_text('#tst') == '' and buttons(pg) == ['start'] and pg.is_visible('#tin') and pg.evaluate("TimerEngine.snapshot().state") == 'idle')
    chk('no timer readout on the home screen after cancel', pg.evaluate("document.getElementById('tbadge').hidden"))

    # ---- entering a duration, validation ----
    pg.fill('#tm', '0'); pg.fill('#ts', '0'); pg.click('[data-act=start]')
    chk('starting with 0:00 is refused with a message', 'at least 1 second' in pg.inner_text('#toast') and pg.evaluate("TimerEngine.snapshot().state") == 'idle')
    pg.fill('#tm', '1'); pg.fill('#ts', '30')
    chk('typed minutes and seconds are shown before starting', pg.inner_text('#td') == '1:30')
    pg.click('[data-act=start]')
    chk('presets and inputs are hidden while a timer is active, so it cannot be overwritten', not pg.is_visible('#presets') and not pg.is_visible('#tin') and pg.inner_text('#td') == '1:30')
    pg.click('[data-act=cancel]')

    # ---- finishing ----
    pg.fill('#tm', '0'); pg.fill('#ts', '3'); pg.click('[data-act=start]')
    advance(pg, 3500)
    chk('finish: a full-screen alert says the timer is done', pg.is_visible('#alarm') and 'Time’s up' in pg.inner_text('#alt') and '3 sec timer finished' in pg.inner_text('#als'), pg.inner_text('#als'))
    chk('finish: the timer screen shows Time’s up at 0:00', pg.inner_text('#tst') == 'Time’s up' and pg.inner_text('#td') == '0:00')
    pg.click('#dis')
    chk('Dismiss hides the alert and leaves the timer ready to repeat', not pg.is_visible('#alarm') and pg.inner_text('#tst') == 'Ready')

    # ---- a spoken/typed command shows the same state ----
    pg.click('.screen.on [data-go=home]'); pg.click('#dock [data-go=assistant]')
    pg.fill('.cmd input', 'set a two minute timer'); pg.keyboard.press('Enter')
    chk('a typed command with a number word starts a 2:00 timer', pg.evaluate("TimerEngine.snapshot().duration") == 120000)
    ctx.close()
