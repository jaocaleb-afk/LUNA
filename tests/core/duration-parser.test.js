const a = require('assert');
const { test } = require('./harness');
const { DurationParser } = require('./load');

const secs = (text) => {
  const r = DurationParser.read(text);
  a.ok(r.ok, 'expected "' + text + '" to parse, got: ' + r.error);
  return r.seconds;
};
const code = (text) => {
  const r = DurationParser.read(text);
  a.ok(!r.ok, 'expected "' + text + '" to be rejected, got ' + r.seconds + ' s');
  a.ok(r.error && r.error.length > 10, 'a rejection always explains itself');
  return r.code;
};

test('duration: hours only, minutes only, seconds only', () => {
  a.strictEqual(secs('2 hours'), 7200);
  a.strictEqual(secs('10 minutes'), 600);
  a.strictEqual(secs('30 seconds'), 30);
});

test('duration: hours, minutes and seconds together (exact arithmetic)', () => {
  a.strictEqual(secs('3 hours, 2 minutes, and 19 seconds'), 3 * 3600 + 2 * 60 + 19);
  a.strictEqual(secs('a 3 hour, 2 minute, 19 second timer'), 10939);
  a.strictEqual(secs('1 hour and 15 minutes'), 4500);
  a.strictEqual(secs('45 minutes and 12 seconds'), 2712);
  a.strictEqual(secs('19 seconds 2 minutes 3 hours'), 10939, 'any order');
  a.deepStrictEqual(DurationParser.read('3 hours, 2 minutes, and 19 seconds').parts, { hour: 3, minute: 2, second: 19 });
});

test('duration: zero-valued components', () => {
  a.strictEqual(secs('0 hours, 3 minutes, and 5 seconds'), 185);
  a.strictEqual(secs('zero hours and ten seconds'), 10);
  a.strictEqual(secs('1 hour 0 minutes 0 seconds'), 3600);
  a.strictEqual(code('0 minutes'), 'too-short');
  a.strictEqual(code('0 hours 0 minutes 0 seconds'), 'too-short');
});

test('duration: singular, plural and short unit names', () => {
  a.strictEqual(secs('1 hour'), 3600);
  a.strictEqual(secs('1 hours'), 3600);
  a.strictEqual(secs('5 minute'), 300);
  a.strictEqual(secs('2 hrs 5 mins 3 secs'), 7503);
  a.strictEqual(secs('5m 30s'), 330);
  a.strictEqual(secs('1h30m'), 5400);
  a.strictEqual(secs('10-minute'), 600);
});

test('duration: number words and digits', () => {
  a.strictEqual(secs('three hours'), 10800);
  a.strictEqual(secs('five-minute'), 300);
  a.strictEqual(secs('twenty five minutes'), 1500);
  a.strictEqual(secs('forty-five seconds'), 45);
  a.strictEqual(secs('one hundred and twenty seconds'), 120);
  a.strictEqual(secs('ninety seconds'), 90);
  a.strictEqual(secs('a minute'), 60);
  a.strictEqual(secs('an hour'), 3600);
  a.strictEqual(secs('three hours two minutes and nineteen seconds'), 10939);
});

test('duration: halves and decimals that come to whole seconds', () => {
  a.strictEqual(secs('half an hour'), 1800);
  a.strictEqual(secs('an hour and a half'), 5400);
  a.strictEqual(secs('one and a half hours'), 5400);
  a.strictEqual(secs('2 and a half minutes'), 150);
  a.strictEqual(secs('1.5 hours'), 5400);
  a.strictEqual(secs('0.25 minutes'), 15);
  a.strictEqual(code('1.33 minutes'), 'not-whole');
  a.strictEqual(code('half a second'), 'not-whole');
});

test('duration: missing, ambiguous and nonsensical input is rejected, never guessed', () => {
  a.strictEqual(code(''), 'missing');
  a.strictEqual(code('banana'), 'missing');
  a.strictEqual(code('5'), 'no-unit');
  a.strictEqual(code('5 minutes and 30'), 'no-unit');
  a.strictEqual(code('minutes'), 'no-number');
  a.strictEqual(code('5 minutes and 3 minutes'), 'repeated-unit');
  a.strictEqual(code('10 to 15 minutes'), 'range');
  a.strictEqual(code('10 or 15 minutes'), 'range');
  a.strictEqual(code('1:30'), 'colon');
  a.strictEqual(code('a few minutes'), 'vague');
  a.strictEqual(code('a couple of hours'), 'vague');
  a.strictEqual(code('a quarter of an hour'), 'fraction');
  a.strictEqual(code('five five minutes'), 'no-unit');
  a.strictEqual(code('1.2.3 minutes'), 'no-unit');
});

test('duration: negative values are rejected', () => {
  a.strictEqual(code('-5 minutes'), 'negative');
  a.strictEqual(code('minus 5 minutes'), 'negative');
  a.strictEqual(code('negative ten seconds'), 'negative');
});

test('duration: very large durations are rejected (limit 24 hours, inclusive)', () => {
  a.strictEqual(secs('24 hours'), 86400);
  a.strictEqual(code('24 hours and 1 second'), 'too-long');
  a.strictEqual(code('25 hours'), 'too-long');
  a.strictEqual(code('1500 minutes'), 'too-long');
  a.strictEqual(code('99999999999 seconds'), 'too-long');
});

test('duration: "a second timer" means another timer, not one extra second', () => {
  a.strictEqual(secs('set a second timer for 5 minutes'), 300);
});

test('duration: words() reads back what was parsed', () => {
  a.strictEqual(DurationParser.words(10939), '3 hours, 2 minutes, and 19 seconds');
  a.strictEqual(DurationParser.words(4500), '1 hour and 15 minutes');
  a.strictEqual(DurationParser.words(600), '10 minutes');
  a.strictEqual(DurationParser.words(61), '1 minute and 1 second');
  a.strictEqual(DurationParser.words(3601), '1 hour and 1 second');
  a.strictEqual(DurationParser.words(0), '0 seconds');
});

test('duration: mentions() spots duration-like words only', () => {
  a.ok(DurationParser.mentions('set a timer for five minutes'));
  a.ok(DurationParser.mentions('half an hour'));
  a.ok(!DurationParser.mentions('set a timer'));
  a.ok(!DurationParser.mentions('how much time is left'));
});
