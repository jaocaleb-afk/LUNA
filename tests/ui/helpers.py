"""Shared helpers for the browser (Playwright) tests.

Targets:  python3 tests/run_ui_tests.py                       (opens ../index.html from disk)
          LUNA_URL=http://192.168.1.97:8082 python3 tests/run_ui_tests.py   (a running server)
Note: voice tests use a MOCK SpeechRecognition. They test LUNA's logic, not a real microphone.
"""
import json
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
URL = os.environ.get('LUNA_URL') or 'file://' + os.path.abspath(os.path.join(HERE, '..', '..', 'index.html'))
TZ_NAME = 'America/Los_Angeles'
LA = ZoneInfo(TZ_NAME)


def la(y, mo, d, h=0, mi=0, s=0):
    """A timezone-AWARE local datetime. (A naive datetime would be read as UTC by Playwright.)"""
    return datetime(y, mo, d, h, mi, s, tzinfo=LA)


class Run:
    """Collects PASS/FAIL results and any browser console errors from every test file."""

    def __init__(self):
        self.results = []
        self.errors = []
        self.group = ''

    def check(self, name, condition, detail=''):
        ok = bool(condition)
        self.results.append((self.group + name, ok))
        print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '   <-- ' + str(detail)))
        return ok

    def failed(self):
        return [n for n, ok in self.results if not ok]


# ---- init scripts (run in the page before LUNA loads) ----

def seed_storage_script(settings=None, extra=None):
    """Writes localStorage values only if they are absent, so a reload keeps whatever the test changed."""
    items = dict(extra or {})
    if settings is not None:
        items['luna.settings.v1'] = json.dumps(settings)
    return ('(()=>{try{const items=%s;for(const k in items)if(localStorage.getItem(k)===null)localStorage.setItem(k,items[k])}catch(e){}})();'
            % json.dumps(items))


MOCK_SPEECH = r"""
(() => {
  window.__recs = [];
  window.__perm = window.__perm || 'prompt';
  class MockRecognition {
    constructor() { window.__recs.push(this); this.started = false; this.aborted = false; }
    start() { this.started = true; }
    stop() { this.started = false; this.onend && this.onend(); }
    abort() { this.aborted = true; this.started = false; }
  }
  window.SpeechRecognition = MockRecognition;
  window.webkitSpeechRecognition = MockRecognition;
  window.__last = () => window.__recs[window.__recs.length - 1];
  window.__audio = () => __last().onaudiostart();
  window.__err = (code) => __last().onerror({ error: code });
  window.__say = (items, idx = 0) => __last().onresult({ resultIndex: idx,
      results: items.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: !!f })) });
  try { Object.defineProperty(navigator.permissions, 'query', { value: async () => ({ state: window.__perm }) }); } catch (e) {}
})();
"""

NO_SPEECH = ("Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});"
             "Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true});")
INSECURE = "Object.defineProperty(window,'isSecureContext',{value:false,configurable:true});"


def open_page(browser, run, *, viewport=(1024, 600), settings=None, storage=None, clock=None,
              scripts=(), hash='', label='', touch=False):
    """Open LUNA in a fresh browser context (clean localStorage), US Pacific time zone.

    clock: an aware datetime. The page's clock is then FROZEN at that instant; use advance() to move it.
    Returns (context, page).
    """
    ctx = browser.new_context(timezone_id=TZ_NAME, locale='en-US', viewport={'width': viewport[0], 'height': viewport[1]}, has_touch=touch)
    page = ctx.new_page()
    page.on('console', lambda m: run.errors.append(label + ': ' + m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: run.errors.append(label + ': ' + str(e)))
    for script in scripts:
        page.add_init_script(script)
    page.add_init_script(seed_storage_script(settings, storage))
    if clock:
        # Install a few seconds early (real time flows while the page loads), then freeze exactly at `clock`.
        # The margin is kept small so timers armed at load (e.g. the idle countdown) do not expire in the jump.
        page.clock.install(time=clock - timedelta(seconds=4))
    page.goto(URL + hash)
    if clock:
        page.clock.pause_at(clock)
        page.keyboard.press('Shift')  # one interaction at the freeze point: the idle countdown starts from `clock`
    page.wait_for_timeout(150)
    return ctx, page


def advance(page, ms):
    """Move the frozen page clock forward, running every timer that comes due (like real time passing)."""
    page.clock.run_for(int(ms))


def jump(page, ms):
    """Jump the page clock forward at once (simulates the device sleeping): due timers fire only once."""
    page.clock.fast_forward(int(ms))


def js(page, expression):
    return page.evaluate(expression)


def go(page, screen):
    """Navigate by clicking the dock button, like a person would (dock must be visible)."""
    page.click('#dock [data-go=%s]' % screen)


def rects_equal(a, b, tol=0.01):
    return all(abs(a[k] - b[k]) <= tol for k in ('left', 'top', 'width', 'height'))


CLOCK_RECT = """() => { const r = document.getElementById('hm').getBoundingClientRect();
  return {left:r.left, top:r.top, width:r.width, height:r.height}; }"""

# Union box of the four clock lines, so we measure the whole clock block, not just the digits.
CLOCK_BLOCK = """() => { const rs = ['hm','sec','date','tzl'].map(i => document.getElementById(i).getBoundingClientRect());
  const l = Math.min(...rs.map(r => r.left)), r = Math.max(...rs.map(r => r.right));
  const t = Math.min(...rs.map(r => r.top)), b = Math.max(...rs.map(r => r.bottom));
  const hm = document.getElementById('hm').getBoundingClientRect();
  return {cx:(l+r)/2, cy:(t+b)/2, left:l, right:r, top:t, bottom:b, hmCx:hm.left+hm.width/2,
          scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight}; }"""


# ---- schedule rule helpers ----

def rule_dict(name='Morning timer', time='09:00', seconds=120, repeat='daily', days=(), enabled=True,
              armed=None, rid=None, last_key=''):
    """A stored rule, armed at `armed` (default: one hour before the usual test start)."""
    armed = armed or la(2026, 10, 26, 7, 0, 0)
    return {'id': rid or 'r_' + name.lower().replace(' ', '_'), 'name': name, 'time': time, 'action': 'timer.start',
            'seconds': seconds, 'repeat': repeat, 'days': list(days), 'enabled': enabled,
            'armedAt': int(armed.timestamp() * 1000), 'lastKey': last_key, 'lastResult': None}


def rules_storage(*rules):
    """localStorage seed for open_page(storage=...) that preloads schedule rules."""
    return {'luna.rules.v1': json.dumps({'rules': list(rules), 'log': []})}


def create_rule_via_ui(page, name, time, mins, secs=0, repeat='Every day', days=()):
    """Fill in and save the New rule form the way a person would. Returns nothing; check the list afterwards."""
    page.click('#rnew')
    page.fill('#r-name', name)
    page.fill('#r-time', time)
    page.fill('#r-min', str(mins))
    page.fill('#r-sec', str(secs))
    page.click('#redit button:has-text("%s")' % repeat)
    for d in days:
        page.click('#redit .days button:has-text("%s")' % d)
    page.click('#redit button:has-text("Save rule")')
