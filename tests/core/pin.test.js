const a = require('assert');
const { webcrypto } = require('crypto');
const { test, testAsync, FakeClock } = require('./harness');
const { Pin } = require('./load');

const FAST = 100000; // the lowest iteration count a stored record may have; keeps these tests quick

test('pin rules: digits only, 4 to 8 of them', () => {
  for (const ok of ['2580', '13579', '24681357']) a.strictEqual(Pin.validate(ok), null, ok);
  a.match(Pin.validate(''), /Enter a PIN/);
  a.match(Pin.validate(undefined), /Enter a PIN/);
  a.match(Pin.validate('12a4'), /digits only/);
  a.match(Pin.validate(' 2580'), /digits only/);
  a.match(Pin.validate('258'), /4 to 8/);
  a.match(Pin.validate('258025802'), /4 to 8/);
});

test('pin setup: both entries must match, and trivial PINs are refused', () => {
  a.strictEqual(Pin.checkNew('2580', '2580'), null);
  a.match(Pin.checkNew('2580', '2581'), /do not match/);
  a.match(Pin.checkNew('2580', ''), /do not match/);
  a.match(Pin.checkNew('1111', '1111'), /repeated/);
  a.match(Pin.checkNew('1234', '1234'), /sequence/);
  a.match(Pin.checkNew('9876', '9876'), /sequence/);
  a.match(Pin.checkNew('12', '12'), /4 to 8/, 'format errors come before the match check');
});

test('pin crypto: availability is detected; nothing is hashed (or stored) without Web Crypto', async () => {
  a.ok(Pin.available(webcrypto));
  a.ok(!Pin.available(undefined));
  a.ok(!Pin.available({ getRandomValues: () => {} }), 'no crypto.subtle (insecure page)');
  await a.rejects(Pin.create({}, '2580'), /crypto-unavailable/);
  await a.rejects(Pin.verify(undefined, '2580', {}), /crypto-unavailable/);
});

testAsync('pin hash: salted PBKDF2-SHA256 record that never contains the PIN', async () => {
  const record = await Pin.create(webcrypto, '2580');
  a.strictEqual(record.kdf, 'PBKDF2-SHA256');
  a.strictEqual(record.iterations, 600000, 'default work factor');
  a.strictEqual(Buffer.from(record.salt, 'base64').length, 16);
  a.strictEqual(Buffer.from(record.key, 'base64').length, 32);
  const text = JSON.stringify(record);
  a.ok(!text.includes('2580'), 'the PIN does not appear in the stored record');
  a.ok(await Pin.verify(webcrypto, '2580', record));
});

testAsync('pin verify: correct PIN accepted, wrong or malformed PINs rejected', async () => {
  const record = await Pin.create(webcrypto, '4826', FAST);
  a.strictEqual(await Pin.verify(webcrypto, '4826', record), true);
  a.strictEqual(await Pin.verify(webcrypto, '4827', record), false);
  a.strictEqual(await Pin.verify(webcrypto, '04826', record), false);
  a.strictEqual(await Pin.verify(webcrypto, '', record), false);
  a.strictEqual(await Pin.verify(webcrypto, 'abcd', record), false);
});

testAsync('pin hash: the same PIN twice gives different salts and keys', async () => {
  const one = await Pin.create(webcrypto, '4826', FAST);
  const two = await Pin.create(webcrypto, '4826', FAST);
  a.notStrictEqual(one.salt, two.salt);
  a.notStrictEqual(one.key, two.key);
  a.ok(await Pin.verify(webcrypto, '4826', two));
});

testAsync('pin record: corrupt or weakened stored records are refused', async () => {
  const good = await Pin.create(webcrypto, '4826', FAST);
  a.deepStrictEqual(Pin.clean(good), good);
  const bad = [null, 'x', {}, { ...good, v: 2 }, { ...good, kdf: 'plain' }, { ...good, iterations: 1000 },
    { ...good, iterations: '600000' }, { ...good, salt: '!!' }, { ...good, key: good.salt }, { pin: '4826' }];
  for (const b of bad) {
    a.strictEqual(Pin.clean(b), null, JSON.stringify(b));
    a.strictEqual(await Pin.verify(webcrypto, '4826', b), false);
  }
});

test('pin limiter: 5 free tries, then growing waits, reset by a correct PIN', () => {
  const clock = FakeClock();
  const lim = Pin.createLimiter({ now: clock.now });
  for (let i = 0; i < 4; i++) { lim.fail(); a.strictEqual(lim.waitMs(), 0); }
  lim.fail();
  a.strictEqual(lim.waitMs(), 30000);
  clock.advance(30000);
  a.strictEqual(lim.waitMs(), 0, 'never locked permanently');
  lim.fail();
  a.strictEqual(lim.waitMs(), 60000);
  for (let i = 0; i < 10; i++) lim.fail();
  a.strictEqual(lim.waitMs(), 300000, 'capped at 5 minutes');
  lim.succeed();
  a.strictEqual(lim.waitMs(), 0);
  a.strictEqual(lim.failures(), 0);
});
