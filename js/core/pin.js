/* Pin: the kiosk exit PIN. What a PIN may be, salted PBKDF2 hashing via Web Crypto, and an attempt limiter.
   Pure logic: the Web Crypto object is INJECTED, so Node tests use Node's webcrypto, and a browser without
   crypto.subtle (it only exists on secure pages: https:// or localhost) is detected instead of ever
   falling back to storing the PIN in plain text.

   Stored record (never contains the PIN itself):
     {v:1, kdf:'PBKDF2-SHA256', iterations, salt:<base64, 16 random bytes>, key:<base64, 32 derived bytes>} */
const Pin = (() => {
  const MIN_LENGTH = 4;
  const MAX_LENGTH = 8;
  const ITERATIONS = 600000;      // OWASP (2023) guidance for PBKDF2-HMAC-SHA256
  const MIN_ITERATIONS = 100000;  // a stored record weaker than this is treated as corrupt
  const SALT_BYTES = 16;
  const KEY_BITS = 256;
  const KDF = 'PBKDF2-SHA256';

  /* ---------- what a PIN may be ---------- */
  function validate(pin) {
    if (typeof pin !== 'string' || pin === '') return 'Enter a PIN.';
    if (!/^[0-9]+$/.test(pin)) return 'Use digits only (0–9).';
    if (pin.length < MIN_LENGTH || pin.length > MAX_LENGTH) return 'Use ' + MIN_LENGTH + ' to ' + MAX_LENGTH + ' digits.';
    return null;
  }

  const isRun = (pin, step) => pin.split('').every((d, i) => i === 0 || Number(d) === (Number(pin[i - 1]) + step + 10) % 10);

  /* A new PIN: valid, typed the same twice, and not trivially guessable. Returns an error message or null. */
  function checkNew(pin, confirm) {
    const error = validate(pin);
    if (error) return error;
    if (/^(\d)\1+$/.test(pin)) return 'Choose a PIN that is not one digit repeated.';
    if (isRun(pin, 1) || isRun(pin, -1)) return 'Choose a PIN that is not a simple sequence like 1234.';
    if (pin !== confirm) return 'The two PINs do not match. Type the same PIN in both boxes.';
    return null;
  }

  /* ---------- hashing ---------- */
  function available(crypto) {
    return !!(crypto && crypto.subtle && typeof crypto.subtle.importKey === 'function' &&
      typeof crypto.subtle.deriveBits === 'function' && typeof crypto.getRandomValues === 'function');
  }

  const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
  function fromBase64(text) {
    const raw = atob(text);
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  async function derive(crypto, pin, salt, iterations) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, KEY_BITS);
    return new Uint8Array(bits);
  }

  /* Constant-time comparison: the time taken does not depend on where the bytes differ. */
  function sameBytes(x, y) {
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
  }

  async function create(crypto, pin, iterations = ITERATIONS) {
    if (!available(crypto)) throw new Error('crypto-unavailable');
    if (validate(pin)) throw new Error('invalid-pin');
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const key = await derive(crypto, pin, salt, iterations);
    return { v: 1, kdf: KDF, iterations, salt: toBase64(salt), key: toBase64(key) };
  }

  async function verify(crypto, pin, record) {
    if (!available(crypto)) throw new Error('crypto-unavailable');
    const r = clean(record);
    if (!r || validate(pin)) return false;
    const key = await derive(crypto, pin, fromBase64(r.salt), r.iterations);
    return sameBytes(key, fromBase64(r.key));
  }

  /* A stored record, checked field by field. Returns null for anything malformed. */
  function clean(record) {
    if (!record || typeof record !== 'object' || record.v !== 1 || record.kdf !== KDF) return null;
    const { iterations, salt, key } = record;
    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > 10000000) return null;
    try {
      if (fromBase64(salt).length !== SALT_BYTES || fromBase64(key).length !== KEY_BITS / 8) return null;
    } catch (e) { return null; }
    return { v: 1, kdf: KDF, iterations, salt, key };
  }

  /* ---------- attempt limiter ----------
     The first `free` wrong PINs cost nothing; after that each wrong PIN locks entry for a while
     (30 s, 60 s, 120 s ... up to 5 min). A correct PIN resets it. It never locks permanently. */
  function createLimiter(env) {
    const now = env.now || (() => Date.now());
    const free = env.free || 5;
    const baseMs = env.baseMs || 30000;
    const maxMs = env.maxMs || 300000;
    let failures = 0;
    let until = 0;
    return {
      waitMs: () => Math.max(0, until - now()),
      fail() {
        failures++;
        if (failures >= free) until = now() + Math.min(maxMs, baseMs * Math.pow(2, failures - free));
      },
      succeed() { failures = 0; until = 0; },
      failures: () => failures,
    };
  }

  return { MIN_LENGTH, MAX_LENGTH, ITERATIONS, validate, checkNew, available, create, verify, clean, createLimiter };
})();
