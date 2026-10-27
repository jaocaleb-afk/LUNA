'use strict';
/* PinStore: the saved exit-PIN record, in its own localStorage key ('luna.pin.v1'), apart from every other setting.
   Only a salted PBKDF2 hash is stored (core/pin.js); the PIN itself is never written anywhere.
   Every check of the PIN (lock screen, change, remove) goes through verify(), which shares one attempt limiter. */
const PinStore = (() => {
  const KEY = 'luna.pin.v1';
  const limiter = Pin.createLimiter({});
  let record = null;
  let unreadable = false;  // something was stored, but it is not a valid record

  const crypto = () => window.crypto;
  const seconds = (ms) => Math.ceil(ms / 1000) + ' s';

  function load() {
    const raw = store.get(KEY, null);
    record = Pin.clean(raw);
    unreadable = raw !== null && !record;
  }

  /* Write, then read back: never report a PIN as saved if the browser did not keep it. */
  function write(value) {
    store.set(KEY, value);
    if (JSON.stringify(store.get(KEY, null)) !== JSON.stringify(value)) throw new Error('storage-failed');
  }

  return {
    load,
    available: () => Pin.available(crypto()),
    isSet: () => !!record,
    unreadable: () => unreadable,

    /* Save a new PIN (the caller has already checked it with Pin.checkNew). */
    async save(pin) {
      const fresh = await Pin.create(crypto(), pin);
      write(fresh);
      record = fresh;
      unreadable = false;
    },

    /* -> {ok, msg}. Wrong PINs count towards the limiter; badly formed input does not. */
    async verify(pin) {
      const wait = limiter.waitMs();
      if (wait) return { ok: false, msg: 'Too many wrong PINs. Try again in ' + seconds(wait) + '.' };
      if (!record) return { ok: false, msg: 'No PIN is set.' };
      const formatError = Pin.validate(pin);
      if (formatError) return { ok: false, msg: formatError };
      const ok = await Pin.verify(crypto(), pin, record);
      if (ok) { limiter.succeed(); return { ok: true, msg: '' }; }
      limiter.fail();
      const locked = limiter.waitMs();
      return { ok: false, msg: 'Wrong PIN.' + (locked ? ' Too many wrong PINs. Try again in ' + seconds(locked) + '.' : ' Try again.') };
    },

    remove() {
      try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
      record = null;
      unreadable = false;
    },
  };
})();
