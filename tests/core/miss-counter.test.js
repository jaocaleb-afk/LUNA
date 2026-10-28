const a = require('assert');
const { test } = require('./harness');
const { MissCounter, Parser } = require('./load');

test('misses: first miss "I didn’t catch that.", second "Sorry, that command isn’t supported.", then it starts again', () => {
  const m = MissCounter.create();
  a.strictEqual(m.record(1, false).reply, 'I didn’t catch that.');
  a.strictEqual(m.record(2, false).reply, 'Sorry, that command isn’t supported.');
  a.strictEqual(m.count(), 0, 'reset after the second reply');
  a.strictEqual(m.record(3, false).reply, 'I didn’t catch that.', 'a later, unrelated miss gets the first reply again');
});

test('misses: an understood command resets the count and gets no generic reply', () => {
  const m = MissCounter.create();
  m.record(1, false);
  const ok = m.record(2, true);
  a.strictEqual(ok.reply, null);
  a.strictEqual(m.count(), 0);
  a.strictEqual(m.record(3, false).reply, 'I didn’t catch that.', 'the count started again after the success');
});

test('misses: the same message is not repeated for every failure', () => {
  const m = MissCounter.create();
  const replies = [1, 2, 3, 4].map((id) => m.record(id, false).reply);
  a.deepStrictEqual(replies, [MissCounter.FIRST, MissCounter.SECOND, MissCounter.FIRST, MissCounter.SECOND]);
  a.notStrictEqual(replies[0], replies[1]);
});

test('misses: one utterance reported twice (duplicate callbacks) is counted once', () => {
  const m = MissCounter.create();
  const first = m.record(7, false);
  const again = m.record(7, false);
  a.strictEqual(again.reply, first.reply);
  a.strictEqual(m.count(), 1);
  a.strictEqual(m.record(8, false).reply, MissCounter.SECOND);
});

test('misses: what counts as not understood (parser kinds)', () => {
  const kind = (text) => { const r = Parser.parse(text); return r.ok ? 'done' : r.kind; };
  a.strictEqual(kind('what is the weather like'), 'unknown');
  a.strictEqual(kind('blah blah timer'), 'unknown');
  a.strictEqual(kind('start screen time'), 'unsupported', 'understood, but not done by voice');
  a.strictEqual(kind('set a timer for 5'), 'invalid', 'a timer command with a question about it is understood');
  a.strictEqual(kind('set a timer for 30 hours'), 'invalid');
  a.strictEqual(kind('Hey Luna, open settings'), 'done');
});
