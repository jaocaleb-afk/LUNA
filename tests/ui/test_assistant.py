"""Assistant replies: calculations (typed and spoken) and the two-step reply to misunderstood voice commands.
Uses the MOCK SpeechRecognition and MOCK speechSynthesis (helpers.py), so it proves LUNA's logic and wording,
not that a real microphone or speaker works."""
from helpers import go, open_page, MOCK_SPEECH, MOCK_SYNTH

SETTINGS = {'idleSec': 0}
SPOKEN = "window.__spoken"
FIRST = 'I didn’t catch that.'
SECOND = 'Sorry, that command isn’t supported.'


def page(browser, r):
    return open_page(browser, r, settings=SETTINGS, scripts=(MOCK_SPEECH, MOCK_SYNTH), label='assistant')


def voice_on(pg):
    go(pg, 'settings'); pg.click('#vtoggle'); pg.click('#vyes')
    pg.click('.screen.on [data-go=home]')


def command(pg, text):
    pg.click('#talk'); pg.evaluate("__audio()")
    pg.evaluate("t => __say([[t, true]])", text)


def typed(pg, text):
    pg.fill('.screen.on .cmd input', text); pg.keyboard.press('Enter')
    return pg.inner_text('.screen.on [data-cmd] .log li:first-child')


def run(browser, r):
    r.group = 'assistant: '
    calculations(browser, r)
    misunderstood(browser, r)


def calculations(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    go(pg, 'assistant')
    for text, shown in [('What is 25 plus 17?', '25 + 17 = 42'), ('Calculate 144 divided by 12.', '144 ÷ 12 = 12'),
                        ('What is 8 times 7?', '8 × 7 = 56'), ('What is 15 percent of 80?', '15% of 80 = 12'),
                        ('Calculate 12 plus 6 times 3.', '12 + 6 × 3 = 30'), ('What is 20 minus 35?', '20 − 35 = −15'),
                        ('(2 + 3) * -4', '(2 + 3) × −4 = −20'), ('what is 1.5 times 3', '1.5 × 3 = 4.5')]:
        line = typed(pg, text)
        chk('typed "%s" shows the calculation and answer' % text, line.endswith('→ ' + shown), line)
    line = typed(pg, 'What is 10 divided by zero?')
    chk('division by zero is explained, not answered with Infinity or NaN',
        'can’t divide by zero' in line and 'Infinity' not in line and 'NaN' not in line, line)
    line = typed(pg, 'what is 5 plus')
    chk('a malformed calculation gets a short, helpful reply', 'couldn’t work that out' in line, line)
    chk('the example buttons include a calculation', pg.locator('.screen.on .chips .btn:has-text("What is 12 plus 6 times 3?")').count() == 1)
    chk('typed calculations are not spoken', pg.evaluate(SPOKEN) == [])
    pg.click('.screen.on [data-go=home]')

    voice_on(pg)
    command(pg, 'Hey Luna, what is 25 plus 17?')
    chk('voice: the answer is shown with symbols', '25 + 17 = 42' in pg.inner_text('#vbubble'), pg.inner_text('#vbubble'))
    chk('voice: ...and spoken as natural words saying the same thing', pg.evaluate(SPOKEN)[-1] == '25 plus 17 equals 42.', pg.evaluate(SPOKEN))
    command(pg, 'what is 1 divided by 3')
    chk('voice: an approximate answer says "about"', pg.evaluate(SPOKEN)[-1] == '1 divided by 3 is about 0.3333.', pg.evaluate(SPOKEN))
    command(pg, 'what is 10 divided by 0')
    chk('voice: division by zero is spoken clearly', pg.evaluate(SPOKEN)[-1] == 'You can’t divide by zero, so 10 divided by 0 has no answer.', pg.evaluate(SPOKEN))
    ctx.close()


def misunderstood(browser, r):
    chk = r.check
    ctx, pg = page(browser, r)
    voice_on(pg)

    command(pg, 'what is the weather like')
    chk('1st misunderstood command: "I didn’t catch that." (spoken and shown)',
        pg.evaluate(SPOKEN)[-1] == FIRST and FIRST in pg.inner_text('#vbubble'), pg.evaluate(SPOKEN))
    command(pg, 'play some music')
    chk('2nd in a row: "Sorry, that command isn’t supported."', pg.evaluate(SPOKEN)[-1] == SECOND, pg.evaluate(SPOKEN))
    command(pg, 'tell me a joke')
    chk('after the 2nd reply the count starts again', pg.evaluate(SPOKEN)[-1] == FIRST, pg.evaluate(SPOKEN))

    command(pg, 'open settings')
    chk('a recognised command works and resets the count', pg.evaluate("document.querySelector('.screen.on').dataset.screen") == 'settings')
    pg.click('.screen.on [data-go=home]')
    command(pg, 'blah blah')
    chk('...so the next miss gets the first reply again', pg.evaluate(SPOKEN)[-1] == FIRST, pg.evaluate(SPOKEN))

    command(pg, 'start screen time')
    chk('understood but not supported by voice uses the same two-step reply (2nd)', pg.evaluate(SPOKEN)[-1] == SECOND, pg.evaluate(SPOKEN))

    command(pg, 'set a timer for 5')
    chk('a supported command with a question about it gets that question, not a generic reply',
        'without a unit' in pg.evaluate(SPOKEN)[-1], pg.evaluate(SPOKEN))
    command(pg, 'xyzzy')
    chk('...and counts as understood (the next miss is the 1st again)', pg.evaluate(SPOKEN)[-1] == FIRST, pg.evaluate(SPOKEN))

    # the browser heard speech but could not make words of it ("no-match"): a miss, not an error
    pg.click('#talk'); pg.evaluate("__audio()"); pg.evaluate("__err('no-match')")
    chk('"no-match" from the browser is a misunderstanding (2nd reply), not an error',
        pg.evaluate(SPOKEN)[-1] == SECOND and 'Not working' not in pg.evaluate("document.querySelector('#vcard .vstate').textContent"),
        pg.evaluate(SPOKEN))

    # a result the browser itself is very unsure about is not acted on
    pg.click('#talk'); pg.evaluate("__audio()")
    pg.evaluate("__last().onresult({resultIndex:0, results:[Object.assign([{transcript:'set a 5 minute timer', confidence:0.1}], {isFinal:true})]})")
    chk('a very low-confidence result does not start a timer, and gets "I didn’t catch that."',
        pg.evaluate("TimerEngine.snapshot().state") == 'idle' and pg.evaluate(SPOKEN)[-1] == FIRST, pg.evaluate(SPOKEN))

    # duplicate result callbacks for one utterance are counted once
    pg.click('#talk'); pg.evaluate("__audio()")
    pg.evaluate("__say([['sing a song', true]]); __say([['sing a song', true]])")
    chk('a duplicate callback does not count twice (one reply only)', pg.evaluate(SPOKEN)[-1] == SECOND and
        pg.evaluate(SPOKEN).count(SECOND) == 4, pg.evaluate(SPOKEN))

    go(pg, 'assistant')
    line = typed(pg, 'what is the weather like')
    chk('typed commands keep their detailed message', 'Unsupported command' in line, line)
    ctx.close()
