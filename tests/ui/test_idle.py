"""Idle behaviour: controls hide after a configurable inactivity period and come back on interaction.
The page clock is frozen and advanced by hand, so a 5-minute timeout takes milliseconds to test."""
from helpers import go, open_page, advance, la

START = la(2026, 10, 26, 8, 0, 0)
IS_IDLE = "document.body.classList.contains('idle')"
DOCK_VISIBILITY = "getComputedStyle(document.getElementById('dock')).visibility"
SCREEN = "document.querySelector('.screen.on').dataset.screen"


def fresh(browser, r, idle=5, **kw):
    return open_page(browser, r, clock=START, settings={'idleSec': idle}, label='idle', **kw)


def run(browser, r):
    r.group = 'idle: '
    chk = r.check

    # ---- basic hide / reveal / reset ----
    ctx, pg = fresh(browser, r)
    chk('controls are visible at start', pg.evaluate(DOCK_VISIBILITY) == 'visible' and not pg.evaluate(IS_IDLE))
    advance(pg, 4900); chk('still visible just before the timeout', not pg.evaluate(IS_IDLE))
    advance(pg, 200); pg.wait_for_timeout(700)
    chk('controls hidden after the timeout', pg.evaluate(IS_IDLE) and pg.evaluate(DOCK_VISIBILITY) == 'hidden')
    chk('clock stays visible while idle', pg.is_visible('#hm') and ':' in pg.inner_text('#hm'))
    chk('hidden controls cannot receive keyboard focus', pg.evaluate("!document.activeElement.closest('#dock')"))

    pg.keyboard.press('Shift'); chk('any interaction reveals the controls', not pg.evaluate(IS_IDLE) and pg.evaluate(DOCK_VISIBILITY) == 'visible')
    advance(pg, 3000); pg.keyboard.press('Shift'); advance(pg, 3000)
    chk('each interaction restarts the countdown', not pg.evaluate(IS_IDLE))
    advance(pg, 2100); chk('...and it hides once nothing happens for the full timeout', pg.evaluate(IS_IDLE))

    # ---- the revealing tap must not press a hidden button ----
    pg.keyboard.press('Shift'); pg.wait_for_timeout(100)
    box = pg.locator('#dock [data-go=timer]').bounding_box()
    advance(pg, 5200); pg.wait_for_timeout(700)
    chk('(setup) hidden again before tapping', pg.evaluate(IS_IDLE))
    pg.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    chk('tapping where "Timer" is only reveals the controls', not pg.evaluate(IS_IDLE) and pg.evaluate(SCREEN) == 'home', pg.evaluate(SCREEN))
    advance(pg, 800)
    go(pg, 'settings')
    chk('a second tap on the revealed button works', pg.evaluate(SCREEN) == 'settings')
    ctx.close()

    # ---- same thing with a real touchscreen (the kiosk): the tap must not press the button that appears ----
    ctx, pg = fresh(browser, r, touch=True)
    box = pg.locator('#dock [data-go=timer]').bounding_box()
    advance(pg, 5200); pg.wait_for_timeout(700)
    pg.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    pg.wait_for_timeout(100)
    chk('touch: tapping where "Timer" is only reveals the controls (does not press it)',
        not pg.evaluate(IS_IDLE) and pg.evaluate(SCREEN) == 'home', pg.evaluate(SCREEN))
    advance(pg, 800)
    pg.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    pg.wait_for_timeout(100)
    chk('touch: the next tap on the visible button works', pg.evaluate(SCREEN) == 'timer', pg.evaluate(SCREEN))
    ctx.close()

    # ---- no flashing from background clock updates ----
    ctx, pg = fresh(browser, r)
    advance(pg, 5200); pg.wait_for_timeout(700)
    pg.evaluate("""window.__muts = 0; const o = new MutationObserver(m => window.__muts += m.length);
        o.observe(document.body, {attributes: true, attributeFilter: ['class']});
        o.observe(document.getElementById('dock'), {attributes: true});""")
    bar_before = pg.evaluate("document.querySelector('#sec i').style.width")
    advance(pg, 12000)
    chk('the clock kept updating while idle', pg.evaluate("document.querySelector('#sec i').style.width") != bar_before)
    chk('12 clock updates caused 0 changes to the controls (no flashing)', pg.evaluate("window.__muts") == 0, pg.evaluate("window.__muts"))
    ctx.close()

    # ---- things that must stay visible ----
    ctx, pg = fresh(browser, r)
    pg.evaluate("TimerEngine.start(60000)")
    advance(pg, 6000); pg.wait_for_timeout(700)
    chk('a running timer stays visible while controls are hidden', pg.evaluate(IS_IDLE) and pg.is_visible('#tbadge'))
    chk('...with its remaining time counting down', pg.inner_text('#tbt') in ('0:54', '0:55'), pg.inner_text('#tbt'))
    pg.evaluate("TimerEngine.cancel()")

    pg.evaluate("TimerEngine.start(3000)")
    advance(pg, 7000); pg.wait_for_timeout(300)
    chk('a timer alert shows while controls are hidden', pg.is_visible('#alarm') and 'Time’s up' in pg.inner_text('#alt'))
    chk('the alert has the right role and focus', pg.get_attribute('#alarm', 'role') == 'alertdialog' and pg.evaluate("document.activeElement.id") == 'dis')
    pg.keyboard.press('Enter')
    chk('the alert can be dismissed from the keyboard', not pg.is_visible('#alarm'))
    ctx.close()

    # ---- keyboard and other ways in ----
    ctx, pg = fresh(browser, r)
    advance(pg, 5200); pg.wait_for_timeout(700)
    pg.keyboard.press('Tab')
    chk('Tab on the hidden display reveals the controls and focuses the first one',
        not pg.evaluate(IS_IDLE) and pg.evaluate("document.activeElement.dataset.go") == 'timer')
    pg.keyboard.press('Enter')
    chk('Enter then opens it', pg.evaluate(SCREEN) == 'timer')
    pg.click('.screen.on [data-go=home]')
    advance(pg, 5200); pg.wait_for_timeout(700)
    pg.evaluate("location.hash = '#settings'")
    chk('Settings is reachable with controls hidden via /#settings', pg.evaluate(SCREEN) == 'settings')
    ctx.close()

    # ---- other screens return to the clock; dialogs hold the countdown ----
    ctx, pg = fresh(browser, r)
    go(pg, 'settings')
    advance(pg, 10000); chk('a sub-screen does not vanish after only the home timeout', pg.evaluate(SCREEN) == 'settings')
    advance(pg, 21000); pg.wait_for_timeout(700)
    chk('after 30 s of inactivity a sub-screen returns to the clock with controls hidden', pg.evaluate(SCREEN) == 'home' and pg.evaluate(IS_IDLE))
    pg.keyboard.press('Shift'); go(pg, 'settings')
    pg.click('#reset'); advance(pg, 120000)
    chk('an open dialog is never auto-closed or navigated away from', pg.evaluate("document.getElementById('dlg').open") and pg.evaluate(SCREEN) == 'settings')
    pg.click('#no'); advance(pg, 31000)
    chk('once the dialog closes the countdown resumes', pg.evaluate(SCREEN) == 'home')
    ctx.close()

    # ---- configurable in Settings (and remembered) ----
    ctx, pg = fresh(browser, r)
    go(pg, 'settings'); pg.click('button:has-text("30 sec")')
    chk('timeout choice is saved', pg.evaluate("Settings.get().idleSec") == 30 and pg.evaluate("JSON.parse(localStorage.getItem('luna.settings.v1')).idleSec") == 30)
    pg.click('.screen.on [data-go=home]'); advance(pg, 29000)
    chk('a 30 s timeout does not hide at 29 s', not pg.evaluate(IS_IDLE))
    advance(pg, 1500); chk('...and does at 30 s', pg.evaluate(IS_IDLE))
    pg.keyboard.press('Shift'); go(pg, 'settings'); pg.click('button:has-text("Never")')
    pg.click('.screen.on [data-go=home]'); advance(pg, 600000)
    chk('"Never" keeps the controls up', not pg.evaluate(IS_IDLE))
    pg.reload(); pg.wait_for_timeout(200)
    chk('the setting survives a reload', pg.evaluate("Settings.get().idleSec") == 0,
        (pg.evaluate("Settings.get().idleSec"), pg.evaluate("localStorage.getItem('luna.settings.v1')")))
    ctx.close()
