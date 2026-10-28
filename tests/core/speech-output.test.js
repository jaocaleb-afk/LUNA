const a = require('assert');
const { test, FakeClock } = require('./harness');
const { SpeechOutput } = require('./load');

/* A fake speechSynthesis that keeps a real queue, so a backlog would be visible. */
function fakeSynth(voices) {
  const synth = {
    queue: [], spoken: [], cancels: 0,
    getVoices: () => voices || [],
    speak(u) { synth.queue.push(u); synth.spoken.push(u.text); },
    cancel() { synth.cancels++; synth.queue.forEach((u) => u.onerror && u.onerror({ error: 'interrupted' })); synth.queue = []; },
  };
  return synth;
}
function Utterance(text) { this.text = text; }

function speaker(opts = {}) {
  const synth = 'synth' in opts ? opts.synth : fakeSynth(opts.voices);
  const clock = FakeClock();
  let on = opts.enabled !== false;
  let preferred = opts.preferred || '';
  const s = SpeechOutput.createSpeaker({
    synth, Utterance: 'Utterance' in opts ? opts.Utterance : Utterance, enabled: () => on, lang: () => opts.lang || 'en-US',
    voice: () => preferred, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
  });
  return { s, synth, clock, setOn: (v) => { on = v; }, prefer: (name) => { preferred = name; } };
}

const V = (name, lang, extra = {}) => Object.assign({ name, lang, default: false, localService: false }, extra);

test('speech: speaks through speechSynthesis when available', () => {
  const { s, synth } = speaker({ voices: [V('English US', 'en-US')] });
  a.ok(s.available());
  a.deepStrictEqual(s.say('Starting a timer for 10 minutes.'), { spoken: true });
  a.deepStrictEqual(synth.spoken, ['Starting a timer for 10 minutes.']);
  a.strictEqual(synth.queue[0].voice.name, 'English US');
  a.strictEqual(synth.queue[0].lang, 'en-US');
});

test('speech: unavailable synthesis is reported, never thrown', () => {
  const none = speaker({ synth: null });
  a.ok(!none.s.available());
  a.deepStrictEqual(none.s.say('Hello'), { spoken: false, reason: 'unsupported' });
  none.s.stop();                                     // must not throw either
  const noUtterance = speaker({ Utterance: undefined });
  a.deepStrictEqual(noUtterance.s.say('Hello'), { spoken: false, reason: 'unsupported' });
  const broken = speaker({ synth: { getVoices: () => [V('US', 'en-US')], speak() { throw new Error('boom'); }, cancel() {} } });
  a.deepStrictEqual(broken.s.say('Hello'), { spoken: false, reason: 'failed' });
});

test('speech: falls back to the browser default voice when no voice suits', () => {
  const empty = speaker({ voices: [] });              // Chrome often reports no voices until they have loaded
  empty.s.say('Hi');
  empty.clock.advance(1500);                          // ...so LUNA waits briefly for them, then uses the default
  a.strictEqual(empty.synth.queue[0].voice, undefined, 'no voice set = browser default');
  a.strictEqual(empty.synth.queue[0].lang, 'en-US', '...but the language is still requested');
  const foreign = speaker({ voices: [V('Anna', 'de-DE', { default: true }), V('Amélie', 'fr-CA')] });   // listed: no wait
  foreign.s.say('Hi');
  a.strictEqual(foreign.synth.queue[0].voice, undefined, 'a voice in another language is never chosen');
});

test('speech: voice choice prefers exact language, then default, then on-device; skips novelty voices', () => {
  const pick = (voices, lang = 'en-US') => (SpeechOutput.pickVoice(voices, lang) || {}).name;
  a.strictEqual(pick([V('UK', 'en-GB'), V('US', 'en-US')]), 'US');
  a.strictEqual(pick([V('UK', 'en-GB'), V('AU', 'en-AU', { default: true })]), 'AU');
  a.strictEqual(pick([V('Cloud', 'en-US'), V('Local', 'en-US', { localService: true })]), 'Local');
  a.strictEqual(pick([V('Local', 'en-US', { localService: true }), V('Default', 'en-US', { default: true })]), 'Default');
  a.strictEqual(pick([V('Zarvox', 'en-US', { default: true }), V('Bad News', 'en-US'), V('Samantha', 'en-US')]), 'Samantha');
  a.strictEqual(pick([V('US', 'en_US')]), 'US', 'Android-style en_US');
  a.strictEqual(pick([]), undefined);
});

test('speech: switched off = silent (and anything speaking is stopped by the caller)', () => {
  const { s, synth, setOn } = speaker({ voices: [] });
  setOn(false);
  a.deepStrictEqual(s.say('Timer cancelled.'), { spoken: false, reason: 'disabled' });
  a.strictEqual(synth.spoken.length, 0);
  setOn(true);
  s.say('One');
  s.stop();
  a.strictEqual(synth.queue.length, 0, 'stop() empties the queue');
});

test('speech: a newer reply replaces older ones (no backlog)', () => {
  const { s, synth } = speaker({ voices: [V('US', 'en-US')] });
  s.say('First reply');
  s.say('Second reply');
  s.say('Third reply');
  a.deepStrictEqual(synth.queue.map((u) => u.text), ['Third reply.'], 'only the newest is waiting/speaking');
  a.ok(synth.cancels >= 3, 'each reply cancels what came before');
  a.strictEqual(s.lastError(), null, 'being interrupted on purpose is not an error');
  a.deepStrictEqual(s.say('   '), { spoken: false, reason: 'empty' });
});

test('speech: a real synthesis failure is remembered for the status text', () => {
  const { s, synth, clock } = speaker({ voices: [] });
  s.say('Hello');
  clock.advance(1500);
  synth.queue[0].onerror({ error: 'synthesis-failed' });
  a.strictEqual(s.lastError(), 'synthesis-failed');
  synth.queue[0].onend();
  a.strictEqual(s.lastError(), null);
});

/* ---------- more natural voices ---------- */
test('speech: natural-sounding voices are preferred over basic ones, without leaving the language', () => {
  const pick = (voices, lang = 'en-US') => (SpeechOutput.pickVoice(voices, lang) || {}).name;
  a.strictEqual(pick([V('eSpeak English (America)', 'en-US', { default: true, localService: true }), V('Google US English', 'en-US')]), 'Google US English');
  a.strictEqual(pick([V('Google US English', 'en-US'), V('Microsoft Aria Online (Natural) - English (United States)', 'en-US')]),
    'Microsoft Aria Online (Natural) - English (United States)');
  a.strictEqual(pick([V('Samantha', 'en-US', { default: true }), V('Ava (Enhanced)', 'en-US')]), 'Ava (Enhanced)');
  a.strictEqual(pick([V('Natural Deutsch', 'de-DE'), V('espeak en', 'en-US')]), 'espeak en', 'a natural voice in ANOTHER language never wins');
  a.strictEqual(pick([V('Piper Amy', 'en-GB'), V('espeak en', 'en-US')]), 'Piper Amy', 'a natural en-GB voice beats robotic en-US');
});

test('speech: eSpeak is slowed slightly toward conversational pace; other voices keep their own rate and pitch', () => {
  const basic = speaker({ voices: [V('eSpeak English', 'en-US')] });
  basic.s.say('Hello');
  a.strictEqual(basic.synth.queue[0].rate, 0.9);
  a.strictEqual(basic.synth.queue[0].pitch, 1);
  const good = speaker({ voices: [V('Google US English', 'en-US')] });
  good.s.say('Hello');
  a.strictEqual(good.synth.queue[0].rate, 1);
  a.strictEqual(good.synth.queue[0].pitch, 1);
});

test('speech: the voice chosen in Settings is used when this device has it; otherwise automatic', () => {
  const x = speaker({ voices: [V('Google US English', 'en-US'), V('Fred', 'en-US')], preferred: 'Fred' });
  x.s.say('Hello');
  a.strictEqual(x.synth.queue[0].voice.name, 'Fred');
  x.prefer('A voice from another computer');
  x.s.say('Hello');
  a.strictEqual(x.synth.queue[0].voice.name, 'Google US English');
  a.deepStrictEqual(x.s.choices().map((v) => v.name), ['Google US English', 'Fred']);
});

test('speech: the first reply waits for a late voice list, and speaks as soon as it arrives', () => {
  const voices = [];
  const x = speaker({ voices });
  a.deepStrictEqual(x.s.say('Starting a timer'), { spoken: false, waiting: true });
  a.strictEqual(x.synth.queue.length, 0);
  voices.push(V('Google US English', 'en-US'));
  x.s.voicesChanged();
  a.deepStrictEqual(x.synth.spoken, ['Starting a timer.']);
  a.strictEqual(x.synth.queue[0].voice.name, 'Google US English');
  x.clock.advance(5000);
  a.strictEqual(x.synth.spoken.length, 1, 'the wait timer does not speak it a second time');
  x.s.say('Second');
  a.strictEqual(x.synth.spoken.length, 2, 'later replies do not wait');
});

test('speech: a reply waiting for voices is dropped by stop() or replaced by a newer one', () => {
  const x = speaker({ voices: [] });
  x.s.say('Old');
  x.s.say('New');
  x.clock.advance(1500);
  a.deepStrictEqual(x.synth.spoken, ['New.']);
  const y = speaker({ voices: [] });
  y.s.say('Never');
  y.s.stop();
  y.clock.advance(5000);
  a.deepStrictEqual(y.synth.spoken, []);
});

test('speech: a voice that fails is skipped, and the reply is retried once with the next best voice', () => {
  const x = speaker({ voices: [V('Google US English', 'en-US'), V('eSpeak English', 'en-US', { localService: true })] });
  x.s.say('Timer paused.');
  a.strictEqual(x.synth.queue[0].voice.name, 'Google US English');
  x.synth.queue[0].onerror({ error: 'network' });    // an online voice without internet
  a.strictEqual(x.synth.queue[1].voice.name, 'eSpeak English');
  a.deepStrictEqual(x.synth.spoken, ['Timer paused.', 'Timer paused.']);
  x.synth.queue[1].onerror({ error: 'synthesis-failed' });
  a.strictEqual(x.synth.queue.length, 2, 'only one retry per reply');
  x.s.say('Next');
  a.strictEqual(x.synth.queue[x.synth.queue.length - 1].voice, undefined, 'both failed here, so the browser default is used');
});

test('speech: replies are spoken in speech-friendly words (same meaning as the screen)', () => {
  const x = speaker({ voices: [V('US', 'en-US')] });
  x.s.say('12 + 6 × 3 = 30');
  a.deepStrictEqual(x.synth.spoken, ['12 plus 6 times 3 equals 30.']);
});
