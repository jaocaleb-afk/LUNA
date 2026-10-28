"""Exit PIN setup in Settings: set (typed twice), change and remove (both need the current PIN), hashed storage,
and safe failure when the browser has no Web Crypto (as on a plain-http page)."""
import json
from helpers import go, open_page, rules_storage, rule_dict, INSECURE, NO_CRYPTO

SETTINGS = {'idleSec': 0}
STAT = "document.getElementById('pinstat').textContent"
ERR = "(document.getElementById('pinerr') || {}).textContent || ''"
RECORD = "localStorage.getItem('luna.pin.v1')"
ALL_STORAGE = "JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))"


def wait_idle_form(pg):
    """Wait until the (slow, deliberately) PIN hashing has finished."""
    pg.wait_for_function("!document.querySelector('#pinsave') || document.querySelector('#pinsave').textContent !== 'Checking…'", timeout=20000)


def fill(pg, **fields):
    for name, value in fields.items():
        pg.fill('#pin-' + name, value)
    pg.click('#pinsave')
    wait_idle_form(pg)


def run(browser, r):
    r.group = 'pin: '
    chk = r.check
    storage = rules_storage(rule_dict(name='Morning timer'))
    ctx, pg = open_page(browser, r, settings=SETTINGS, storage=storage, label='pin')
    go(pg, 'settings')
    chk('with no PIN, Settings says exit protection is NOT active', 'NOT active' in pg.evaluate(STAT), pg.evaluate(STAT))
    chk('...and the kiosk card says leaving would not be protected', 'No exit PIN is set' in pg.inner_text('#kstat'), pg.inner_text('#kstat'))
    before = json.loads(pg.evaluate(ALL_STORAGE))

    # ---- initial setup: typed twice ----
    pg.click('#pinnew')
    chk('setup asks for the PIN twice', pg.locator('#pin-new').count() == 1 and pg.locator('#pin-new2').count() == 1 and pg.locator('#pin-cur').count() == 0)
    chk('PIN boxes are masked number fields', pg.get_attribute('#pin-new', 'type') == 'password' and pg.get_attribute('#pin-new', 'inputmode') == 'numeric')
    fill(pg, new='2580', new2='2581')
    chk('mismatched confirmation is refused with a clear message', 'do not match' in pg.evaluate(ERR) and pg.evaluate(RECORD) is None, pg.evaluate(ERR))
    fill(pg, new='12a4', new2='12a4')
    chk('letters are refused', 'digits only' in pg.evaluate(ERR), pg.evaluate(ERR))
    fill(pg, new='12', new2='12')
    chk('too short is refused', '4 to 8' in pg.evaluate(ERR), pg.evaluate(ERR))
    fill(pg, new='1234', new2='1234')
    chk('an obvious sequence is refused', 'sequence' in pg.evaluate(ERR) and pg.evaluate(RECORD) is None, pg.evaluate(ERR))
    fill(pg, new='2580', new2='2580')
    chk('matching PINs are saved and protection is reported active', 'An exit PIN is set' in pg.evaluate(STAT), pg.evaluate(STAT))
    record = json.loads(pg.evaluate(RECORD))
    chk('stored as a salted PBKDF2-SHA256 hash (600,000 iterations)',
        record.get('kdf') == 'PBKDF2-SHA256' and record.get('iterations') == 600000 and set(record) == {'v', 'kdf', 'iterations', 'salt', 'key'}, record)
    everything = pg.evaluate(ALL_STORAGE)
    chk('the PIN itself appears nowhere in localStorage', '2580' not in everything)
    after = json.loads(pg.evaluate(ALL_STORAGE))
    after.pop('luna.pin.v1')
    chk('setting the PIN changed no other saved data (settings, schedules, backgrounds)', after == before, (before.keys(), after.keys()))
    chk('the PIN check really verifies (correct accepted, wrong refused)',
        pg.evaluate("PinStore.verify('2580').then(r => r.ok)") and not pg.evaluate("PinStore.verify('2581').then(r => r.ok)"))

    # ---- change: needs the current PIN ----
    pg.click('#pinchg')
    fill(pg, cur='0000', new='3691', new2='3691')
    chk('change with the wrong current PIN is refused and nothing changes',
        'Current PIN: Wrong PIN' in pg.evaluate(ERR) and json.loads(pg.evaluate(RECORD)) == record, pg.evaluate(ERR))
    fill(pg, cur='2580', new='3691', new2='3692')
    chk('change still needs the new PIN typed twice', 'do not match' in pg.evaluate(ERR) and json.loads(pg.evaluate(RECORD)) == record)
    fill(pg, cur='2580', new='3691', new2='3691')
    changed = json.loads(pg.evaluate(RECORD))
    chk('change with the right current PIN stores a new hash with a new salt', changed['salt'] != record['salt'] and 'An exit PIN is set' in pg.evaluate(STAT))
    chk('...the old PIN no longer works and the new one does',
        not pg.evaluate("PinStore.verify('2580').then(r => r.ok)") and pg.evaluate("PinStore.verify('3691').then(r => r.ok)"))

    # ---- survives reload and Restore defaults ----
    pg.reload(); pg.wait_for_timeout(200)
    go(pg, 'settings')
    chk('the PIN is still set after a reload', 'An exit PIN is set' in pg.evaluate(STAT) and pg.evaluate("PinStore.verify('3691').then(r => r.ok)"))
    pg.click('#reset'); pg.click('#yes')
    chk('Restore defaults keeps the exit PIN', json.loads(pg.evaluate(RECORD)) == changed)

    # ---- remove: needs the current PIN ----
    pg.click('#pinrm')
    chk('remove asks only for the current PIN', pg.locator('#pin-cur').count() == 1 and pg.locator('#pin-new').count() == 0)
    fill(pg, cur='2580')
    chk('remove with the wrong PIN is refused; the PIN stays', 'Wrong PIN' in pg.evaluate(ERR) and pg.evaluate(RECORD) is not None)
    pg.click('#pinform button:has-text("Cancel")')
    chk('Cancel closes the form without changes', pg.locator('#pinform').count() == 0 and pg.evaluate(RECORD) is not None)
    pg.click('#pinrm')
    fill(pg, cur='3691')
    chk('remove with the right PIN deletes the record', pg.evaluate(RECORD) is None and 'NOT active' in pg.evaluate(STAT))
    chk('...and leaves schedules in place', 'Morning timer' in pg.evaluate("localStorage.getItem('luna.rules.v1')"))
    ctx.close()

    # ---- no Web Crypto (what a plain-http LAN page gets): fail safe, never plaintext ----
    ctx, pg = open_page(browser, r, settings=SETTINGS, scripts=[INSECURE, NO_CRYPTO], label='pin')
    go(pg, 'settings')
    chk('without Web Crypto, Settings explains why a PIN cannot be set',
        'Web Crypto' in pg.evaluate(STAT) and 'https://' in pg.evaluate(STAT) and 'NOT active' in pg.evaluate(STAT), pg.evaluate(STAT))
    chk('...offers no way to set one, and nothing is stored', pg.locator('#pinnew').count() == 0 and pg.evaluate(RECORD) is None)
    chk('...even a direct save attempt fails instead of storing plaintext',
        pg.evaluate("PinStore.save('2580').then(() => 'saved', e => e.message)") == 'crypto-unavailable' and pg.evaluate(RECORD) is None)
    ctx.close()

    # ---- the browser refuses to store it: say so, never claim it was saved ----
    block = "(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'luna.pin.v1') throw new Error('QuotaExceededError'); return set.call(this, k, v); }; })();"
    ctx, pg = open_page(browser, r, settings=SETTINGS, scripts=[block], label='pin')
    go(pg, 'settings'); pg.click('#pinnew')
    fill(pg, new='2580', new2='2580')
    chk('if the browser will not store the PIN, the error says so and protection stays NOT active',
        'did not save the PIN' in pg.evaluate(ERR) and 'NOT active' in pg.evaluate(STAT) and not pg.evaluate("PinStore.isSet()"), pg.evaluate(ERR))
    ctx.close()

    # ---- unreadable stored record: protection is reported OFF, not pretended ----
    ctx, pg = open_page(browser, r, settings=SETTINGS, storage={'luna.pin.v1': json.dumps({'pin': '1234'})}, label='pin')
    go(pg, 'settings')
    chk('a corrupt PIN record is reported, protection shown as NOT active', 'could not be read' in pg.evaluate(STAT), pg.evaluate(STAT))
    chk('...and a new PIN can be set over it', pg.locator('#pinnew').count() == 1)
    ctx.close()
