const a = require('assert');
const { test } = require('./harness');
const { VoicePhrases } = require('./load');

test('wake phrase: accepted spellings and rejected near-misses', () => {
  const match = VoicePhrases.matchWake;
  for (const s of ['Hey Luna', 'hey luna', 'Hey, LUNA!', 'hay luna', 'hey loona', 'Hey Luna set a 5 minute timer']) {
    a.ok(match(s).woke, s);
  }
  for (const s of ['luna', 'hello luna', 'they lunar eclipse', 'hey', 'heyluna', 'play some music', 'a blue moon']) {
    a.ok(!match(s).woke, s);
  }
});

test('wake phrase: the command after it is extracted and tidied', () => {
  a.strictEqual(VoicePhrases.matchWake('Hey Luna, set a 5 minute timer.').command, 'set a 5 minute timer');
  a.strictEqual(VoicePhrases.matchWake('hey luna').command, '');
  a.strictEqual(VoicePhrases.stripWake('what time is it'), 'what time is it');
});
