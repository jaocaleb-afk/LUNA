/* createScheduler: one "tick" checks every rule and runs the ones that are due.
   The app calls tick() about once a second (and when the page wakes up).

   env = {
     now()            -> Date
     getRules()       -> the live array of rules (mutated in place)
     saveRules()      -> persist them
     fire(rule, due)  -> {status:'started'|'skipped'|'error', msg}   (performs the action)
     log(entry)       -> optional activity log
   }
   Safety rules implemented here:
   - The occurrence is CLAIMED (lastKey saved) BEFORE the action runs, so it can never run twice.
   - A throwing action is caught and recorded as an error; it never stops the loop.
   - Occurrences missed for too long are recorded as "missed" and are NOT started. */
function createScheduler(env) {
  /* 40 -> "40 min", 120 -> "2 h", 89 -> "1 h 29 min" */
  const minutesText = (m) => (m < 60 ? m + ' min' : (Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '')).trim());

  function runOne(rule, due, nowMs) {
    if (due.type === 'missed') {
      const mins = Math.max(1, Math.round(due.lateMs / 60000));
      return { status: 'missed', msg: 'Missed: due ' + minutesText(mins) + ' ago while LUNA was closed, asleep or busy. Not started.' };
    }
    try {
      return env.fire(rule, due);
    } catch (e) {
      console.error(e);
      return { status: 'error', msg: 'Could not start the timer.' };
    }
  }

  function tick() {
    const now = env.now();
    const nowMs = now.getTime();
    const rules = env.getRules();
    const events = [];
    let unsaved = false;

    for (const rule of rules) {
      // The device clock was set backwards (e.g. a Pi correcting its time after boot): re-arm the rule.
      if (rule.armedAt > nowMs + 1000) { rule.armedAt = nowMs; unsaved = true; }

      const due = Schedule.due(rule, now);
      if (!due) continue;

      rule.lastKey = due.key;                       // claim first...
      if (rule.repeat === 'once') rule.enabled = false;
      env.saveRules();                              // ...and persist the claim before doing anything
      unsaved = false;

      const result = runOne(rule, due, nowMs);
      rule.lastResult = { status: result.status, at: nowMs, msg: result.msg };
      if (env.log) env.log({ at: nowMs, rule: rule.name, status: result.status, msg: result.msg });
      events.push({ rule, status: result.status, msg: result.msg });
      unsaved = true;
    }
    if (unsaved) env.saveRules();
    return events;
  }

  return { tick };
}
