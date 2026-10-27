/* createScreenTimeTimer: the protected 20-minute Screen Time session — start, countdown, expiry, alert dismissal.
   The rules are ScreenTimePolicy's; this object applies them to the saved record and keeps time.

   On purpose there is NO pause, stop, cancel, reset or shorten method. Once start() succeeds, the session can only end
   by its 20 minutes running out. The ordinary timer (timer-engine.js) is a separate object and cannot reach this one.

   Timekeeping
     - The session's end is stored as an absolute wall-clock time, so a reload or a suspended tab recovers it
       from storage (never restarting from 20:00) and an expired session is detected on load.
     - Remaining time is always recalculated from clocks, never by counting ticks, so late timer callbacks
       (background-tab throttling) cannot make it drift. Ticks only refresh the display.
     - While the page runs, a monotonic clock (performance.now) is compared with the wall clock every tick:
         wall clock BEHIND the monotonic one (clock set back): the monotonic time is kept, and the saved times
           are shifted to the new clock, so the session is not lengthened;
         wall clock AHEAD (device slept — monotonic clocks may pause in sleep — or clock set forward): real time
           passed, so the wall clock is kept.
       A page cannot run while the browser or OS has closed or frozen it; the state is caught up on the next tick.

   env = { now(): wall ms, mono(): monotonic ms, load(): {status, value?}, save(record): bool,
           setTimeout, clearTimeout, onChange(view, kind) }       kind: 'init'|'tick'|'start'|'expired'|'dismiss'
   API: init(), view(), start() -> {ok, reason?}, dismiss() -> {ok, saved?}, refresh()                          */
function createScreenTimeTimer(env) {
  const SESSION_MS = ScreenTimePolicy.SESSION_MS;
  const TICK_MS = 1000;
  const DRIFT_MS = 2000;        // clock disagreements smaller than this are ignored
  const later = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const cancelLater = env.clearTimeout || ((h) => clearTimeout(h));

  let record = ScreenTimeRecord.empty();
  let problem = null;           // 'corrupt' if the saved data was rejected at load
  let monoEnd = null;           // monotonic end of the session running in this page, or null
  let handle = null;

  const lastSession = () => record.sessions[record.sessions.length - 1] || null;
  const emit = (kind) => { try { env.onChange(view(), kind); } catch (e) { console.error(e); } };

  /* Express the whole history in the current clock by moving every saved time by `delta` (keeps gaps and order). */
  function shiftHistory(delta) {
    record.sessions.forEach((s) => { s.start += delta; s.end += delta; });
    env.save(record);
  }

  /* Reconcile the monotonic and wall clocks; returns true if the running session has just expired. */
  function sync() {
    const last = lastSession();
    const now = env.now();
    if (monoEnd === null) {
      // Adopt a session that the saved wall-clock times say is running (after a reload, or a clock change).
      if (last && last.start <= now && now < last.end) monoEnd = env.mono() + (last.end - now);
      return false;
    }
    let monoLeft = monoEnd - env.mono();
    const wallLeft = last.end - now;
    if (wallLeft < monoLeft - DRIFT_MS) {             // slept, or clock set forward: trust the wall clock
      monoEnd = env.mono() + Math.max(0, wallLeft);
      monoLeft = Math.max(0, wallLeft);
    } else if (wallLeft > monoLeft + DRIFT_MS) {      // clock set back: trust the monotonic clock
      shiftHistory(now + Math.max(0, monoLeft) - last.end);
    }
    if (monoLeft > 0) return false;
    monoEnd = null;
    if (last.end > env.now()) shiftHistory(env.now() - last.end);   // end it now so both clocks agree it is over
    return true;
  }

  function view() {
    const v = ScreenTimePolicy.evaluate(record, env.now());
    v.remaining = 0;
    if (v.state === 'running') v.remaining = Math.max(0, monoEnd !== null ? monoEnd - env.mono() : v.active.end - v.now);
    v.problem = problem;
    v.lockReason = record.lockReason;
    return v;
  }

  function scheduleTick() {
    cancelLater(handle);
    const left = monoEnd !== null ? monoEnd - env.mono() : 0;
    const delay = left > 0 ? (left % TICK_MS) || TICK_MS : TICK_MS;   // land on whole seconds of the countdown
    handle = later(tick, Math.max(20, delay));
  }

  function tick() {
    const expired = sync();
    emit(expired ? 'expired' : 'tick');
    scheduleTick();
  }

  return {
    init() {
      const loaded = ScreenTimeRecord.clean(env.load(), env.now());
      record = loaded.record;
      problem = loaded.problem;
      if (problem) env.save(record);                  // replace the bad data by the lock
      sync();
      emit('init');
      scheduleTick();
    },

    view() { if (sync()) emit('expired'); return view(); },

    /* Start a 20-minute session, if the rules allow it right now. */
    start() {
      if (sync()) emit('expired');
      const v = view();
      if (!v.canStart) return { ok: false, reason: v.reason, view: v };
      const now = env.now();
      const next = ScreenTimeRecord.copy(record);
      next.sessions.push({ start: now, end: now + SESSION_MS, dismissed: false });
      next.sessions = ScreenTimeRecord.prune(next.sessions, now);
      if (next.lockedUntil <= now) { next.lockedUntil = 0; next.lockReason = ''; }
      // The session only exists once it is saved: otherwise a reload could grant it again.
      if (!env.save(next)) return { ok: false, reason: 'storage', view: v };
      record = next;
      problem = null;
      monoEnd = env.mono() + SESSION_MS;
      emit('start');
      scheduleTick();
      return { ok: true };
    },

    /* Dismiss the finished-session alert. This does not refund the session or change any rule. */
    dismiss() {
      const v = view();
      if (v.state !== 'alert') return { ok: false, reason: 'no-alert' };
      lastSession().dismissed = true;
      const saved = env.save(record);
      emit('dismiss');
      return { ok: true, saved };
    },

    /* Re-check now (e.g. the page became visible again). */
    refresh: tick,
  };
}
