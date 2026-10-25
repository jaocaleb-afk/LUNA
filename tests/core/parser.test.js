const a = require('assert');
const { test } = require('./harness');
const { Parser, TimerEngine } = require('./load');

// The checks from the original Core.test.js, kept as they were.
test('original: parser + default engine', () => {
  a.deepStrictEqual(Parser.parse('Set a 5 minute timer').action, { type: 'timer.set', seconds: 300 });
  a.ok(!Parser.parse('set a 25 hour timer').ok);
  a.ok(!Parser.parse('set a 0 minute timer').ok);
  a.strictEqual(Parser.parse('pause the timer').action.type, 'timer.pause');
  a.ok(!TimerEngine.pause().ok);
  a.ok(TimerEngine.start(2000).ok);
  a.ok(TimerEngine.pause().ok);
  a.ok(TimerEngine.resume().ok);
  a.ok(TimerEngine.cancel().ok);
});

test('parser: number words and "a minute"', () => {
  a.strictEqual(Parser.parse('set a five minute timer').action.seconds, 300);
  a.strictEqual(Parser.parse('Set a timer for twenty five minutes').action.seconds, 1500);
  a.strictEqual(Parser.parse('start a timer for forty-five seconds').action.seconds, 45);
  a.strictEqual(Parser.parse('set a timer for a minute').action.seconds, 60);
  a.strictEqual(Parser.parse('set a timer for an hour').action.seconds, 3600);
  a.strictEqual(Parser.parse('set a timer for two minutes').action.seconds, 120);
});

test('parser: navigation and rejected input', () => {
  a.strictEqual(Parser.parse('open schedules').action.screen, 'schedules');
  a.strictEqual(Parser.parse('open settings').action.screen, 'settings');
  a.ok(!Parser.parse('').ok);
  a.ok(!Parser.parse('constructor').ok);
  a.ok(!Parser.parse('set a timer for banana').ok);
});
