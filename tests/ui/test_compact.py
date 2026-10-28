"""Compact controls: the home toolbar and its More menu, touch-target sizes on every screen, the Settings rows,
and the spoken-replies voice picker. Measured in headless Chromium; a real 7-inch touchscreen still needs a check by hand."""
from helpers import go, open_page, advance, la, MOCK_SPEECH, MOCK_SYNTH, CLOCK_BLOCK

MIN_TAP = 44
SCREENS = ['timer', 'screentime', 'schedules', 'assistant', 'backgrounds', 'settings']

# Every visible, enabled button or field on the current screen that is smaller than a fingertip.
SMALL_TARGETS = """(min) => [...document.querySelectorAll('.screen.on button, .screen.on select, .screen.on input:not([type=range]):not([type=color]), #moremenu:not([hidden]) button')]
  .filter(e => e.offsetParent !== null && !e.disabled)
  .map(e => { const r = e.getBoundingClientRect(); return {t: (e.textContent || e.getAttribute('aria-label') || e.id).trim().slice(0, 30), w: r.width, h: r.height}; })
  .filter(b => b.h < min - 0.5 || b.w < min - 0.5)"""
SMALL_TEXT = """() => [...document.querySelectorAll('.screen.on .btn')].filter(e => e.offsetParent !== null)
  .map(e => parseFloat(getComputedStyle(e).fontSize)).filter(s => s < 14)"""
DOCK_ROWS = """() => new Set([...document.querySelectorAll('#dock > .btn, #dock > .more > .btn')].filter(e => e.offsetParent !== null)
  .map(e => Math.round(e.getBoundingClientRect().top))).size"""
DOCK_BOX = """() => { const r = document.getElementById('dock').getBoundingClientRect(); const items = [...document.querySelectorAll('#dock > .btn, #dock .more > .btn')]
  .filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect());
  return {top: Math.min(...items.map(b => b.top)), left: Math.min(...items.map(b => b.left)), right: Math.max(...items.map(b => b.right))}; }"""
SCREEN_NOW = "document.querySelector('.screen.on').dataset.screen"
MENU_OPEN = "!document.getElementById('moremenu').hidden"


def run(browser, r):
    r.group = 'compact: '
    toolbar(browser, r)
    touch_targets(browser, r)
    menu(browser, r)
    settings_rows(browser, r)
    voice_picker(browser, r)


def page(browser, r, viewport=(800, 480), **kw):
    kw.setdefault('settings', {'idleSec': 0, 'voiceOn': True})
    kw.setdefault('storage', {'luna.voice.consent.v1': '{"push":1}'})
    return open_page(browser, r, viewport=viewport, scripts=(MOCK_SPEECH, MOCK_SYNTH), label='compact', **kw)


def toolbar(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    chk('800×480: the home toolbar is a single row (it was two rows)', pg.evaluate(DOCK_ROWS) == 1, pg.evaluate(DOCK_ROWS))
    box, clock = pg.evaluate(DOCK_BOX), pg.evaluate(CLOCK_BLOCK)
    chk('800×480: the toolbar stays clear of the date line', box['top'] >= clock['bottom'], (box, clock['bottom']))
    chk('800×480: the toolbar fits the width', box['left'] >= 0 and box['right'] <= 800, box)
    chk('everyday controls are on the toolbar itself', all(pg.is_visible('#dock [data-go=%s]' % s) for s in ['timer', 'screentime', 'schedules']) and pg.is_visible('#talk'))
    chk('the rest are behind "More" (closed at start)', not pg.is_visible('#dock [data-go=settings]') and pg.get_attribute('#more', 'aria-expanded') == 'false')
    chk('every toolbar button has a drawn icon and a text label (no emoji needed)',
        pg.evaluate("[...document.querySelectorAll('#dock .btn')].every(b => b.querySelector('svg') && b.textContent.trim().length > 1)"))
    chk('the Talk label is plain text', pg.inner_text('#talk') == 'Talk')
    for w, h in [(480, 800), (1280, 800), (1024, 600)]:
        pg.set_viewport_size({'width': w, 'height': h}); pg.wait_for_timeout(100)
        box = pg.evaluate(DOCK_BOX)
        chk('%d×%d: the toolbar fits the width without horizontal scrolling' % (w, h),
            box['left'] >= 0 and box['right'] <= w and pg.evaluate("document.documentElement.scrollWidth") <= w, box)
    ctx.close()


def touch_targets(browser, r):
    chk = r.check
    for size in [(800, 480), (480, 800)]:
        ctx, pg = page(browser, r, viewport=size)
        small = pg.evaluate(SMALL_TARGETS, MIN_TAP)
        pg.click('#more')
        small += pg.evaluate(SMALL_TARGETS, MIN_TAP)
        pg.keyboard.press('Escape')
        for screen in SCREENS:
            pg.evaluate("s => { Nav.go(s); if (s === 'backgrounds') BgUI.enter(); }", screen); pg.wait_for_timeout(80)
            small += [dict(b, screen=screen) for b in pg.evaluate(SMALL_TARGETS, MIN_TAP)]
            chk('%dx%d %s: button text is at least 14 px' % (size[0], size[1], screen), pg.evaluate(SMALL_TEXT) == [], pg.evaluate(SMALL_TEXT))
        chk('%dx%d: every visible control on every screen is at least %d×%d px' % (size[0], size[1], MIN_TAP, MIN_TAP), small == [], small[:6])
        ctx.close()

    ctx, pg = page(browser, r)
    go(pg, 'settings')
    height = pg.evaluate("document.querySelector('.screen.on').scrollHeight")
    chk('800×480: the Settings screen is shorter than before (was 2082 px)', height < 2000, height)
    go_home(pg); go(pg, 'timer')
    chk('800×480: the Timer screen fits without scrolling (was 549 px)', pg.evaluate("document.querySelector('.screen.on').scrollHeight") <= 480,
        pg.evaluate("document.querySelector('.screen.on').scrollHeight"))
    ctx.close()


def go_home(pg):
    pg.click('.screen.on [data-go=home]')


def menu(browser, r):
    chk = r.check
    ctx, pg = page(browser, r, settings={'idleSec': 5}, clock=la(2026, 10, 26, 9, 0, 0))
    pg.click('#more')
    chk('More opens the menu above the toolbar', pg.evaluate(MENU_OPEN) and pg.get_attribute('#more', 'aria-expanded') == 'true')
    menu_box = pg.locator('#moremenu').bounding_box()
    chk('...entirely on screen', menu_box['y'] >= 0 and menu_box['x'] >= 0 and menu_box['x'] + menu_box['width'] <= 800, menu_box)
    pg.keyboard.press('Escape')
    chk('Escape closes it and puts focus back on More', not pg.evaluate(MENU_OPEN) and pg.evaluate("document.activeElement.id") == 'more')

    pg.click('#more'); pg.mouse.click(60, 60)
    chk('tapping elsewhere closes it, without doing anything else', not pg.evaluate(MENU_OPEN) and pg.evaluate(SCREEN_NOW) == 'home')

    pg.click('#more'); pg.click('#moremenu [data-go=assistant]')
    chk('choosing an item opens that screen and closes the menu', pg.evaluate(SCREEN_NOW) == 'assistant' and not pg.evaluate(MENU_OPEN))
    go_home(pg)
    pg.click('#more'); pg.click('#moremenu [data-go=backgrounds]')
    chk('Backgrounds opens from the menu (editor entered)', pg.evaluate(SCREEN_NOW) == 'backgrounds' and pg.locator('#lib .btn').count() == 7)
    pg.click('#bgback')

    pg.click('#more'); advance(pg, 5200); pg.wait_for_timeout(600)
    chk('when the controls hide (idle), the menu closes too', pg.evaluate("document.body.classList.contains('idle')") and not pg.evaluate(MENU_OPEN))

    pg.keyboard.press('Shift')
    pg.focus('#more'); pg.keyboard.press('Enter')
    chk('keyboard: Enter on More opens the menu and focuses its first item',
        pg.evaluate(MENU_OPEN) and pg.evaluate("document.activeElement.dataset.go") == 'assistant')
    pg.keyboard.press('Tab'); pg.keyboard.press('Enter')
    chk('keyboard: Tab + Enter chooses the next item', pg.evaluate(SCREEN_NOW) == 'backgrounds')
    ctx.close()


def settings_rows(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    go(pg, 'settings')
    pressed = pg.evaluate("[...document.querySelectorAll('#sets .seg .btn[aria-pressed=true]')].map(b => b.textContent)")
    chk('each setting is one row with a segmented control; the current choice is marked for screen readers',
        pressed == ['12-hour', 'Follow device', 'Never', 'On'], pressed)
    pg.click('#sets button:has-text("24-hour")')
    chk('choosing another value saves it and moves the highlight', pg.evaluate("Settings.get().timeFormat") == '24' and
        pg.get_attribute('#sets button:has-text("24-hour")', 'aria-pressed') == 'true' and
        pg.get_attribute('#sets button:has-text("12-hour")', 'aria-pressed') == 'false')
    chk('the segmented controls are labelled groups', pg.locator('#sets .seg[role=group][aria-label="Time format"]').count() == 1)
    pg.click('#sjump button:has-text("Kiosk & PIN")'); pg.wait_for_timeout(150)
    top = pg.evaluate("document.getElementById('kset').getBoundingClientRect().top")
    chk('the section bar jumps to a section (Kiosk & PIN is scrolled to the top)', top < 120, top)
    chk('...and stays reachable while scrolled', pg.is_visible('#sjump .btn') and
        pg.evaluate("document.querySelector('#sjump .btn').getBoundingClientRect().top") >= -1)
    ctx.close()


def voice_picker(browser, r):
    chk = r.check
    voices = "window.__voices=[{name:'eSpeak English',lang:'en-US',default:true,localService:true},{name:'Google US English',lang:'en-US',default:false,localService:false},{name:'Zarvox',lang:'en-US'},{name:'Anna',lang:'de-DE'}];"
    ctx, pg = open_page(browser, r, settings={'idleSec': 0}, scripts=(MOCK_SPEECH, voices, MOCK_SYNTH), label='compact')
    go(pg, 'settings')
    options = pg.evaluate("[...document.querySelectorAll('#ssvoice option')].map(o => o.textContent)")
    chk('Spoken replies offers "Automatic" plus this device\'s voices in the language, most natural first',
        options == ['Automatic (most natural available)', 'Google US English (en-US)', 'eSpeak English (en-US)'], options)
    chk('automatic choice prefers the more natural voice over eSpeak', 'Google US English' in pg.inner_text('#ssstat'), pg.inner_text('#ssstat'))
    pg.select_option('#ssvoice', 'eSpeak English')
    chk('choosing a voice by hand saves it and is used', pg.evaluate("Settings.get().speakVoice") == 'eSpeak English' and
        'eSpeak English' in pg.inner_text('#ssstat'))
    pg.click('#sstest')
    chk('...Test voice uses it, at the slightly slower eSpeak rate', pg.evaluate("__queue[0].voice.name") == 'eSpeak English' and pg.evaluate("__queue[0].rate") == 0.9)
    ctx.close()

    ctx, pg = open_page(browser, r, settings={'idleSec': 0, 'speakVoice': 'Voice from another PC'}, scripts=(MOCK_SPEECH, MOCK_SYNTH), label='compact')
    go(pg, 'settings')
    chk('a saved voice this device does not have falls back to automatic, and says so',
        'not on this device' in pg.inner_text('#ssvoice') and 'Test English' in pg.inner_text('#ssstat'), pg.inner_text('#ssstat'))
    ctx.close()
