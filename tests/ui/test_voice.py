"""Voice (push-to-talk), tested against a MOCK SpeechRecognition (see helpers.MOCK_SPEECH).
These checks prove LUNA's own behaviour: consent, honest status, command handling, error wording, page-security checks.
They do NOT prove that a real microphone or Google's speech service works on your device: see README "Real-device checks"."""
import json
from helpers import open_page, la, MOCK_SPEECH, NO_SPEECH, INSECURE, NO_CRYPTO, create_rule_via_ui

SETTINGS = {'idleSec': 0}
RECS = "window.__recs.length"
VSTATE = "document.querySelector('#vset .vstate').textContent"


def page(browser, r, scripts=(MOCK_SPEECH,), settings=SETTINGS, storage=None, clock=None):
    return open_page(browser, r, settings=settings, storage=storage, scripts=scripts, clock=clock, label='voice')


def enable_voice(pg):
    pg.click('#dock [data-go=settings]'); pg.click('#vtoggle'); pg.click('#vyes')


def home(pg):
    pg.click('.screen.on [data-go=home]')


def talk(pg):
    """Turn voice on, go home and tap Talk."""
    enable_voice(pg); home(pg); pg.click('#talk')


def run(browser, r):
    r.group = 'voice: '
    push_to_talk(browser, r)
    stopping(browser, r)
    errors(browser, r)
    page_security(browser, r)
    insecure_page_still_works(browser, r)
    lifecycle(browser, r)


def push_to_talk(browser, r):
    chk = r.check
    # ---- off by default, nothing opened ----
    ctx, pg = page(browser, r)
    chk('voice is OFF by default and no microphone/recogniser has been created', pg.evaluate(RECS) == 0 and not pg.evaluate("Settings.get().voiceOn"))
    chk('no Talk button and no listening indicator on the home screen', not pg.is_visible('#talk') and not pg.is_visible('#vind'))
    pg.click('#dock [data-go=settings]')
    chk('Settings says plainly that nothing is listening', 'Voice is off. Nothing is listening.' in pg.inner_text('#vset'))
    chk('...and discloses the cloud speech service up front', 'Google' in pg.inner_text('#vset') and 'never records or stores audio' in pg.inner_text('#vset'))
    chk('...and reports that this page is a secure context, naming its address',
        pg.inner_text('#vsec').startswith('Secure page: ' + pg.evaluate('location.origin')), pg.inner_text('#vsec'))
    body = pg.evaluate("document.body.innerText + document.documentElement.innerHTML")
    chk('there is no wake phrase or always-listen control anywhere in the page',
        'Hey LUNA' not in body and 'Always listen' not in body and pg.locator('#wtoggle').count() == 0)

    # ---- consent dialog ----
    pg.click('#vtoggle')
    dlg = pg.inner_text('#vdlg')
    chk('turning voice on shows a disclosure dialog first', pg.evaluate("document.getElementById('vdlg').open") and 'sent to Google’s servers' in dlg, dlg)
    pg.click('#vno')
    chk('Cancel leaves voice off, with no recogniser created', not pg.evaluate("Settings.get().voiceOn") and pg.evaluate(RECS) == 0)
    pg.click('#vtoggle'); pg.click('#vyes')
    chk('agreeing turns voice on', pg.evaluate("Settings.get().voiceOn"))
    chk('...but the microphone is STILL not opened (only when Talk is tapped)', pg.evaluate(RECS) == 0)
    chk('...consent is recorded', pg.evaluate("'push' in JSON.parse(localStorage.getItem('luna.voice.consent.v1'))"))
    home(pg)
    chk('a Talk button now appears on the home screen', pg.is_visible('#talk') and pg.inner_text('#talk') == '🎤 Talk')

    # ---- push-to-talk: honest states, no wake phrase ----
    pg.click('#talk')
    chk('Talk opens ONE non-continuous recogniser (this is when the browser asks for permission)',
        pg.evaluate(RECS) == 1 and pg.evaluate("__last().continuous") is False and pg.evaluate("__last().started"))
    chk('while starting, the Talk button becomes Cancel and no "Listening" is shown',
        pg.inner_text('#talk') == '■ Cancel' and 'Listening' not in pg.inner_text('#vind'), pg.inner_text('#vind'))
    pg.click('#dock [data-go=assistant]')
    chk('before audio starts it says "not listening yet"', 'not listening yet' in pg.inner_text('#vcard .vstate'), pg.inner_text('#vcard .vstate'))
    pg.evaluate("__audio()")
    chk('once audio really starts it says it is listening', pg.inner_text('#vcard .vstate') == 'Listening for your command…')
    home(pg)
    chk('home shows a visible "Listening…" indicator and a Stop button', pg.is_visible('#vind') and 'Listening…' in pg.inner_text('#vind') and pg.inner_text('#talk') == '■ Stop')
    pg.evaluate("__say([['set a five minute', false]])")
    chk('the recognised words are shown while speaking', 'set a five minute' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    pg.evaluate("__say([['set a five minute timer', true]])")
    chk('the command ran with no wake phrase: a 5:00 timer started', pg.evaluate("TimerEngine.snapshot().duration") == 300000)
    chk('the recognised command AND the response are displayed', 'set a five minute timer' in pg.inner_text('#vbubble') and 'Timer set for 5:00' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    chk('the microphone stops after the command, the indicator goes away and Talk is back',
        not pg.evaluate("__last().started") and not pg.is_visible('#vind') and pg.inner_text('#talk') == '🎤 Talk')
    pg.click('#talk'); pg.evaluate("__audio()"); pg.evaluate("__say([['what time is it', true]])")
    chk('each tap is a fresh session; "what time is it" is answered', pg.evaluate(RECS) == 2 and 'It is' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    pg.click('#talk'); pg.evaluate("__audio()"); pg.evaluate("__say([['open settings', true]])")
    chk('a voice command can navigate ("open settings")', pg.evaluate("document.querySelector('.screen.on').dataset.screen") == 'settings')
    pg.click('.screen.on [data-go=home]'); pg.click('#dock [data-go=assistant]')
    chk('the Assistant screen keeps a short history of voice commands', 'set a five minute timer' in pg.inner_text('#vlog'))
    ctx.close()


def stopping(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    talk(pg); pg.evaluate("__audio()")
    pg.click('#talk')
    chk('tapping Stop while listening closes the microphone', pg.evaluate("__last().aborted") and not pg.is_visible('#vind'))
    chk('...and does not report "didn’t catch" for a deliberate stop', not pg.is_visible('#vbubble'))
    pg.click('#talk')
    pg.click('#talk')
    chk('tapping Cancel while still starting also closes it', pg.evaluate("__last().aborted") and pg.inner_text('#talk') == '🎤 Talk')
    pg.click('#dock [data-go=assistant]'); pg.click('#vtalk'); pg.evaluate("__audio()")
    chk('the Assistant screen Talk button turns into Stop while listening', pg.inner_text('#vtalk') == '■ Stop')
    pg.click('#vtalk')
    chk('...and stops it', pg.evaluate("__last().aborted") and pg.inner_text('#vtalk') == '🎤 Talk')
    ctx.close()

    # silence: no command heard
    ctx, pg = page(browser, r, clock=la(2026, 10, 26, 8, 0, 0))
    talk(pg); pg.evaluate("__audio()")
    pg.clock.run_for(8500)
    chk('silence after Talk gives "I didn’t catch a command" and stops listening',
        'didn’t catch' in pg.inner_text('#vbubble') and not pg.is_visible('#vind') and pg.evaluate("__last().aborted"))
    pg.click('#talk'); pg.evaluate("__audio()"); pg.evaluate("__err('no-speech')")
    chk('the browser\'s own "no-speech" is treated the same way (not as a failure)',
        'didn’t catch' in pg.inner_text('#vbubble') and 'Not working' not in pg.evaluate("document.querySelector('#vcard .vstate').textContent"))
    ctx.close()


def errors(browser, r):
    chk = r.check
    cases = [('not-allowed', 'Microphone permission is blocked'), ('audio-capture', 'No microphone was found'),
             ('service-not-allowed', 'refused to start speech recognition'), ('network', 'internet connection'),
             ('language-not-supported', 'language is not supported')]
    for code, text in cases:
        ctx, pg = page(browser, r)
        talk(pg)
        pg.evaluate("__err('%s')" % code)
        pg.click('#dock [data-go=settings]')
        chk('error "%s" is explained in plain words' % code, 'Not working' in pg.evaluate(VSTATE) and text in pg.evaluate(VSTATE), pg.evaluate(VSTATE))
        chk('...and the microphone is released', pg.evaluate("__last().aborted"))
        ctx.close()

    ctx, pg = page(browser, r)
    talk(pg)
    pg.evaluate("__err('weird-unknown-code')")
    chk('an unknown error code is still reported, not hidden', 'weird-unknown-code' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    chk('after an error the home indicator says voice is unavailable (not listening)', 'Voice unavailable' in pg.inner_text('#vind'))
    pg.click('#talk')
    chk('Talk can try again after an error', pg.evaluate(RECS) == 2 and 'Starting mic' in pg.inner_text('#vind'))
    ctx.close()

    # permission already blocked in the browser: explained BEFORE tapping Talk, by reading (not requesting) it
    ctx, pg = page(browser, r, scripts=["window.__perm='denied';", MOCK_SPEECH])
    pg.click('#dock [data-go=settings]')
    chk('a microphone permission already blocked in the browser is explained up front, with the fix',
        'Microphone permission is blocked' in pg.evaluate(VSTATE) and 'Site settings' in pg.evaluate(VSTATE), pg.evaluate(VSTATE))
    chk('...without creating a recogniser', pg.evaluate(RECS) == 0)
    ctx.close()

    # unsupported browser
    ctx, pg = page(browser, r, scripts=[NO_SPEECH])
    pg.click('#dock [data-go=settings]')
    chk('unsupported browser: says so clearly', 'no speech recognition' in pg.evaluate(VSTATE), pg.evaluate(VSTATE))
    chk('...and the "Turn voice on" button is disabled', pg.is_disabled('#vtoggle'))
    chk('...and no Talk button or indicator is ever shown', not pg.is_visible('#talk') and not pg.is_visible('#vind'))
    ctx.close()


def page_security(browser, r):
    chk = r.check
    # insecure page (plain http on a LAN address): the browser blocks the microphone
    ctx, pg = page(browser, r, scripts=[INSECURE, MOCK_SPEECH])
    pg.click('#dock [data-go=settings]')
    state = pg.evaluate(VSTATE)
    chk('insecure page: explains that https (trusted) or localhost is needed', 'secure page' in state and 'https://' in state and 'localhost' in state, state)
    chk('...does not offer a browser flag as the fix', 'flag' not in state.lower(), state)
    chk('...the page-security line says it is NOT secure', 'Not a secure page' in pg.inner_text('#vsec'), pg.inner_text('#vsec'))
    chk('...and voice cannot be turned on; no recogniser exists', pg.is_disabled('#vtoggle') and pg.evaluate(RECS) == 0)
    ctx.close()

    # voice was switched on earlier, page now insecure: Talk is rejected cleanly and never opens a session
    ctx, pg = page(browser, r, scripts=[INSECURE, MOCK_SPEECH], settings={'idleSec': 0, 'voiceOn': True})
    pg.click('#talk'); pg.click('#talk')
    chk('insecure page + Talk: rejected with the explanation', 'secure page' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    chk('...and no microphone session is started, even on a second tap', pg.evaluate(RECS) == 0)
    chk('...the indicator says unavailable, never "Listening"', 'Voice unavailable' in pg.inner_text('#vind'))
    ctx.close()


def insecure_page_still_works(browser, r):
    """Plain http on a LAN address: no microphone and no Web Crypto. Everything that is not voice/PIN must still work."""
    chk = r.check
    ctx, pg = page(browser, r, scripts=[INSECURE, NO_CRYPTO, MOCK_SPEECH], settings={'idleSec': 5})
    chk('insecure page: the clock renders', ':' in pg.inner_text('#hm'))
    pg.click('#dock [data-go=timer]'); pg.click('[data-m="2"]'); pg.click('#tctl [data-act=start]')
    chk('insecure page: the timer runs', pg.inner_text('#tst') == 'Running')
    pg.click('#tctl [data-act=cancel]'); pg.click('.screen.on [data-go=schedules]')
    create_rule_via_ui(pg, 'Plain http rule', '07:45', 1)
    chk('insecure page: schedules can be created', 'Plain http rule' in pg.inner_text('#rlist'))
    pg.click('.screen.on [data-go=home]'); pg.click('#dock [data-go=assistant]')
    pg.fill('.screen.on .cmd input', 'set a 4 minute timer'); pg.keyboard.press('Enter')
    chk('insecure page: typed assistant commands work', pg.evaluate("TimerEngine.snapshot().duration") == 240000)
    pg.click('.screen.on [data-go=home]'); pg.click('#dock [data-go=backgrounds]')
    chk('insecure page: backgrounds open', pg.locator('#lib .btn').count() == 7)
    pg.click('#bgback'); pg.click('#dock [data-go=settings]'); pg.click('button:has-text("24-hour")')
    chk('insecure page: settings change', pg.evaluate("Settings.get().timeFormat") == '24')
    chk('insecure page: the PIN card explains it needs https instead of failing silently', 'Web Crypto' in pg.inner_text('#pinstat'))
    pg.click('.screen.on [data-go=home]'); pg.wait_for_timeout(5600)
    chk('insecure page: idle hiding still works', pg.evaluate("document.body.classList.contains('idle')"))
    chk('insecure page: no recogniser was ever created', pg.evaluate(RECS) == 0)
    ctx.close()


def lifecycle(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    talk(pg); pg.evaluate("__audio()")
    pg.click('#dock [data-go=settings]'); pg.click('#vtoggle')
    chk('turning voice off stops the microphone', pg.evaluate("__last().aborted") and 'Voice is off' in pg.evaluate(VSTATE))
    chk('...and deletes the stored consent', pg.evaluate("localStorage.getItem('luna.voice.consent.v1')") == '{}')
    home(pg)
    chk('...and removes the Talk button and indicator', not pg.is_visible('#talk') and not pg.is_visible('#vind'))
    ctx.close()

    ctx, pg = page(browser, r)
    talk(pg)
    pg.click('#dock [data-go=settings]'); pg.click('#reset'); pg.click('#yes')
    chk('Restore defaults switches voice off and stops the microphone', not pg.evaluate("Settings.get().voiceOn") and pg.evaluate("__last().aborted"))
    ctx.close()

    # a reload never opens the microphone by itself, even when the browser already allows it
    ctx, pg = page(browser, r, scripts=["window.__perm='granted';", MOCK_SPEECH])
    enable_voice(pg)
    pg.reload(); pg.wait_for_timeout(300)
    chk('after a reload voice stays on, but nothing listens until Talk is tapped', pg.evaluate("Settings.get().voiceOn") and pg.evaluate(RECS) == 0)
    ctx.close()

    # data left by the old always-listening version is cleaned up and does not start anything
    old_settings = {'idleSec': 0, 'voiceOn': True, 'wakeOn': True}
    old_consent = {'luna.voice.consent.v1': json.dumps({'push': 1, 'wake': 1})}
    ctx, pg = page(browser, r, scripts=["window.__perm='granted';", MOCK_SPEECH], settings=old_settings, storage=old_consent)
    saved = json.loads(pg.evaluate("localStorage.getItem('luna.settings.v1')"))
    consent = json.loads(pg.evaluate("localStorage.getItem('luna.voice.consent.v1')"))
    chk('old "wakeOn" setting and wake consent are removed on load', 'wakeOn' not in saved and 'wake' not in consent and consent.get('push') == 1, (saved, consent))
    chk('...voice push-to-talk stays on, and no microphone is opened', saved.get('voiceOn') is True and pg.evaluate(RECS) == 0)
    ctx.close()
