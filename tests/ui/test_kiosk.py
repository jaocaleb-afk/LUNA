"""Fullscreen kiosk mode and the PIN gate.

Uses headless Chromium's REAL Fullscreen API (clicks give the user gesture it needs). What automation cannot do is press
the browser's own exit control: Esc / the "exit fullscreen" button are handled by the browser, outside the page. As a
stand-in, `document.exitFullscreen()` is called from a script: the page sees exactly the same `fullscreenchange` event,
but this does NOT prove the real browser control behaves the same. That needs the manual check in README.md."""
from helpers import go, more, open_page, la, advance, MOCK_SPEECH, NO_FULLSCREEN, create_rule_via_ui

SETTINGS = {'idleSec': 0}
PIN = '2580'
FS = "!!document.fullscreenElement"
MODE = "Kiosk.view().mode"
GATE_UP = "!document.getElementById('gate').hidden"
IN_KIOSK = FS + " && Kiosk.view().mode === 'kiosk'"   # fullscreenElement changes a frame before `fullscreenchange` fires
BROWSER_EXIT = "document.exitFullscreen()"   # stand-in for the browser's own exit control


def with_pin(pg, pin=PIN):
    pg.evaluate("PinStore.save('%s').then(() => { PinUI.refresh(); Kiosk.refresh(); })" % pin)


def enter(pg):
    more(pg, '#fs'); pg.wait_for_function(IN_KIOSK)


def type_pin(pg, pin, keypad=False):
    if keypad:
        for d in pin:
            pg.click('#gpad button[aria-label="%s"]' % d)
        pg.click('#gok')
    else:
        pg.fill('#gpin', pin); pg.press('#gpin', 'Enter')
    pg.wait_for_function("document.getElementById('gok').textContent !== 'Checking…'", timeout=20000)
    pg.wait_for_timeout(150)


def page(browser, r, **kw):
    kw.setdefault('settings', SETTINGS)
    return open_page(browser, r, label='kiosk', **kw)


def run(browser, r):
    r.group = 'kiosk: '
    app_exit(browser, r)
    browser_exit(browser, r)
    idle_while_prompting(browser, r)
    reload_and_limits(browser, r)
    unprotected(browser, r)
    features_still_work(browser, r)


def app_exit(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    with_pin(pg)
    pg.click('#more')
    chk('a Fullscreen button is in the toolbar\'s More menu', pg.is_visible('#fs') and pg.inner_text('#fs') == 'Fullscreen')
    pg.click('#more')
    enter(pg)
    chk('tapping it enters real fullscreen kiosk mode', pg.evaluate(FS) and pg.evaluate(MODE) == 'kiosk' and pg.inner_text('#fs') == 'Exit fullscreen')
    chk('...and kiosk mode is remembered (for reloads)', pg.evaluate("localStorage.getItem('luna.kiosk.v1')") == 'true')

    more(pg, '#fs')
    chk('LUNA’s Exit control asks for the PIN and stays fullscreen', pg.evaluate(GATE_UP) and pg.evaluate(FS) and 'Enter the PIN' in pg.inner_text('#gt'))
    chk('...the app behind the prompt is inert (not clickable or focusable)', pg.evaluate("document.getElementById('home').inert && document.querySelector('[data-screen=settings]').inert"))
    chk('...the PIN box has keyboard focus', pg.evaluate("document.activeElement.id") == 'gpin')
    pg.keyboard.press('Escape')
    chk('Escape inside the page does not dismiss the PIN prompt', pg.evaluate(GATE_UP))
    pg.click('#gcancel')
    chk('Cancel keeps LUNA in fullscreen and closes the prompt', not pg.evaluate(GATE_UP) and pg.evaluate(FS) and pg.evaluate(MODE) == 'kiosk')
    chk('...and the app is usable again', not pg.evaluate("document.getElementById('home').inert"))

    more(pg, '#fs')
    type_pin(pg, '1111', keypad=True)
    chk('a wrong PIN (on-screen keypad) keeps the prompt, explains, and stays fullscreen',
        pg.evaluate(GATE_UP) and pg.evaluate(FS) and 'Wrong PIN' in pg.inner_text('#gerr'), pg.inner_text('#gerr'))
    chk('...the error is announced (role=alert) and the box is cleared for another try',
        pg.get_attribute('#gerr', 'role') == 'alert' and pg.input_value('#gpin') == '')
    type_pin(pg, PIN)
    pg.wait_for_function("!document.fullscreenElement && Kiosk.view().mode === 'normal'")
    chk('the correct PIN (keyboard + Enter) leaves fullscreen', not pg.evaluate(FS) and not pg.evaluate(GATE_UP) and pg.evaluate(MODE) == 'normal')
    chk('...and clears the kiosk flag', pg.evaluate("localStorage.getItem('luna.kiosk.v1')") == 'false')
    ctx.close()


def browser_exit(browser, r):
    chk = r.check
    ctx, pg = page(browser, r, touch=True)
    with_pin(pg)
    enter(pg)
    pg.evaluate("confirmDlg('test dialog', () => {})")
    pg.evaluate(BROWSER_EXIT); pg.wait_for_function(GATE_UP)
    chk('fullscreen ending without the PIN (browser-exit stand-in) shows the blocking PIN screen',
        pg.evaluate(GATE_UP) and 'left fullscreen' in pg.inner_text('#gt') and pg.evaluate(MODE) == 'locked')
    chk('...it covers the whole display with an opaque layer',
        pg.evaluate("(() => { const g = getComputedStyle(document.getElementById('gate')); const r = document.getElementById('gate').getBoundingClientRect();"
                    " return g.position === 'fixed' && r.width >= innerWidth && r.height >= innerHeight && g.backgroundColor !== 'rgba(0, 0, 0, 0)'; })()"))
    chk('...no dialog is left open on top of it', pg.evaluate("document.querySelectorAll('dialog[open]').length") == 0)
    chk('...the controls behind it are inert', pg.evaluate("document.getElementById('home').inert"))
    chk('...it offers "Return to fullscreen" but no Cancel', pg.is_visible('#greturn') and not pg.is_visible('#gcancel'))
    pg.tap('#gpad button[aria-label="9"]'); pg.tap('#gpad button[aria-label="9"]')
    chk('the keypad works by touch', pg.input_value('#gpin') == '99')
    pg.tap('#gpad button[aria-label="Delete last digit"]')
    chk('...including delete', pg.input_value('#gpin') == '9')
    pg.fill('#gpin', '')
    type_pin(pg, '0000')
    chk('a wrong PIN keeps it locked and allows another attempt', pg.evaluate(GATE_UP) and pg.evaluate(MODE) == 'locked' and 'Wrong PIN' in pg.inner_text('#gerr'))
    pg.click('#greturn'); pg.wait_for_function(IN_KIOSK)
    chk('"Return to fullscreen" restores kiosk mode and removes the lock', pg.evaluate(FS) and not pg.evaluate(GATE_UP) and pg.evaluate(MODE) == 'kiosk')
    pg.evaluate(BROWSER_EXIT); pg.wait_for_function(GATE_UP)
    type_pin(pg, PIN)
    chk('the correct PIN on the lock screen dismisses it and leaves kiosk mode',
        not pg.evaluate(GATE_UP) and pg.evaluate(MODE) == 'normal' and pg.evaluate("localStorage.getItem('luna.kiosk.v1')") == 'false')
    chk('...and the app is usable again', not pg.evaluate("document.getElementById('home').inert") and pg.is_visible('#dock'))
    ctx.close()

    # the lock appears even if the controls had faded (idle), and the first tap on it is not swallowed
    ctx, pg = page(browser, r, touch=True, settings={'idleSec': 5})
    with_pin(pg)
    enter(pg)
    pg.wait_for_function("document.body.classList.contains('idle')", timeout=10000)
    pg.evaluate(BROWSER_EXIT); pg.wait_for_function(GATE_UP)
    pg.tap('#gpad button[aria-label="4"]')
    chk('while idle: the lock appears and the first keypad tap registers', pg.input_value('#gpin') == '4')
    pg.wait_for_timeout(6000)
    chk('...and the lock stays up (idle does not send it away)', pg.evaluate(GATE_UP))
    ctx.close()


def idle_while_prompting(browser, r):
    """The PIN prompt holds the idle countdown, so the screen underneath is not swapped out while it is up."""
    chk = r.check
    ctx, pg = page(browser, r, settings={'idleSec': 5}, clock=la(2026, 10, 26, 8, 0, 0))
    with_pin(pg); pg.wait_for_timeout(1500)
    enter(pg)
    go(pg, 'settings')
    pg.click('#kbtn'); pg.wait_for_function(GATE_UP)
    advance(pg, 120000)
    pg.click('#gcancel')
    chk('two idle minutes under the PIN prompt do not send the display back to the clock',
        pg.evaluate("Nav.cur") == 'settings' and pg.evaluate(MODE) == 'kiosk', pg.evaluate("Nav.cur"))
    ctx.close()


def reload_and_limits(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    with_pin(pg)
    enter(pg)
    pg.reload(); pg.wait_for_timeout(300)
    chk('reloading in kiosk mode comes back to the PIN screen (a reload is not a way out)',
        pg.evaluate(GATE_UP) and 'reloaded' in pg.inner_text('#gd') and pg.evaluate(MODE) == 'locked')
    pg.click('#greturn'); pg.wait_for_function(IN_KIOSK)
    chk('...and "Return to fullscreen" works from there', pg.evaluate(FS) and pg.evaluate(MODE) == 'kiosk' and not pg.evaluate(GATE_UP))
    ctx.close()

    # wrong-PIN limiter, on a controllable clock
    ctx, pg = page(browser, r, clock=la(2026, 10, 26, 8, 0, 0))
    with_pin(pg); pg.wait_for_timeout(1500)
    pg.evaluate("localStorage.setItem('luna.kiosk.v1','true')"); pg.reload(); pg.wait_for_timeout(300)
    for _ in range(5):
        type_pin(pg, '0000')
    chk('after 5 wrong PINs, entry pauses for 30 s (and says so)', 'Try again in 30 s' in pg.inner_text('#gerr'), pg.inner_text('#gerr'))
    type_pin(pg, PIN)
    chk('...even the right PIN is not accepted during the pause', pg.evaluate(GATE_UP) and 'Too many' in pg.inner_text('#gerr'))
    advance(pg, 31000)
    type_pin(pg, PIN)
    chk('...after the pause the right PIN works (never a permanent lock)', not pg.evaluate(GATE_UP) and pg.evaluate(MODE) == 'normal')
    ctx.close()

    # no Fullscreen API: kiosk mode is unavailable, said plainly; a stale kiosk flag never locks the app
    ctx, pg = page(browser, r, scripts=[NO_FULLSCREEN], storage={'luna.kiosk.v1': 'true'})
    with_pin(pg)
    pg.reload(); pg.wait_for_timeout(300)
    chk('no Fullscreen API: no lock screen even with a PIN and a stale kiosk flag', not pg.evaluate(GATE_UP) and pg.evaluate(MODE) == 'normal')
    pg.click('#more')
    chk('...the toolbar has no Fullscreen button', not pg.is_visible('#fs'))
    pg.click('#more')
    go(pg, 'settings')
    chk('...and Settings explains kiosk mode is unavailable', 'does not let LUNA go fullscreen' in pg.inner_text('#kstat') and pg.locator('#kbtn').count() == 0)
    ctx.close()


def unprotected(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    enter(pg)
    chk('without a PIN, entering fullscreen warns that leaving is not protected', 'not protected' in pg.inner_text('#toast'), pg.inner_text('#toast'))
    go(pg, 'settings')
    chk('...and Settings says NO exit PIN is set', 'NO exit PIN is set' in pg.inner_text('#kstat'), pg.inner_text('#kstat'))
    pg.click('#kbtn'); pg.wait_for_function("!document.fullscreenElement && Kiosk.view().mode === 'normal'")
    chk('...exit is immediate, with no fake PIN screen', not pg.evaluate(GATE_UP) and pg.evaluate(MODE) == 'normal')
    pg.click('#kbtn'); pg.wait_for_function(IN_KIOSK)
    pg.evaluate(BROWSER_EXIT); pg.wait_for_function("!document.fullscreenElement && Kiosk.view().mode === 'normal'")
    chk('...and a browser exit does not lock anything', not pg.evaluate(GATE_UP) and pg.evaluate(MODE) == 'normal')
    ctx.close()


def features_still_work(browser, r):
    """With a PIN set and LUNA in protected kiosk mode, everything else works as before."""
    chk = r.check
    ctx, pg = page(browser, r, scripts=[MOCK_SPEECH], settings={'idleSec': 0, 'voiceOn': True})
    with_pin(pg)
    enter(pg)
    go(pg, 'timer'); pg.click('[data-m="1"]'); pg.click('#tctl [data-act=start]')
    chk('kiosk: the timer runs', pg.inner_text('#tst') == 'Running')
    pg.click('#tctl [data-act=cancel]')
    pg.click('.screen.on [data-go=schedules]')
    create_rule_via_ui(pg, 'Kiosk rule', '09:30', 2)
    chk('kiosk: a schedule rule can be created', 'Kiosk rule' in pg.inner_text('#rlist'))
    pg.click('.screen.on [data-go=home]'); go(pg, 'assistant')
    pg.fill('.screen.on .cmd input', 'set a 3 minute timer'); pg.keyboard.press('Enter')
    chk('kiosk: typed assistant commands work', pg.evaluate("TimerEngine.snapshot().duration") == 180000)
    pg.click('.screen.on [data-go=home]'); pg.click('#talk'); pg.evaluate("__audio()"); pg.evaluate("__say([['pause the timer', true]])")
    chk('kiosk: push-to-talk voice commands work', pg.evaluate("TimerEngine.snapshot().state") == 'paused')
    go(pg, 'backgrounds')
    chk('kiosk: the backgrounds library opens', pg.locator('#lib .btn').count() == 7)
    pg.click('#bgback'); go(pg, 'settings')
    pg.click('button:has-text("24-hour")')
    chk('kiosk: settings still change', pg.evaluate("Settings.get().timeFormat") == '24')
    chk('kiosk: still fullscreen, still protected, no lock shown', pg.evaluate(FS) and pg.evaluate(MODE) == 'kiosk' and not pg.evaluate(GATE_UP))
    ctx.close()
