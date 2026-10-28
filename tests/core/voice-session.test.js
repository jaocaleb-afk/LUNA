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
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
  }, overrides));
  return { voice, clock, events, ran, rec: () => FakeRec.all[FakeRec.all.length - 1] };
}

test('voice: insecure origin is rejected cleanly and no microphone session is ever created', () => {
  const x = makeVoice({ secure: false });
  a.strictEqual(x.voice.support().reason, 'insecure');
  const r = x.voice.listen();
  a.ok(!r.ok);
  a.strictEqual(r.reason, 'insecure');
  a.strictEqual(x.voice.getState(), 'error');
  a.ok(/https:\/\//.test(x.voice.getError().msg) && /localhost/.test(x.voice.getError().msg));
  a.ok(!/flag/i.test(x.voice.getError().msg), 'browser flags are not offered as the fix');
  x.voice.listen();
  x.clock.advance(60000);
  a.strictEqual(FakeRec.all.length, 0, 'the recogniser is never constructed, even after retrying');
});

test('voice: unsupported browser is explained, never faked', () => {
  const x = makeVoice({ ctor: null });
  const r = x.voice.listen();
  a.strictEqual(r.reason, 'unsupported');
  a.ok(/no speech recognition/.test(x.voice.getError().msg));
  a.strictEqual(x.voice.getState(), 'error');
  // insecure AND unsupported: both problems are named
  const y = makeVoice({ ctor: null, secure: false });
  a.ok(/secure page/.test(y.voice.support().msg) && /no speech recognition/.test(y.voice.support().msg));
});

test('voice: a secure, supported page can attempt push-to-talk (one non-continuous session)', () => {
  const x = makeVoice();
  a.ok(x.voice.support().ok);
  a.ok(x.voice.listen().ok);
  a.strictEqual(FakeRec.all.length, 1);
  a.strictEqual(x.rec().continuous, false);
  a.strictEqual(x.rec().lang, 'en-US');
  a.ok(x.rec().started);
});

test('voice: only "listening" once audio has actually started', () => {
  const x = makeVoice();
  x.voice.listen();
  a.strictEqual(x.voice.getState(), 'starting');
  x.rec().audio();
  a.strictEqual(x.voice.getState(), 'listening');
});

test('voice: push-to-talk runs the first final command with no wake phrase, then stops', () => {
  const x = makeVoice();
  x.voice.listen();
  x.rec().audio();
  x.rec().say([['pause the', false]]);
  a.deepStrictEqual(x.ran, [], 'interim text is shown, not run');
  a.ok(x.events.some((e) => e.type === 'heard' && !e.final));
  x.rec().say([['pause the timer', true]]);
  a.deepStrictEqual(x.ran, ['pause the timer']);
  const cmd = x.events.find((e) => e.type === 'command');
  a.strictEqual(cmd.text, 'pause the timer');
  a.ok(cmd.ok);
  a.strictEqual(x.voice.getState(), 'idle');
  a.strictEqual(x.rec().started, false);
  a.ok(!x.events.some((e) => e.type === 'timeout'), 'a successful command is not reported as "didn’t catch"');
});

test('voice: any sentence is a command (no special phrase is stripped or required)', () => {
  const x = makeVoice();
  x.voice.listen();
  x.rec().audio();
  x.rec().say([['hey luna set a 5 minute timer', true]]);
  a.deepStrictEqual(x.ran, ['hey luna set a 5 minute timer'], 'passed through unchanged');
});

test('voice: results arriving without audiostart still work (some engines skip it)', () => {
  const x = makeVoice();
  x.voice.listen();
  x.rec().say([['what time is it', true]]);
  a.deepStrictEqual(x.ran, ['what time is it']);
  a.strictEqual(x.voice.getState(), 'idle');
});

test('voice: only one command per tap; late results are ignored', () => {
  const x = makeVoice();
  x.voice.listen();
  x.rec().audio();
  const rec = x.rec();
  rec.onend = null;          // simulate a browser that is slow to end the session
  rec.say([['pause the timer', true]]);
  rec.say([['pause the timer', true], ['cancel the timer', true]], 1);
  a.deepStrictEqual(x.ran, ['pause the timer']);
});

test('voice: silence times out with a message and closes the microphone', () => {
  const x = makeVoice();
  x.voice.listen();
  x.rec().audio();
  x.clock.advance(7999);
  a.strictEqual(x.voice.getState(), 'listening');
  x.clock.advance(2);
  a.strictEqual(x.voice.getState(), 'idle');
  a.ok(x.events.some((e) => e.type === 'timeout'));
  a.ok(x.rec().aborted);
  a.deepStrictEqual(x.ran, []);
});

test('voice: "no-speech" from the browser ends quietly with "I didn’t hear anything" (not an error)', () => {
  const x = makeVoice();
  x.voice.listen();
  x.rec().audio();
  x.rec().err('no-speech');
  a.strictEqual(x.voice.getState(), 'idle');
  a.ok(x.events.some((e) => e.type === 'timeout'));
  a.strictEqual(x.voice.getError(), null);
});

test('voice: the browser ending the session with nothing heard says so and goes idle', () => {
  const x = makeVoice();
  x.voice.listen();
  x.rec().audio();
  x.rec().end();
  a.strictEqual(x.voice.getState(), 'idle');
  a.ok(x.events.some((e) => e.type === 'timeout'));
});

test('voice: permission denied is explained with how to fix it, and nothing retries', () => {
  const x = makeVoice();
  x.voice.listen();
  x.rec().err('not-allowed');
  x.rec().end();
  a.strictEqual(x.voice.getState(), 'error');
  a.strictEqual(x.voice.getError().code, 'not-allowed');
  a.ok(/permission/i.test(x.voice.getError().msg) && /Site settings/.test(x.voice.getError().msg));
  x.clock.advance(120000);
  a.strictEqual(FakeRec.all.length, 1, 'no restart loop');
});

test('voice: speech-service and device failures each get their own useful message', () => {
  const cases = [['network', /internet connection/], ['service-not-allowed', /refused/], ['audio-capture', /microphone was found/i],
    ['language-not-supported', /language/i]];
  for (const [code, pattern] of cases) {
    const x = makeVoice();
    x.voice.listen();
    x.rec().err(code);
    a.strictEqual(x.voice.getState(), 'error', code);
    a.ok(pattern.test(x.voice.getError().msg), code);
    a.ok(x.rec().aborted, code + ': microphone released');
  }
  const x = makeVoice();
  x.voice.listen();
  x.rec().err('weird-code');
  a.ok(/weird-code/.test(x.voice.getError().msg), 'unknown codes are reported, not hidden');
});

test('voice: after an error, Talk can try again and the error clears', () => {
  const x = makeVoice();
  x.voice.listen();
  x.rec().err('network');
  a.ok(x.voice.listen().ok);
  a.strictEqual(x.voice.getState(), 'starting');
  a.strictEqual(x.voice.getError(), null);
  a.strictEqual(FakeRec.all.length, 2);
});

test('voice: tapping Talk again while starting does not open a second session', () => {
  const x = makeVoice();
  x.voice.listen();
  x.voice.listen();
  a.strictEqual(FakeRec.all.length, 1);
});

test('voice: start() throwing is handled', () => {
  const x = makeVoice();
  FakeRec.failStart = true;
  a.ok(!x.voice.listen().ok);
  a.strictEqual(x.voice.getState(), 'error');
  a.strictEqual(x.voice.getError().code, 'start-failed');
});

test('voice: stop() works while starting and while listening, and ignores late events', () => {
  let x = makeVoice();
  x.voice.listen();
  x.voice.stop();
  a.ok(x.rec().aborted);
  a.strictEqual(x.voice.getState(), 'idle');

  x = makeVoice();
  x.voice.listen();
  x.rec().audio();
  const old = x.rec();
  x.voice.stop();
  a.ok(old.aborted);
  old.say([['set a 5 minute timer', true]]);
  old.err('network');
  old.end();
  a.deepStrictEqual(x.ran, []);
  a.strictEqual(x.voice.getState(), 'idle');
  a.ok(!x.events.some((e) => e.type === 'timeout'), 'stopping on purpose is not "didn’t catch"');
  x.clock.advance(100000);
  a.strictEqual(FakeRec.all.length, 1, 'nothing restarts by itself');
});

test('voice: a failing command action is reported, not thrown', () => {
  const x = makeVoice({ run: () => { throw new Error('boom'); } });
  x.voice.listen();
  x.rec().say([['pause', true]]);
  const cmd = x.events.find((e) => e.type === 'command');
  a.ok(!cmd.ok && /failed/.test(cmd.msg));
  a.strictEqual(x.voice.getState(), 'idle');
});

/* ---------- not understood: never acted on, reported once, with an id ---------- */
test('voice: each command carries the id of its Talk session, and a session reports only one command', () => {
  const x = makeVoice();
  x.voice.listen(); x.rec().audio(); x.rec().say([['open settings', true]]);
  x.rec && x.rec().say([['open settings', true]]);           // a duplicate callback from the browser
  x.voice.listen(); x.rec().audio(); x.rec().say([['set a 5 minute timer', true]]);
  const commands = x.events.filter((e) => e.type === 'command');
  a.deepStrictEqual(commands.map((c) => c.id), [1, 2]);
  a.deepStrictEqual(x.ran, ['open settings', 'set a 5 minute timer']);
  a.strictEqual(commands[0].kind, 'done');
});

test('voice: the browser\'s "no-match" (speech it could not turn into words) is reported as unclear, not an error', () => {
  const x = makeVoice();
  x.voice.listen(); x.rec().audio(); x.rec().err('no-match');
  const command = x.events.find((e) => e.type === 'command');
  a.ok(command && command.kind === 'unclear' && !command.ok && command.text === '');
  a.deepStrictEqual(x.ran, [], 'nothing is run');
  a.strictEqual(x.voice.getState(), 'idle');
  a.strictEqual(x.voice.getError(), null);
  a.ok(!x.events.some((e) => e.type === 'timeout' || e.type === 'error'));
});

test('voice: a final result the browser marks as very unsure is not acted on; unknown confidence (0) is used', () => {
  const x = makeVoice();
  x.voice.listen(); x.rec().audio();
  x.rec().onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'cancel the timer', confidence: 0.12 }], { isFinal: true })] });
  a.deepStrictEqual(x.ran, [], 'a low-confidence guess never cancels anything');
  a.strictEqual(x.events.find((e) => e.type === 'command').kind, 'unclear');
  x.voice.listen(); x.rec().audio();
  x.rec().onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'open settings', confidence: 0 }], { isFinal: true })] });
  a.deepStrictEqual(x.ran, ['open settings']);
});

test('voice: the kind reported by run() is passed on (unknown commands stay unknown)', () => {
  const x = makeVoice({ run: () => ({ ok: false, msg: 'Unsupported command.', kind: 'unknown' }) });
  x.voice.listen(); x.rec().audio(); x.rec().say([['sing a song', true]]);
  a.strictEqual(x.events.find((e) => e.type === 'command').kind, 'unknown');
});
