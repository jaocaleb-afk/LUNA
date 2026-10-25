/* Schedule: what a schedule rule IS, how to check one, and how to describe it in words.

   Rule: {id, name, time:'HH:MM', action:'timer.start', seconds, repeat:'once'|'daily'|'days',
          days:[0-6 (Sun=0)], enabled, armedAt, lastKey, lastResult}
   Time maths lives in schedule-time.js; the loop that runs rules lives in scheduler.js. */
const Schedule = (() => {
  const MAX_RULES = 20;
  const MAX_SECONDS = 86400;
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const REPEATS = ['once', 'daily', 'days'];
  const RESULT_STATUSES = ['started', 'skipped', 'missed', 'error'];

  const daysOf = (rule) => (rule.repeat === 'days' ? rule.days : [0, 1, 2, 3, 4, 5, 6]);
  const minutesOfDay = (time) => { const t = ScheduleTime.parseTime(time); return t.h * 60 + t.m; };

  function fieldErrors(rule) {
    const errors = [];
    const name = typeof rule.name === 'string' ? rule.name.trim() : '';
    if (!name) errors.push('Give the rule a name, for example “Morning timer”.');
    else if (name.length > 40) errors.push('Keep the name under 40 characters.');

    if (!ScheduleTime.parseTime(rule.time || '')) errors.push('Choose a start time.');
    if (rule.action !== 'timer.start') errors.push('Choose an action. Only “Start timer” is available.');
    if (!Number.isInteger(rule.seconds) || rule.seconds < 1 || rule.seconds > MAX_SECONDS) {
      errors.push('Set a duration between 1 second and 24 hours.');
    }
    if (!REPEATS.includes(rule.repeat)) {
      errors.push('Choose how often the rule repeats.');
    } else if (rule.repeat === 'days') {
      const d = rule.days;
      const bad = !Array.isArray(d) || !d.length || d.some((x) => !Number.isInteger(x) || x < 0 || x > 6);
      if (bad) errors.push('Pick at least one day of the week.');
    }
    return errors;
  }

  /* Warn (not block) when two enabled rules would collide. Only one timer can run at a time. */
  function collisionWarnings(rule, others) {
    const warnings = [];
    const start = minutesOfDay(rule.time);
    const end = start + Math.ceil(rule.seconds / 60);
    for (const other of others) {
      if (!other || other.id === rule.id || !other.enabled || !ScheduleTime.parseTime(other.time)) continue;
      if (!daysOf(other).some((d) => daysOf(rule).includes(d))) continue;
      const oStart = minutesOfDay(other.time);
      const oEnd = oStart + Math.ceil(other.seconds / 60);
      if (start === oStart) {
        warnings.push('“' + other.name + '” starts at the same time. Only one timer can run at once, so one of them will be skipped.');
      } else if ((oStart > start && oStart < end) || (start > oStart && start < oEnd)) {
        warnings.push('This overlaps with “' + other.name + '”. Only one timer runs at a time, so the later start is skipped while the earlier timer is still running.');
      }
    }
    return warnings;
  }

  /* validate(rule, otherRules?) -> {ok, errors[], warnings[]} */
  function validate(rule, others) {
    rule = rule || {};
    const errors = fieldErrors(rule);
    const warnings = !errors.length && Array.isArray(others) && rule.enabled !== false
      ? collisionWarnings(rule, others) : [];
    return { ok: !errors.length, errors, warnings };
  }

  /* Build a new rule from validated form fields. `nowMs` arms it. */
  function make(fields, nowMs) {
    return {
      id: fields.id || 'r' + Math.floor(nowMs).toString(36) + Math.random().toString(36).slice(2, 6),
      name: String(fields.name || '').trim(),
      time: fields.time,
      action: 'timer.start',
      seconds: fields.seconds,
      repeat: fields.repeat,
      days: fields.repeat === 'days' ? [...new Set(fields.days)].sort((a, b) => a - b) : [],
      enabled: fields.enabled !== false,
      armedAt: nowMs,
      lastKey: '',
      lastResult: null,
    };
  }

  /* Sanitise one rule read back from storage. Returns null if unusable. Never trusts stored data. */
  function clean(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const rule = {
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : null,
      name: typeof raw.name === 'string' ? raw.name : '',
      time: raw.time,
      action: raw.action,
      seconds: raw.seconds,
      repeat: raw.repeat,
      days: Array.isArray(raw.days) ? raw.days : [],
      enabled: raw.enabled === true,
      armedAt: Number.isFinite(raw.armedAt) ? raw.armedAt : 0,
      lastKey: typeof raw.lastKey === 'string' ? raw.lastKey.slice(0, 30) : '',
      lastResult: null,
    };
    if (!rule.id || !validate(rule).ok) return null;
    const r = raw.lastResult;
    if (r && typeof r === 'object' && RESULT_STATUSES.includes(r.status)) {
      rule.lastResult = { status: r.status, at: Number(r.at) || 0, msg: String(r.msg || '').slice(0, 200) };
    }
    return rule;
  }

  function repeatText(rule) {
    if (rule.repeat === 'once') return 'Once';
    if (rule.repeat === 'daily') return 'Every day';
    const days = rule.days.slice().sort();
    if (days.length === 7) return 'Every day';
    if (days.join() === '1,2,3,4,5') return 'Weekdays';
    if (days.join() === '0,6') return 'Weekends';
    return days.map((d) => DAY[d]).join(', ');
  }

  function durText(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h && h + ' h', m && m + ' min', s && s + ' sec'].filter(Boolean).join(' ');
  }

  return {
    MAX_RULES, DAY, validate, make, clean, repeatText, durText,
    nextRun: ScheduleTime.nextRun,
    due: ScheduleTime.due,
  };
})();
