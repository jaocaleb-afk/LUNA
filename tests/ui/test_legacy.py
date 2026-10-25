"""The ORIGINAL UI checks (backgrounds, settings, timer, text commands, corrupt storage), kept as they were.
Only selectors changed where the UI did (e.g. timer buttons now carry data-act)."""
import json
from helpers import open_page

NEVER_HIDE = {'idleSec': 0}  # these older checks click around slowly; do not let the controls fade mid-test


def run(browser, r):
    r.group = 'legacy: '
    ctx, pg = open_page(browser, r, settings=NEVER_HIDE, label='legacy')
    chk = r.check

    chk('home clock renders', ':' in pg.inner_text('#hm'))
    pg.click('#dock [data-go=backgrounds]'); pg.wait_for_timeout(200)
    chk('library has 7 defaults', pg.locator('#lib .btn').count() == 7)
    pg.click('#bgnew'); pg.wait_for_timeout(100)
    pg.locator('.stop input[type=text]').first.fill('#ff0000'); pg.wait_for_timeout(100)
    bg = pg.evaluate("document.getElementById('bgl').style.background")
    chk('live preview uses typed hex', '255, 0, 0' in bg or 'ff0000' in bg)
    pg.locator('.stop input[type=text]').first.fill('#zzz')
    chk('invalid hex flagged', pg.locator('.stop input.bad').count() == 1)
    pg.locator('.stop input[type=text]').first.fill('#ff0000')
    pg.click('text=Add color stop'); chk('add stop', pg.locator('.stop').count() == 3)
    pg.locator('.stop .btn').last.click(); chk('remove stop', pg.locator('.stop').count() == 2)
    pg.fill('.f input[type=text]', 'Test red'); pg.click('#ed button.pri'); pg.wait_for_timeout(100)
    chk('saved to library', pg.locator('#lib .btn').count() == 8)
    pg.click('text=Radial'); pg.click('text=Duplicate'); chk('duplicate', pg.locator('#lib .btn').count() == 9)
    pg.click('text=Animated'); pg.wait_for_timeout(100)
    chk('animated applies animation', pg.evaluate("getComputedStyle(document.getElementById('bgl')).animationName") != 'none')
    pg.click('text=Use as background'); pg.reload(); pg.wait_for_timeout(300)
    chk('persists across reload', json.loads(pg.evaluate("localStorage.getItem('luna.bg.v2')"))['active'] != 'midnight')
    pg.click('#dock [data-go=settings]'); pg.click('button:has-text("Reduce")'); pg.wait_for_timeout(100)
    chk('reduced motion stops animation', pg.evaluate("getComputedStyle(document.getElementById('bgl')).animationName") == 'none')
    pg.click('#reset'); pg.click('#yes'); pg.wait_for_timeout(100)
    chk('restore defaults', len(json.loads(pg.evaluate("localStorage.getItem('luna.bg.v2')"))['list']) == 7)

    pg.click('.screen.on [data-go=home]'); pg.click('#dock [data-go=timer]'); pg.click('[data-m="1"]')
    pg.click('#tctl [data-act=start]'); pg.wait_for_timeout(300)
    chk('timer runs', pg.inner_text('#tst') == 'Running')
    pg.click('#tctl [data-act=pause]'); chk('timer pauses', pg.inner_text('#tst') == 'Paused')
    pg.click('#tctl [data-act=cancel]')
    pg.click('.screen.on [data-go=home]'); pg.click('#dock [data-go=assistant]')
    pg.fill('.cmd input', 'set a 5 minute timer'); pg.keyboard.press('Enter')
    chk('text command drives timer', pg.evaluate("TimerEngine.snapshot().state") == 'running')

    pg.goto(pg.url.split('#')[0])
    pg.evaluate("localStorage.setItem('luna.bg.v2',JSON.stringify({list:[{type:'gradient',stops:[{c:'url(x)',p:0},{c:'#fff',p:1}]}],active:'x'}))")
    pg.reload(); pg.wait_for_timeout(200)
    chk('corrupt storage falls back to defaults', pg.evaluate("Library.all().length") == 7)
    ctx.close()
