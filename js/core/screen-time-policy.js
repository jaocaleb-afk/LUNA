/* ScreenTimePolicy: the Screen Time Timer's rules, as pure functions of (saved sessions, current time). No DOM.

   Every session lasts exactly SESSION_MS (20 min). All times are wall-clock milliseconds; "day" means the
   device's LOCAL calendar day, and the daily count resets at local midnight (00:00), not 24 h after a session.

   WEEKDAYS (Mon–Fri)
     - at most WEEKDAY_LIMIT (4) sessions STARTED on the current local day;
     - a new session may start only once GAP_MS (10 min) have passed since the previous session ENDED
       (exactly at end + 10:00 is allowed). The gap also applies across midnight: a session that ends at
       11:55 PM gives the new day its 4 sessions at midnight, and the first may start at 12:05 AM.
   WEEKENDS (Sat–Sun)
     - no daily limit;
     - a session is "back-to-back" when it starts less than 10 min after the previous session ENDED.
       After a back-to-back pair, the next session must wait until 10 min after the second one ended.
       Starting exactly 10:00 after the end is NOT back-to-back, so that session begins a new pair.
       (The brief's wording "less than 10 minutes after the previous session STARTED" can never happen, because
       sessions last 20 min and cannot overlap; its worked example — 10:00 start, 10:20 start, then a wait —
       matches the "after it ended" reading, which is what this implements.)
   ALWAYS
     - nothing can start while a session runs, or while the finished-session alert has not been dismissed;
     - a session that crosses midnight runs its full 20 minutes and counts for the day it STARTED;
     - which rules apply (weekday/weekend) is decided by the day it is NOW;
     - if the clock reads earlier than the last session's start (clock moved back), starting is blocked
       until the clock passes that session's end + 10 min, rather than guessing;
     - a record locked after corrupt data (lockedUntil) blocks starting until then.

   evaluate(record, now) -> {
     mode: 'weekday'|'weekend', state: 'ready'|'running'|'alert'|'cooldown'|'limit'|'blocked',
     reason: null|'running'|'alert'|'gap'|'pair'|'limit'|'clock'|'locked', canStart, nextStart (ms|null),
     active (the running session or null), last, usedToday, limit (4|null), backToBack }                      */
const ScreenTimePolicy = (() => {
  const MINUTE = 60000;
  const SESSION_MS = 20 * MINUTE;
  const GAP_MS = 10 * MINUTE;
  const WEEKDAY_LIMIT = 4;

  const isWeekend = (ms) => { const day = new Date(ms).getDay(); return day === 0 || day === 6; };
  const modeAt = (ms) => (isWeekend(ms) ? 'weekend' : 'weekday');
  function startOfDay(ms) { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function nextMidnight(ms) { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); }

  function startedOnSameDay(sessions, ms) {
    const from = startOfDay(ms);
    const to = nextMidnight(ms);
    return sessions.filter((s) => s.start >= from && s.start < to).length;
  }

  /* Weekend rule: did the latest session start less than GAP_MS after the one before it ended? */
  function lastWasBackToBack(sessions) {
    const n = sessions.length;
    return n >= 2 && sessions[n - 1].start - sessions[n - 2].end < GAP_MS;
  }

  /* Earliest time the gap rules of `mode` allow after the latest session. */
  function gapReadyAt(sessions, mode) {
    const last = sessions[sessions.length - 1];
    if (!last) return 0;
    return mode === 'weekday' || lastWasBackToBack(sessions) ? last.end + GAP_MS : last.end;
  }

  /* Like gapReadyAt, but if the wait runs past midnight the NEXT day's rules decide (e.g. Friday night -> Saturday). */
  function gapReadyFrom(sessions, now) {
    const today = gapReadyAt(sessions, modeAt(now));
    const midnight = nextMidnight(now);
    return today > midnight ? Math.max(midnight, gapReadyAt(sessions, modeAt(midnight))) : today;
  }

  function evaluate(record, now) {
    const sessions = record.sessions;
    const last = sessions[sessions.length - 1] || null;
    const mode = modeAt(now);
    const view = {
      mode, now, last, active: null, canStart: false, nextStart: null,
      usedToday: startedOnSameDay(sessions, now),
      limit: mode === 'weekday' ? WEEKDAY_LIMIT : null,
      backToBack: lastWasBackToBack(sessions),
    };
    const result = (state, reason, nextStart) => Object.assign(view, { state, reason, nextStart: nextStart || null });

    if (last && last.start > now) return result('blocked', 'clock', last.end + GAP_MS);
    if (last && now < last.end) { view.active = last; return result('running', 'running'); }
    if (last && !last.dismissed) return result('alert', 'alert');
    if (record.lockedUntil > now) return result('blocked', 'locked', record.lockedUntil);

    if (mode === 'weekday' && view.usedToday >= WEEKDAY_LIMIT) {
      const midnight = nextMidnight(now);
      return result('limit', 'limit', Math.max(midnight, gapReadyAt(sessions, modeAt(midnight))));
    }
    const readyAt = gapReadyFrom(sessions, now);
    if (now < readyAt) return result('cooldown', mode === 'weekday' ? 'gap' : 'pair', readyAt);

    view.canStart = true;
    return result('ready', null);
  }

  return { SESSION_MS, GAP_MS, WEEKDAY_LIMIT, evaluate, isWeekend, nextMidnight, startOfDay };
})();
