const a = require('assert');
const { test } = require('./harness');
const { VoicePhrases } = require('./load');

test('voice wording: every known problem has its own explanation with a way forward', () => {
  const codes = ['unsupported', 'insecure', 'not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported', 'start-failed'];
  const seen = new Set();
  for (const code of codes) {
    const msg = VoicePhrases.explain(code);
    a.ok(msg.length > 20 && !msg.startsWith('Speech recognition error'), code);
    seen.add(msg);
  }
  a.strictEqual(seen.size, codes.length, 'no two problems share a message');
  a.strictEqual(VoicePhrases.explain('odd-code'), 'Speech recognition error: odd-code.');
});

test('voice wording: the insecure-page fix is HTTPS or localhost, not a browser flag', () => {
  const msg = VoicePhrases.explain('insecure');
  a.ok(/https:\/\//.test(msg) && /trusts/.test(msg) && /localhost/.test(msg));
  a.ok(!/flag|unsafely/i.test(msg));
});

test('voice wording: no wake-phrase API remains', () => {
  a.deepStrictEqual(Object.keys(VoicePhrases), ['explain']);
});
