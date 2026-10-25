'use strict';
/* ScheduleRunner: runs the scheduler about once a second and performs the "start timer" action.

   Conflict policy (also explained on the Schedules screen):
   - a RUNNING or PAUSED timer is never replaced: the scheduled start is skipped and logged
   - a FINISHED timer (alert showing, or waiting to be reset) is replaced by the new one
   Browser scheduling only works while this page is open and the device is awake. */
const ScheduleRunner = (() => {
  function startTimerFor(rule, due) {
    const current = TimerEngine.snapshot();

    if (current.state === 'running' || current.state === 'paused') {
      const who = current.source === 'rule' && current.label ? '“' + current.label + '”' : 'a manual timer';
      return {
        status: 'skipped',
        msg: 'Skipped: ' + who + ' was already ' + current.state + ' with ' + fmt(current.remaining) + ' left. Scheduled starts never replace an active timer.',
      };
    }

    TimerUI.dismissAlarm(); // a finished timer is being replaced
    const result = TimerEngine.start(rule.seconds * 1000, { label: rule.name, source: 'rule' });
    if (!result.ok) return { status: 'error', msg: result.msg };

    const lateMinutes = Math.round(due.lateMs / 60000);
    const late = due.lateMs > 5000 ? ' (' + (lateMinutes < 1 ? 'a few seconds' : lateMinutes + ' min') + ' late)' : '';
    return { status: 'started', msg: 'Started a ' + Schedule.durText(rule.seconds) + ' timer' + late + '.' };
  }

  const scheduler = createScheduler({
    now: () => new Date(),
    getRules: () => Rules.all(),
    saveRules: () => Rules.save(),
    log: (entry) => Rules.addLog(entry),
    fire: startTimerFor,
  });

  /* One check. Also called when the page becomes visible again (e.g. the device woke up). */
  function runTick() {
    try {
      const events = scheduler.tick();
      events.forEach((e) => Toast.show(e.rule.name + ': ' + e.msg, e.status === 'started' ? 5000 : 9000));
      if (events.length) ScheduleUI.refresh();
    } catch (e) {
      console.error('LUNA scheduler:', e);
    }
  }

  function loop() {
    runTick();
    setTimeout(loop, 1000 - (Date.now() % 1000) + 20); // aim just after each second boundary
  }

  return { start: loop, runTick };
})();
