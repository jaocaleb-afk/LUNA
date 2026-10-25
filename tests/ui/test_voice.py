"""Voice, tested against a MOCK SpeechRecognition (see helpers.MOCK_SPEECH).
These checks prove LUNA's own behaviour: consent, honest status, command handling, error wording.
They do NOT prove that a real microphone or Google's speech service works on the Raspberry Pi: see README."""
from helpers import open_page, MOCK_SPEECH, NO_SPEECH, INSECURE

SETTINGS = {'idleSec': 0}
RECS = "window.__recs.length"
VSTATE = "document.querySelector('#vset .vstate').textContent"


def page(browser, r, scripts=(MOCK_SPEECH,), settings=SETTINGS, storage=None):
    return open_page(browser, r, settings=settings, storage=storage, scripts=scripts, label='voice')


def enable_voice(pg):
    pg.click('#dock [data-go=settings]'); pg.click('#vtoggle'); pg.click('#vyes')


def run(browser, r):
    r.group = 'voice: '
    chk = r.check

    # ---- off by default, nothing opened ----
    ctx, pg = page(browser, r)
    chk('voice is OFF by default and no microphone/recogniser has been created', pg.evaluate(RECS) == 0 and not pg.evaluate("Settings.get().voiceOn"))
    chk('no Talk button and no listening indicator on the home screen', not pg.is_visible('#talk') and not pg.is_visible('#vind'))
    pg.click('#dock [data-go=settings]')
    chk('Settings says plainly that nothing is listening', 'Voice is off. Nothing is listening.' in pg.inner_text('#vset'))
    chk('...and discloses the cloud speech service up front', 'Google' in pg.inner_text('#vset') and 'never records or stores audio' in pg.inner_text('#vset'))
    chk('...and states that "Hey LUNA" is experimental and may not work on a Pi', 'experimental' in pg.inner_text('#vset') and 'Raspberry Pi' in pg.inner_text('#vset'))
    chk('the always-listen switch is unavailable until voice is on', pg.is_disabled('#wtoggle'))

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
    pg.click('.screen.on [data-go=home]')
    chk('a Talk button now appears on the home screen', pg.is_visible('#talk'))

    # ---- push-to-talk: honest states ----
    pg.click('#talk')
    chk('Talk opens the recogniser (this is when the browser would ask for permission)', pg.evaluate(RECS) == 1 and pg.evaluate("__last().continuous") is False)
    pg.click('#dock [data-go=assistant]')
    chk('before audio starts it says "not listening yet" and shows no Listening indicator',
        'not listening yet' in pg.inner_text('#vcard .vstate') and 'Listening…' not in pg.inner_text('#vind'), pg.inner_text('#vcard .vstate'))
    pg.evaluate("__audio()")
    chk('once audio really starts it says it is listening', pg.inner_text('#vcard .vstate') == 'Listening for your command…')
    pg.click('.screen.on [data-go=home]')
    chk('home shows a visible "Listening…" indicator', pg.is_visible('#vind') and 'Listening…' in pg.inner_text('#vind'))
    pg.evaluate("__say([['set a five minute', false]])")
    chk('the recognised words are shown while speaking', 'set a five minute' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    pg.evaluate("__say([['set a five minute timer', true]])")
    chk('the command ran: a 5:00 timer started', pg.evaluate("TimerEngine.snapshot().duration") == 300000)
    chk('the recognised command AND the response are displayed', 'set a five minute timer' in pg.inner_text('#vbubble') and 'Timer set for 5:00' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    chk('the microphone stops after the command (push-to-talk)', not pg.evaluate("__last().started") and 'Listening…' not in pg.inner_text('#vind'))
    pg.click('#dock [data-go=assistant]')
    chk('the Assistant screen keeps a short history of voice commands', 'set a five minute timer' in pg.inner_text('#vlog'))
    ctx.close()

    errors(browser, r)
    wake_phrase(browser, r)
    lifecycle(browser, r)


def errors(browser, r):
    chk = r.check
    cases = [('not-allowed', 'permission was denied'), ('audio-capture', 'No microphone was found'),
             ('service-not-allowed', 'blocked speech recognition'), ('language-not-supported', 'language is not supported')]
    for code, text in cases:
        ctx, pg = page(browser, r)
        enable_voice(pg); pg.click('.screen.on [data-go=home]'); pg.click('#talk')
        pg.evaluate("__err('%s')" % code)
        pg.click('#dock [data-go=settings]')
        chk('error "%s" is explained in plain words' % code, 'Not working' in pg.inner_text('#vset .vstate') and text in pg.inner_text('#vset .vstate'), pg.inner_text('#vset .vstate'))
        ctx.close()

    ctx, pg = page(browser, r)
    enable_voice(pg); pg.click('.screen.on [data-go=home]'); pg.click('#talk')
    pg.evaluate("__err('permission-denied-unknown')")
    chk('an unknown error code is still reported, not hidden', 'permission-denied-unknown' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    chk('after an error the home indicator says voice is unavailable (not listening)', 'Voice unavailable' in pg.inner_text('#vind'))
    ctx.close()

    # silence: no command heard
    ctx, pg = open_page(browser, r, clock=__import__('helpers').la(2026, 10, 26, 8, 0, 0), settings=SETTINGS, scripts=[MOCK_SPEECH], label='voice')
    enable_voice(pg); pg.click('.screen.on [data-go=home]'); pg.click('#talk'); pg.evaluate("__audio()")
    pg.clock.run_for(8500)
    chk('silence after Talk gives "I didn’t catch a command" and stops listening', 'didn’t catch' in pg.inner_text('#vbubble') and 'Listening…' not in pg.inner_text('#vind'))
    ctx.close()

    # unsupported browser
    ctx, pg = page(browser, r, scripts=[NO_SPEECH])
    pg.click('#dock [data-go=settings]')
    chk('unsupported browser: says so clearly', 'no speech recognition' in pg.inner_text('#vset .vstate'), pg.inner_text('#vset .vstate'))
    chk('...and the "Turn voice on" button is disabled', pg.is_disabled('#vtoggle'))
    chk('...and no Talk button or indicator is ever shown', not pg.is_visible('#talk') and not pg.is_visible('#vind'))
    ctx.close()

    # insecure page (plain http on a LAN address): the browser blocks the microphone
    ctx, pg = page(browser, r, scripts=[INSECURE, MOCK_SPEECH])
    pg.click('#dock [data-go=settings]')
    chk('insecure page: explains the https/localhost requirement and offers a fix', 'secure' in pg.inner_text('#vset .vstate') and 'insecure origin' in pg.inner_text('#vset .vstate'), pg.inner_text('#vset .vstate'))
    chk('...and does not touch the microphone', pg.evaluate(RECS) == 0 and pg.is_disabled('#vtoggle'))
    ctx.close()


def wake_phrase(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    enable_voice(pg)
    pg.click('#wtoggle')
    dlg = pg.inner_text('#vdlg')
    chk('"Always listen" has its own, stronger disclosure', 'continuously streams ALL audio' in dlg and 'push-to-talk' in dlg, dlg)
    pg.click('#vno')
    chk('declining it leaves wake listening off, mic closed', not pg.evaluate("Settings.get().wakeOn") and pg.evaluate(RECS) == 0)
    pg.click('#wtoggle'); pg.click('#vyes')
    chk('agreeing starts a continuous recogniser', pg.evaluate(RECS) == 1 and pg.evaluate("__last().continuous") is True)
    chk('while starting it does NOT claim to be listening for the phrase', 'Listening for' not in pg.inner_text('#vset .vstate'), pg.inner_text('#vset .vstate'))
    pg.evaluate("__audio()")
    status = pg.inner_text('#vset .vstate')
    chk('once audio flows it says listening but "not verified yet"', 'Listening for “Hey LUNA”' in status and 'not verified yet' in status, status)
    pg.click('.screen.on [data-go=home]')
    chk('home indicator says "Hey LUNA (unverified)"', 'Hey LUNA (unverified)' in pg.inner_text('#vind'), pg.inner_text('#vind'))

    pg.evaluate("__say([['we are talking about dinner and set a 9 minute timer for later', true]])")
    chk('speech without the wake phrase is ignored: nothing shown, nothing run',
        pg.evaluate("TimerEngine.snapshot().state") == 'idle' and not pg.is_visible('#vbubble'))
    pg.evaluate("__say([['hey luna what time is it', true]])")
    chk('"Hey LUNA <command>" runs the command', 'It is' in pg.inner_text('#vbubble') and 'what time is it' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    pg.click('#dock [data-go=settings]')
    chk('only after hearing it does the status say it has been heard', 'heard it at least once' in pg.inner_text('#vset .vstate'), pg.inner_text('#vset .vstate'))
    pg.click('.screen.on [data-go=home]')
    chk('home indicator drops "(unverified)" after verification', pg.inner_text('#vind').strip() == 'Hey LUNA', pg.inner_text('#vind'))

    pg.evaluate("__say([['hey luna', true]])")
    chk('the phrase alone moves to "Listening…" for a command', 'Listening…' in pg.inner_text('#vind'))
    pg.evaluate("__say([['hey luna', true], ['pause the timer', true]], 1)")
    chk('...and the next sentence is taken as the command', 'pause the timer' in pg.inner_text('#vbubble') and 'No timer is running' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    chk('...then it returns to waiting for the phrase', pg.inner_text('#vind').strip() == 'Hey LUNA')

    pg.click('#talk')
    chk('Talk during wake mode reuses the open recogniser (no second microphone session)', pg.evaluate(RECS) == 1 and 'Listening…' in pg.inner_text('#vind'))
    pg.evaluate("__say([['open settings', true]])")
    chk('...and a voice command can navigate ("open settings")', pg.evaluate("document.querySelector('.screen.on').dataset.screen") == 'settings')

    pg.click('#wtoggle')
    chk('turning always-listen off aborts the recogniser', pg.evaluate("__last().aborted") and not pg.evaluate("Settings.get().wakeOn"))
    chk('...and withdraws that consent', pg.evaluate("'wake' in JSON.parse(localStorage.getItem('luna.voice.consent.v1'))") is False)
    ctx.close()


def lifecycle(browser, r):
    chk = r.check
    # turning voice off
    ctx, pg = page(browser, r)
    enable_voice(pg); pg.click('#wtoggle'); pg.click('#vyes'); pg.evaluate("__audio()")
    pg.click('#vtoggle')
    chk('turning voice off stops the microphone', pg.evaluate("__last().aborted") and 'Voice is off' in pg.inner_text('#vset .vstate'))
    chk('...turns always-listen off and deletes all stored consent', not pg.evaluate("Settings.get().wakeOn") and pg.evaluate("localStorage.getItem('luna.voice.consent.v1')") == '{}')
    pg.click('.screen.on [data-go=home]')
    chk('...and removes the Talk button and indicator', not pg.is_visible('#talk') and not pg.is_visible('#vind'))
    ctx.close()

    # Restore defaults
    ctx, pg = page(browser, r)
    enable_voice(pg); pg.click('#wtoggle'); pg.click('#vyes')
    pg.click('#reset'); pg.click('#yes')
    chk('Restore defaults switches voice off and stops the microphone', not pg.evaluate("Settings.get().voiceOn") and pg.evaluate("__last().aborted"))
    ctx.close()

    # reload with always-listen on, permission NOT yet granted: never starts by itself
    ctx, pg = page(browser, r)
    enable_voice(pg); pg.click('#wtoggle'); pg.click('#vyes')
    pg.reload(); pg.wait_for_timeout(400)
    chk('after a reload, voice settings are remembered', pg.evaluate("Settings.get().voiceOn && Settings.get().wakeOn"))
    chk('...but the microphone is not reopened without browser permission (no surprise prompt)', pg.evaluate(RECS) == 0)
    pg.click('#dock [data-go=settings]')
    chk('...and the screen offers "Start listening" instead of pretending', 'not listening right now' in pg.inner_text('#vset .vstate') and pg.is_visible('#vset button:has-text("Start listening")'), pg.inner_text('#vset .vstate'))
    ctx.close()

    # reload with permission already granted and consent on file: resumes
    ctx, pg = page(browser, r, scripts=["window.__perm='granted';", MOCK_SPEECH])
    enable_voice(pg); pg.click('#wtoggle'); pg.click('#vyes')
    pg.reload(); pg.wait_for_timeout(400)
    chk('with consent AND existing browser permission, always-listen resumes after a reload', pg.evaluate(RECS) == 1 and pg.evaluate("__last().continuous"))
    ctx.close()
