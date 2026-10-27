"""Spoken replies (text-to-speech) and the wider voice-command vocabulary, tested with a MOCK speechSynthesis and a
MOCK SpeechRecognition (helpers.MOCK_SYNTH / MOCK_SPEECH). These prove LUNA's own behaviour: what it says, that the
screen and the voice agree, that replies do not pile up, and that it copes without speech synthesis.
They do NOT prove that a real voice is audible on your device: see README "Real-device checks"."""
from helpers import open_page, la, advance, MOCK_SPEECH, MOCK_SYNTH, NO_SYNTH

SETTINGS = {'idleSec': 0}
SPOKEN = "window.__spoken"
BUBBLE_REPLY = "(document.getElementById('vbubble').textContent.split(' → ')[1] || document.getElementById('vbubble').textContent)"


def page(browser, r, scripts=(MOCK_SPEECH, MOCK_SYNTH), clock=None, settings=SETTINGS, storage=None):
    return open_page(browser, r, settings=settings, storage=storage, scripts=scripts, clock=clock, label='speech')


def voice_on(pg):
    pg.click('#dock [data-go=settings]'); pg.click('#vtoggle'); pg.click('#vyes')
    pg.click('.screen.on [data-go=home]')


def command(pg, text):
    """Tap Talk and 'say' one final phrase through the mock recogniser."""
    pg.click('#talk'); pg.evaluate("__audio()")
    pg.evaluate("t => __say([[t, true]])", text)


def run(browser, r):
    r.group = 'speech: '
    replies(browser, r)
    vocabulary(browser, r)
    switched_off(browser, r)
    no_synthesis(browser, r)
    real_browser_synthesis(browser, r)


def replies(browser, r):
    chk = r.check
    ctx, pg = page(browser, r, clock=la(2026, 10, 26, 9, 0, 0))
    pg.click('#dock [data-go=settings]')
    stat = pg.inner_text('#ssstat')
    chk('Settings has a "Spoken replies" card, on by default, naming the chosen standard voice',
        'On.' in stat and 'Test English (en-US)' in stat and pg.get_attribute('#sson', 'aria-pressed') == 'true', stat)
    chk('...and a novelty voice is never chosen', 'Zarvox' not in stat)
    pg.click('.screen.on [data-go=home]')
    voice_on(pg)

    command(pg, 'set a five minute timer')
    chk('a voice command is answered aloud', pg.evaluate(SPOKEN) == ['Starting a timer for 5 minutes.'], pg.evaluate(SPOKEN))
    chk('...with exactly the words shown on screen', pg.evaluate(BUBBLE_REPLY) == pg.evaluate(SPOKEN)[-1], pg.evaluate(BUBBLE_REPLY))
    chk('...using the chosen voice', pg.evaluate("__queue[0].voice.name") == 'Test English')

    advance(pg, 3 * 60000 + 18000)
    command(pg, 'How much time is left?')
    chk('"how much time is left?" is answered from the real timer', pg.evaluate(SPOKEN)[-1] == 'You have 1 minute and 42 seconds remaining.', pg.evaluate(SPOKEN))
    chk('...and agrees with the countdown on screen', pg.inner_text('#tbt') == '1:42', pg.inner_text('#tbt'))
    command(pg, 'When will my timer finish?')
    chk('"when will my timer finish?" gives the clock time', pg.evaluate(SPOKEN)[-1] == 'Your timer will finish at 9:05 AM, in 1 minute and 42 seconds.', pg.evaluate(SPOKEN)[-1])

    pg.evaluate("__queue.push({text:'still speaking'})")
    cancels = pg.evaluate("__cancels")
    pg.click('#talk')
    chk('tapping Talk silences LUNA first (it never talks over you, and the mic does not hear it)',
        pg.evaluate("__cancels") > cancels and pg.evaluate("__queue.length") == 0)
    pg.click('#talk')

    pg.evaluate("Speech.say('one'); Speech.say('two'); Speech.say('three')")
    chk('replies never pile up: only the newest is queued', pg.evaluate("__queue.map(u => u.text)") == ['three'], pg.evaluate("__queue.map(u => u.text)"))

    spoken_before = len(pg.evaluate(SPOKEN))
    pg.click('#dock [data-go=assistant]')
    pg.fill('.screen.on .cmd input', 'how much time is left'); pg.keyboard.press('Enter')
    chk('typed commands are answered on screen only, not aloud', len(pg.evaluate(SPOKEN)) == spoken_before and 'remaining' in pg.inner_text('.screen.on .log'))
    pg.click('.screen.on [data-go=home]')

    command(pg, 'set a timer for banana')
    chk('a command error is spoken as well as shown', 'How long should the timer be?' in pg.evaluate(SPOKEN)[-1] and 'How long' in pg.inner_text('#vbubble'))
    pg.click('#talk'); pg.evaluate("__audio()"); advance(pg, 8500)
    chk('"I didn’t catch a command" is spoken too', pg.evaluate(SPOKEN)[-1] == 'I didn’t catch a command.', pg.evaluate(SPOKEN)[-1])
    ctx.close()


def vocabulary(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    voice_on(pg)
    command(pg, 'LUNA, set a 3 hour, 2 minute, 19 second timer.')
    chk('"set a 3 hour, 2 minute, 19 second timer" creates exactly 3:02:19', pg.evaluate("TimerEngine.snapshot().duration") == (3 * 3600 + 2 * 60 + 19) * 1000)
    chk('...the confirmation reads the duration back', pg.evaluate(SPOKEN)[-1] == 'Starting a timer for 3 hours, 2 minutes, and 19 seconds.', pg.evaluate(SPOKEN))
    chk('...and the visible timer agrees', pg.inner_text('#tbt') == '3:02:19', pg.inner_text('#tbt'))
    command(pg, 'cancel that timer')
    chk('"cancel that timer" cancels the ordinary timer', pg.evaluate("TimerEngine.snapshot().state") == 'idle' and pg.evaluate(SPOKEN)[-1] == 'Timer cancelled.')

    for text, seconds in [('Start a countdown for 1 hour and 15 minutes', 4500), ('I need a timer for 45 minutes and 12 seconds', 2712),
                          ('Give me a five-minute timer', 300), ('Start a timer for 0 hours, 3 minutes, and 5 seconds', 185)]:
        command(pg, text)
        chk('"%s" -> %d s' % (text, seconds), pg.evaluate("TimerEngine.snapshot().duration") == seconds * 1000, pg.evaluate(SPOKEN)[-1])
        pg.evaluate("TimerEngine.cancel()")

    command(pg, 'set a timer for 5')
    chk('an ambiguous duration starts nothing and asks for clarification (spoken and shown)',
        pg.evaluate("TimerEngine.snapshot().state") == 'idle' and 'without a unit' in pg.evaluate(SPOKEN)[-1] and
        'err' in pg.get_attribute('#vbubble', 'class'), pg.evaluate(SPOKEN)[-1])
    command(pg, 'set a timer for 30 hours')
    chk('an excessive duration is refused', pg.evaluate("TimerEngine.snapshot().state") == 'idle' and '24 hours' in pg.evaluate(SPOKEN)[-1])
    command(pg, 'how long is left on my timer')
    chk('asking with no timer running says so', pg.evaluate(SPOKEN)[-1] == 'No timer is running.')
    ctx.close()


def switched_off(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    voice_on(pg)
    pg.click('#dock [data-go=settings]')
    pg.evaluate("__queue.push({text:'speaking'})")
    pg.click('#ssoff')
    chk('turning spoken replies off stops any speech at once', pg.evaluate("__queue.length") == 0)
    chk('...and the card says replies are text only', 'text only' in pg.inner_text('#ssstat') and pg.get_attribute('#ssoff', 'aria-pressed') == 'true')
    chk('...and is saved', pg.evaluate("JSON.parse(localStorage.getItem('luna.settings.v1')).speakOn") is False)
    pg.click('.screen.on [data-go=home]')
    command(pg, 'set a 2 minute timer')
    chk('with replies off nothing is spoken, but the reply is still shown and the command runs',
        pg.evaluate(SPOKEN) == [] and 'Starting a timer for 2 minutes.' in pg.inner_text('#vbubble') and pg.evaluate("TimerEngine.snapshot().duration") == 120000)
    pg.reload(); pg.wait_for_timeout(200)
    pg.click('#dock [data-go=settings]')
    chk('the setting survives a reload', pg.get_attribute('#ssoff', 'aria-pressed') == 'true')
    pg.click('#sson')
    chk('turning it back on works', pg.get_attribute('#sson', 'aria-pressed') == 'true' and not pg.is_disabled('#sstest'))
    pg.click('#sstest')
    chk('"Test voice" speaks a sample', pg.evaluate(SPOKEN)[-1] == 'This is how LUNA sounds.')
    ctx.close()


def no_synthesis(browser, r):
    chk = r.check
    ctx, pg = page(browser, r, scripts=(MOCK_SPEECH, NO_SYNTH))
    pg.click('#dock [data-go=settings]')
    chk('without speech synthesis the card says replies are text only, and its buttons are disabled',
        'no speech synthesis' in pg.inner_text('#ssstat') and pg.is_disabled('#sson') and pg.is_disabled('#sstest'), pg.inner_text('#ssstat'))
    pg.click('.screen.on [data-go=home]')
    voice_on(pg)
    command(pg, 'set a 3 minute timer')
    chk('...voice commands still work and the reply is shown (no crash)',
        pg.evaluate("TimerEngine.snapshot().duration") == 180000 and 'Starting a timer for 3 minutes.' in pg.inner_text('#vbubble'))
    ctx.close()

    # default voice fallback: the browser reports no voices (Chrome before its list has loaded, or a bare Linux)
    ctx, pg = page(browser, r, scripts=(MOCK_SPEECH, 'window.__voices = [];', MOCK_SYNTH))
    pg.click('#dock [data-go=settings]')
    chk('with no voices listed, the browser’s default voice is used', 'default voice' in pg.inner_text('#ssstat'), pg.inner_text('#ssstat'))
    pg.click('#sstest')
    chk('...and it still speaks, without picking a voice', pg.evaluate(SPOKEN) == ['This is how LUNA sounds.'] and pg.evaluate("__queue[0].voice") is None)
    ctx.close()


def real_browser_synthesis(browser, r):
    """The real (headless) Chromium speechSynthesis: LUNA must not error. Whether sound comes out is not testable here."""
    chk = r.check
    ctx, pg = page(browser, r, scripts=())
    errors_before = len(r.errors)
    pg.click('#dock [data-go=settings]')
    pg.click('#sstest') if not pg.is_disabled('#sstest') else None
    pg.wait_for_timeout(800)
    chk('with the browser’s real speechSynthesis, the card renders and Test voice raises no error',
        len(r.errors) == errors_before and pg.inner_text('#ssstat') != '', pg.inner_text('#ssstat'))
    ctx.close()
