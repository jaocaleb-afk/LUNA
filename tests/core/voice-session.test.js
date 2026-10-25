const a = require('assert');
const { test, FakeClock } = require('./harness');
const { VoiceCore } = require('./load');

/* A fake browser SpeechRecognition. Tests drive it by hand: audio(), say([...]), err(code), end(). */
class FakeRec {
  constructor() { FakeRec.all.push(this); this.started = false; this.aborted = false; }
  start() { if (FakeRec.failStart) throw new Error('InvalidStateError'); this.started = true; }
  stop() { this.started = false; if (this.onend) this.onend(); }
  abort() { this.aborted = true; this.started = false; }
  audio() { if (this.onaudiostart) this.onaudiostart(); }
  end() { this.started = false; if (this.onend) this.onend(); }
  err(code) { if (this.onerror) this.onerror({ error: code }); }
  say(items, resultIndex = 0) {
    const results = items.map(([text, isFinal]) => Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: !!isFinal }));
    if (this.onresult) this.onresult({ resultIndex, results });
  }
}
FakeRec.all = [];

function makeVoice(overrides) {
  FakeRec.all = [];
  FakeRec.failStart = false;
  const clock = FakeClock(), events = [], ran = [];
  const voice = VoiceCore.createVoice(Object.assign({
    ctor: FakeRec, secure: true, lang: () => 'en-US',
    emit: (e) => events.push(e),
    run: (text) => { ran.push(text); return { ok: true, msg: 'done: ' + text }; },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: () => clock.now(),
  }, overrides));
  return { voice, clock, events, ran, rec: () => FakeRec.all[FakeRec.all.length - 1] };
}

test('voice: unsupported browser and insecure origin are reported, never faked', () => {
  let x = makeVoice({ ctor: null });
  const unsupported = x.voice.startWake();
  a.ok(!unsupported.ok);
  a.strictEqual(unsupported.reason, 'unsupported');
  a.strictEqual(x.voice.getState(), 'error');
  a.strictEqual(FakeRec.all.length, 0);

  x = makeVoice({ secure: false });
  a.strictEqual(x.voice.listenOnce().reason, 'insecure');
  a.ok(/secure|localhost/.test(x.voice.getError().msg));
  a.strictEqual(FakeRec.all.length, 0, 'the microphone is never touched');
});

test('voice: wake mode is only "listening" once audio has actually started', () => {
  const x = makeVoice();
  x.voice.startWake();
  a.strictEqual(x.voice.getState(), 'starting');
  x.rec().audio();
  a.strictEqual(x.voice.getState(), 'wake');
  a.ok(!x.voice.isVerified(), 'not verified until the phrase has been heard');
});

test('voice: "Hey Luna", then the command in a separate utterance', () => {
  const x = makeVoice();
  x.voice.startWake();
  x.rec().audio();
  x.rec().say([['hey luna', false]]);
  a.strictEqual(x.voice.getState(), 'command');
  a.ok(x.voice.isVerified());
  x.rec().say([['hey luna', true]]);
  a.strictEqual(x.voice.getState(), 'command', 'still waiting for the command');
  x.rec().say([['hey luna', true], ['set a 2 minute timer', false]], 1);
  x.rec().say([['hey luna', true], ['set a 2 minute timer', true]], 1);
  a.deepStrictEqual(x.ran, ['set a 2 minute timer']);
  a.strictEqual(x.voice.getState(), 'wake');
  const cmd = x.events.find((e) => e.type === 'command');
  a.strictEqual(cmd.text, 'set a 2 minute timer');
  a.ok(cmd.ok);
});

test('voice: wake phrase and command in one utterance (interim, then final)', () => {
  const x = makeVoice();
  x.voice.startWake();
  x.rec().audio();
  x.rec().say([['hey luna set a', false]]);
  x.rec().say([['hey luna set a 5 minute timer', true]]);
  a.deepStrictEqual(x.ran, ['set a 5 minute timer']);
  a.strictEqual(x.voice.getState(), 'wake');
});

test('voice: unrelated speech is ignored and never surfaced', () => {
  const x = makeVoice();
  x.voice.startWake();
  x.rec().audio();
  x.rec().say([['we should talk about the budget tomorrow', true]]);
  a.deepStrictEqual(x.ran, []);
  a.ok(!x.events.some((e) => e.type === 'heard'));
  a.strictEqual(x.voice.getState(), 'wake');
});

test('voice: the command window times out back to wake mode', () => {
  const x = makeVoice();
  x.voice.startWake();
  x.rec().audio();
  x.rec().say([['hey luna', true]]);
  a.strictEqual(x.voice.getState(), 'command');
  x.clock.advance(8001);
  a.strictEqual(x.voice.getState(), 'wake');
  a.ok(x.events.some((e) => e.type === 'timeout'));
  a.deepStrictEqual(x.ran, []);
});

test('voice: push-to-talk needs no wake phrase, runs one command, then stops', () => {
  const x = makeVoice();
  a.ok(x.voice.listenOnce().ok);
  x.rec().audio();
  a.strictEqual(x.voice.getState(), 'command');
  x.rec().say([['pause the timer', false]]);
  x.rec().say([['pause the timer', true]]);
  a.deepStrictEqual(x.ran, ['pause the timer']);
  a.strictEqual(x.voice.getState(), 'idle');
  a.strictEqual(x.rec().started, false);
});

test('voice: push-to-talk while wake mode is armed reuses the open session', () => {
  const x = makeVoice();
  x.voice.startWake();
  x.rec().audio();
  const count = FakeRec.all.length;
  x.voice.listenOnce();
  a.strictEqual(FakeRec.all.length, count);
  a.strictEqual(x.voice.getState(), 'command');
  x.rec().say([['what time is it', true]]);
  a.deepStrictEqual(x.ran, ['what time is it']);
  a.strictEqual(x.voice.getState(), 'wake');
});

test('voice: push-to-talk silence ends with no command and back to idle', () => {
  const x = makeVoice();
  x.voice.listenOnce();
  x.rec().audio();
  x.clock.advance(8001);
  a.strictEqual(x.voice.getState(), 'idle');
  a.ok(x.events.some((e) => e.type === 'timeout'));
});

test('voice: permission denied is fatal, explained, and wake mode does not retry', () => {
  const x = makeVoice();
  x.voice.startWake();
  x.rec().err('not-allowed');
  a.strictEqual(x.voice.getState(), 'error');
  a.strictEqual(x.voice.getError().code, 'not-allowed');
  a.ok(/permission/i.test(x.voice.getError().msg));
  x.clock.advance(120000);
  a.strictEqual(FakeRec.all.length, 1, 'no restart loop');
  a.ok(!x.voice.wantsWake());
});

test('voice: no microphone, blocked service and bad language each get their own message', () => {
  for (const [code, pattern] of [['audio-capture', /microphone was found/i], ['service-not-allowed', /blocked/i], ['language-not-supported', /language/i]]) {
    const x = makeVoice();
    x.voice.listenOnce();
    x.rec().err(code);
    a.strictEqual(x.voice.getState(), 'error');
    a.ok(pattern.test(x.voice.getError().msg), code);
  }
});

test('voice: "no-speech" and "aborted" are benign', () => {
  const x = makeVoice();
  x.voice.listenOnce();
  x.rec().audio();
  x.rec().err('no-speech');
  a.strictEqual(x.voice.getState(), 'command');
  x.rec().err('aborted');
  a.notStrictEqual(x.voice.getState(), 'error');
});

test('voice: a continuous session that ends normally restarts quickly', () => {
  const x = makeVoice();
  x.voice.startWake();
  x.rec().audio();
  x.clock.advance(60000);
  x.rec().end();
  x.clock.advance(300);
  a.strictEqual(FakeRec.all.length, 2);
  x.rec().audio();
  a.strictEqual(x.voice.getState(), 'wake');
});

test('voice: repeated network failures back off, then stop and say so', () => {
  const x = makeVoice();
  x.voice.startWake();
  let guard = 0;
  while (x.voice.getState() !== 'error' && guard++ < 20) { x.rec().err('network'); x.rec().end(); x.clock.advance(40000); }
  a.strictEqual(x.voice.getState(), 'error');
  a.ok(FakeRec.all.length >= 3 && FakeRec.all.length <= 7, 'bounded retries: ' + FakeRec.all.length);
  a.ok(/internet|speech service/i.test(x.voice.getError().msg));
  const count = FakeRec.all.length;
  x.clock.advance(300000);
  a.strictEqual(FakeRec.all.length, count, 'stays stopped');
});

test('voice: start() throwing is handled', () => {
  const x = makeVoice();
  FakeRec.failStart = true;
  x.voice.startWake();
  a.strictEqual(x.voice.getState(), 'error');
  a.strictEqual(x.voice.getError().code, 'start-failed');
});

test('voice: stop() aborts the microphone and ignores late events from the old session', () => {
  const x = makeVoice();
  x.voice.startWake();
  x.rec().audio();
  const old = x.rec();
  x.voice.stop();
  a.ok(old.aborted);
  a.strictEqual(x.voice.getState(), 'idle');
  old.say([['hey luna set a 5 minute timer', true]]);
  old.end();
  a.deepStrictEqual(x.ran, []);
  a.strictEqual(x.voice.getState(), 'idle');
  x.clock.advance(100000);
  a.strictEqual(FakeRec.all.length, 1);
});
