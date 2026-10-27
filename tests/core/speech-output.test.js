const a = require('assert');
const { test } = require('./harness');
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
  let on = opts.enabled !== false;
  const s = SpeechOutput.createSpeaker({
    synth, Utterance: 'Utterance' in opts ? opts.Utterance : Utterance, enabled: () => on, lang: () => opts.lang || 'en-US',
  });
  return { s, synth, setOn: (v) => { on = v; } };
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
  const broken = speaker({ synth: { getVoices: () => [], speak() { throw new Error('boom'); }, cancel() {} } });
  a.deepStrictEqual(broken.s.say('Hello'), { spoken: false, reason: 'failed' });
});

test('speech: falls back to the browser default voice when no voice suits', () => {
  const empty = speaker({ voices: [] });              // Chrome often reports no voices until they have loaded
  empty.s.say('Hi');
  a.strictEqual(empty.synth.queue[0].voice, undefined, 'no voice set = browser default');
  a.strictEqual(empty.synth.queue[0].lang, 'en-US', '...but the language is still requested');
  const foreign = speaker({ voices: [V('Anna', 'de-DE', { default: true }), V('Amélie', 'fr-CA')] });
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
  const { s, synth } = speaker({ voices: [] });
  s.say('First reply');
  s.say('Second reply');
  s.say('Third reply');
  a.deepStrictEqual(synth.queue.map((u) => u.text), ['Third reply'], 'only the newest is waiting/speaking');
  a.ok(synth.cancels >= 3, 'each reply cancels what came before');
  a.strictEqual(s.lastError(), null, 'being interrupted on purpose is not an error');
  a.deepStrictEqual(s.say('   '), { spoken: false, reason: 'empty' });
});

test('speech: a real synthesis failure is remembered for the status text', () => {
  const { s, synth } = speaker({ voices: [] });
  s.say('Hello');
  synth.queue[0].onerror({ error: 'synthesis-failed' });
  a.strictEqual(s.lastError(), 'synthesis-failed');
  synth.queue[0].onend();
  a.strictEqual(s.lastError(), null);
});
