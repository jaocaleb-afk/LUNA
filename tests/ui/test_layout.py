"""Clock centering: the clock must sit at the exact centre of the display, at several screen sizes,
with the controls visible AND hidden, and must not move when other overlays appear."""
from helpers import open_page, CLOCK_BLOCK, CLOCK_RECT, rects_equal

SIZES = [(800, 480), (1024, 600), (1280, 720), (1920, 1080), (480, 800), (600, 600)]


def centred(m, w, h, tol=2.0):
    return abs(m['cx'] - w / 2) <= tol and abs(m['cy'] - h / 2) <= tol and abs(m['hmCx'] - w / 2) <= tol


def run(browser, r):
    r.group = 'layout: '
    ctx, pg = open_page(browser, r, viewport=SIZES[1], settings={'idleSec': 5}, label='layout')

    # --- controls visible ---
    for w, h in SIZES:
        pg.set_viewport_size({'width': w, 'height': h}); pg.wait_for_timeout(120)
        m = pg.evaluate(CLOCK_BLOCK)
        r.check('centred with controls visible at %dx%d' % (w, h), centred(m, w, h) and not pg.evaluate("document.body.classList.contains('idle')"),
                'cx=%.1f cy=%.1f (want %.1f, %.1f)' % (m['cx'], m['cy'], w / 2, h / 2))
        r.check('no horizontal overflow at %dx%d' % (w, h), m['left'] >= 0 and m['right'] <= w and m['scrollW'] <= w, m)

    # --- overlays must not move the clock ---
    pg.set_viewport_size({'width': 1024, 'height': 600}); pg.wait_for_timeout(120)
    before = pg.evaluate(CLOCK_RECT)
    pg.evaluate("TimerEngine.start(60000,{label:'Morning timer',source:'rule'})"); pg.wait_for_timeout(150)
    r.check('timer readout appears without moving the clock', pg.is_visible('#tbadge') and rects_equal(before, pg.evaluate(CLOCK_RECT)))
    pg.evaluate("document.getElementById('vind').hidden=false;document.getElementById('vind').textContent='Listening…';"
                "const b=document.getElementById('vbubble');b.hidden=false;b.textContent='“set a 5 minute timer” → Starting a timer for 5 minutes.'")
    pg.wait_for_timeout(100)
    r.check('voice indicator and bubble appear without moving the clock', rects_equal(before, pg.evaluate(CLOCK_RECT)))
    pg.evaluate("document.getElementById('vind').hidden=true;document.getElementById('vbubble').hidden=true;TimerEngine.cancel()")

    # --- controls hidden (real 5 s idle timeout): same position, to the pixel ---
    shown = pg.evaluate(CLOCK_RECT)
    pg.wait_for_timeout(6200)
    r.check('controls hide after the idle timeout', pg.evaluate("document.body.classList.contains('idle')") and
            pg.evaluate("getComputedStyle(document.getElementById('dock')).visibility") == 'hidden')
    r.check('clock does not move when the controls hide (pixel-identical)', rects_equal(shown, pg.evaluate(CLOCK_RECT)),
            (shown, pg.evaluate(CLOCK_RECT)))
    for w, h in SIZES:
        pg.set_viewport_size({'width': w, 'height': h}); pg.wait_for_timeout(120)
        m = pg.evaluate(CLOCK_BLOCK)
        r.check('centred with controls hidden at %dx%d' % (w, h), centred(m, w, h) and pg.evaluate("document.body.classList.contains('idle')"),
                'cx=%.1f cy=%.1f' % (m['cx'], m['cy']))
    ctx.close()
