/* ScreenTimeRecord: the Screen Time Timer's saved data — its shape, validation and pruning. Pure, no DOM.
   (Reading and writing localStorage is done by js/app/screen-time-store.js.)

   Saved shape (localStorage "luna.screentime.v1"):
     { v: 1,
       sessions: [ {start, end, dismissed} ... ],   wall-clock ms, oldest first; end is always start + 20 min;
                                                    dismissed = the finished-session alert was dismissed
       lockedUntil: 0,                              ms; > now means "no session may start before this"
       lockReason: '' | 'corrupt' }
   That is everything the rules need: the running session, today's count, the last end time (weekday gap),
   the last two sessions (weekend back-to-back rule) and the alert state. Nothing personal is stored.

   Saved data is treated as untrusted. clean() accepts it only if every field is exactly as expected.
   Anything else (unparseable JSON, unknown fields, wrong lengths, overlapping or unsorted sessions, an absurd lock)
   is NOT repaired into a fresh allowance: it is replaced by a lock until the next local midnight, so damaged
   or edited data can never grant extra sessions. (Deleting the data entirely cannot be told apart from a first
   run, which is one reason a web page is not tamper-proof — see README.) */
const ScreenTimeRecord = (() => {
  const VERSION = 1;
  const MAX_SESSIONS = 300;
  const KEEP_MS = 2 * 24 * 3600 * 1000;      // history older than 2 days is never needed by the rules
  const MAX_LOCK_AHEAD_MS = 2 * 24 * 3600 * 1000;
  const LOCK_REASONS = ['', 'corrupt'];

  const empty = () => ({ v: VERSION, sessions: [], lockedUntil: 0, lockReason: '' });
  const hasExactly = (obj, keys) => Object.keys(obj).length === keys.length && keys.every((k) => k in obj);
  const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

  function validSession(s) {
    return isPlainObject(s) && hasExactly(s, ['start', 'end', 'dismissed']) &&
      Number.isSafeInteger(s.start) && s.start > 0 &&
      s.end === s.start + ScreenTimePolicy.SESSION_MS && typeof s.dismissed === 'boolean';
  }

  function valid(raw, now) {
    if (!isPlainObject(raw) || !hasExactly(raw, ['v', 'sessions', 'lockedUntil', 'lockReason'])) return false;
    if (raw.v !== VERSION || !Array.isArray(raw.sessions) || raw.sessions.length > MAX_SESSIONS) return false;
    if (!Number.isSafeInteger(raw.lockedUntil) || raw.lockedUntil < 0 || raw.lockedUntil > now + MAX_LOCK_AHEAD_MS) return false;
    if (!LOCK_REASONS.includes(raw.lockReason)) return false;
    const sessions = raw.sessions;
    for (let i = 0; i < sessions.length; i++) {
      if (!validSession(sessions[i])) return false;
      if (i > 0 && sessions[i].start < sessions[i - 1].end) return false;         // unsorted or overlapping
      if (i < sessions.length - 1 && !sessions[i].dismissed) return false;          // only the newest can still be alerting
    }
    return true;
  }

  /* No session may start before the next local midnight. Used when saved data cannot be trusted. */
  const lockout = (now) => Object.assign(empty(), { lockedUntil: ScreenTimePolicy.nextMidnight(now), lockReason: 'corrupt' });

  const copy = (r) => ({ v: r.v, sessions: r.sessions.map((s) => ({ start: s.start, end: s.end, dismissed: s.dismissed })),
    lockedUntil: r.lockedUntil, lockReason: r.lockReason });

  /* loaded = {status:'missing'} | {status:'ok', value} | {status:'unreadable'}  (from the store)
     -> {record, problem: null | 'corrupt'}.  A missing record is a normal first run. */
  function clean(loaded, now) {
    if (!loaded || loaded.status === 'missing') return { record: empty(), problem: null };
    if (loaded.status === 'ok' && valid(loaded.value, now)) return { record: copy(loaded.value), problem: null };
    return { record: lockout(now), problem: 'corrupt' };
  }

  /* Drop history the rules no longer need (older than 2 days), always keeping the newest two sessions. */
  function prune(sessions, now) {
    return sessions.filter((s, i) => i >= sessions.length - 2 || s.end > now - KEEP_MS);
  }

  return { VERSION, empty, valid, clean, lockout, prune, copy };
})();
