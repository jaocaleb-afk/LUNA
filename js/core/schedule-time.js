/* ScheduleTime: calendar maths for schedule rules, in the DEVICE'S LOCAL time zone.
   A rule looks like {time:'09:00', repeat:'once'|'daily'|'days', days:[0-6], armedAt:ms, lastKey:'...'}.

   Key ideas
   - An "occurrence" is one concrete run: a local date + the rule's HH:MM. Its key is "YYYY-MM-DD HH:MM".
   - armedAt: the moment the rule was created/edited/enabled. Only occurrences AFTER it can run, so a rule
     made at 9:03 for "9:00" waits until tomorrow instead of firing instantly.
   - lastKey: the key of the occurrence that last ran (or was missed). An occurrence never runs twice.
   - Occurrences are compared as instants, not "same minute" strings, so a late check still works. */
const ScheduleTime = (() => {
  const GRACE_MS = 5 * 60 * 1000; // a run discovered up to 5 minutes late still starts; later than that is "missed"
  const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

  const pad = (n) => String(n).padStart(2, '0');

  function parseTime(text) {
    const m = TIME_RE.exec(text);
    return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
  }

  function appliesOnWeekday(rule, weekday) {
    return rule.repeat === 'days' ? rule.days.includes(weekday) : true;
  }

  /* The occurrence on the calendar day `offset` days from `base` (negative = past), or null if the rule
     does not run that weekday. On the DST "spring forward" day a nonexistent time (02:30) lands an hour later. */
  function occurrenceOnDay(rule, base, offset) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    if (!appliesOnWeekday(rule, day.getDay())) return null;
    const t = parseTime(rule.time);
    return {
      date: new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.h, t.m, 0, 0),
      key: day.getFullYear() + '-' + pad(day.getMonth() + 1) + '-' + pad(day.getDate()) + ' ' + rule.time,
    };
  }

  /* A one-time rule runs at the first occurrence after it was armed. */
  function onceOccurrence(rule, armedAt) {
    const armed = new Date(armedAt);
    for (let offset = 0; offset <= 1; offset++) {
      const occ = occurrenceOnDay(rule, armed, offset);
      if (occ && occ.date.getTime() > armedAt) return occ;
    }
    return null;
  }

  /* When will this rule next run after `now`? Returns a Date, or null (disabled / already finished). */
  function nextRun(rule, now) {
    if (!rule.enabled) return null;
    const nowMs = now.getTime();
    if (rule.repeat === 'once') {
      const occ = onceOccurrence(rule, rule.armedAt || nowMs);
      return occ && occ.key !== rule.lastKey ? occ.date : null;
    }
    const armed = Math.min(rule.armedAt || 0, nowMs);
    for (let offset = 0; offset <= 8; offset++) {
      const occ = occurrenceOnDay(rule, now, offset);
      if (occ && occ.date.getTime() > nowMs && occ.date.getTime() > armed) return occ.date;
    }
    return null;
  }

  /* Is a run due right now? Returns null, or {type:'fire'|'missed', date, key, lateMs}.
     'fire'   = due now (or up to GRACE_MS late, e.g. the device just woke up)
     'missed' = the time passed while LUNA was closed/asleep for longer than the grace window */
  function due(rule, now, graceMs) {
    const grace = graceMs == null ? GRACE_MS : graceMs;
    if (!rule.enabled) return null;
    const nowMs = now.getTime();
    const armed = Math.min(rule.armedAt || 0, nowMs); // a clock set backwards never blocks a rule forever

    let occ = null;
    if (rule.repeat === 'once') {
      occ = onceOccurrence(rule, rule.armedAt || nowMs);
    } else {
      // look at today, yesterday, the day before: enough to cover a device that slept through midnight
      for (let back = 0; back <= 2 && !occ; back++) {
        const candidate = occurrenceOnDay(rule, now, -back);
        if (candidate && candidate.date.getTime() <= nowMs) occ = candidate;
      }
    }
    if (!occ) return null;

    const t = occ.date.getTime();
    if (t <= armed || t > nowMs || occ.key === rule.lastKey) return null;
    const lateMs = nowMs - t;
    return { type: lateMs <= grace ? 'fire' : 'missed', date: occ.date, key: occ.key, lateMs };
  }

  return { GRACE_MS, parseTime, nextRun, due };
})();
