const a = require('assert');
const { test } = require('./harness');
const { SpeechText } = require('./load');

const say = SpeechText.toSpeech;

test('speech text: calculations are read as words, saying the same thing as the screen', () => {
  a.strictEqual(say('25 + 17 = 42'), '25 plus 17 equals 42.');
  a.strictEqual(say('20 − 35 = −15'), '20 minus 35 equals negative 15.');
  a.strictEqual(say('8 × 7 = 56'), '8 times 7 equals 56.');
  a.strictEqual(say('144 ÷ 12 = 12'), '144 divided by 12 equals 12.');
  a.strictEqual(say('1 ÷ 3 ≈ 0.3333'), '1 divided by 3 is about 0.3333.');
  a.strictEqual(say('15% of 80 = 12'), '15 percent of 80 equals 12.');
  a.strictEqual(say('(12 + 6) × 3 = 54'), '12 plus 6, times 3 equals 54.');
  a.strictEqual(say('1000 × 3 = 3,000'), '1000 times 3 equals 3,000.');
  a.strictEqual(say('You can’t divide by zero, so 10 ÷ 0 has no answer.'), 'You can’t divide by zero, so 10 divided by 0 has no answer.');
});

test('speech text: names, quotes, arrows and dashes are smoothed out; sentences end with a full stop', () => {
  a.strictEqual(say('This is LUNA'), 'This is Luna.');
  a.strictEqual(say('Try “set a 5 minute timer”.'), 'Try set a 5 minute timer.');
  a.strictEqual(say('Timer paused.'), 'Timer paused.');
  a.strictEqual(say('Your timer will finish at 9:05 AM, in 1 minute and 42 seconds.'), 'Your timer will finish at 9:05 AM, in 1 minute and 42 seconds.');
  a.strictEqual(say('Set a 24-hour clock — then rest'), 'Set a 24-hour clock, then rest.');
  a.strictEqual(say(''), '');
});
