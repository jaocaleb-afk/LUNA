'use strict';
/* ScreenTimeText: every sentence the Screen Time Timer shows or speaks, built from a ScreenTimePolicy view.
   No decisions are made here. Times of day are in the device's local time (the time the rules use),
   in 12- or 24-hour form following the Time format setting. */
const ScreenTimeText = (() => {
  const LIMIT = ScreenTimePolicy.WEEKDAY_LIMIT;
  const STATE_LABEL = {
    ready: 'Ready', running: 'Running', cooldown: 'Cooldown', alert: 'Alert', limit: 'Daily Limit Reached', blocked: 'Blocked',
  };
  const MODE = {
    weekday: 'Weekday rules (Monday to Friday)',
    weekend: 'Weekend rules (Saturday and Sunday)',
  };
  const RULES = [
    'Each session lasts exactly 20 minutes. Once started it cannot be paused, stopped, shortened or cancelled.',
    'When it ends, an alarm beeps until you press Dismiss. Dismissing stops the alarm; it does not give the session back.',
    'Weekdays: up to 4 sessions a day, with at least 10 minutes between the end of one session and the start of the next. The count resets at midnight.',
    'Weekends: no daily limit, and sessions may follow each other straight away — but after two back-to-back sessions ' +
      '(the second started less than 10 minutes after the first ended), the next must wait until 10 minutes after the second ended.',
    'This is a timer, not a lock. It cannot stop anyone using the device, and someone who can change the browser’s data, ' +
      'the device clock or LUNA’s files can get around it. It only runs while this page is open.',
  ];

  const use12h = () => Settings.get().timeFormat === '12';
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
  const words = (ms) => DurationParser.words(Math.ceil(ms / 1000));

  /* "3:10 PM", "12:00 AM tomorrow", "9:00 AM on Saturday" */
  function timeOfDay(ms, now) {
    const time = new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: use12h() });
    const day = ScreenTimePolicy.startOfDay(ms);
    if (day === ScreenTimePolicy.startOfDay(now)) return time;
    if (day === ScreenTimePolicy.nextMidnight(now)) return time + ' tomorrow';
    return time + ' on ' + new Date(ms).toLocaleDateString('en-US', { weekday: 'long' });
  }

  function used(v) {
    if (v.mode === 'weekday') return v.usedToday + ' of ' + LIMIT + ' sessions used today · ' + Math.max(0, LIMIT - v.usedToday) + ' remaining';
    return plural(v.usedToday, 'session') + ' started today · no daily limit on weekends';
  }

  const nextAt = (v) => 'The next session can start at ' + timeOfDay(v.nextStart, v.now) + '.';

  /* Why the Start button is (or is not) available. */
  function reason(v) {
    switch (v.reason) {
      case 'running': return 'Session running. It ends at ' + timeOfDay(v.active.end, v.now) + ' and cannot be paused, stopped or cancelled.';
      case 'alert': return 'This session is over. Press Dismiss to stop the alarm. Dismissing does not give the session back.';
      case 'gap': return 'A 10-minute break is required after each weekday session. ' + nextAt(v);
      case 'pair': return 'Two sessions were started back-to-back, so a 10-minute break is required. ' + nextAt(v);
      case 'limit': return 'All ' + LIMIT + ' weekday sessions have been used. The allowance resets at midnight. ' + nextAt(v);
      case 'clock': return 'The device clock is earlier than the last recorded session, so LUNA cannot tell how much time has passed. ' +
        'Check the date and time. ' + nextAt(v);
      case 'locked': return 'The saved Screen Time data could not be read or was changed, so no session can start until ' +
        timeOfDay(v.nextStart, v.now) + '. (LUNA fails safe instead of granting new sessions.)';
      default: return 'You can start a 20-minute session. Once started it cannot be paused, stopped or cancelled.';
    }
  }

  /* Big countdown and its caption. */
  function countdown(v) {
    if (v.state === 'running') return { time: fmt(v.remaining), caption: 'left in this session' };
    if (v.state === 'alert') return { time: '0:00', caption: 'session over' };
    if (v.nextStart) return { time: fmt(v.nextStart - v.now), caption: 'until the next session can start' };
    return { time: fmt(ScreenTimePolicy.SESSION_MS), caption: 'per session' };
  }

  const endsSentence = (v) => 'Your Screen Time session ends at ' + timeOfDay(v.active.end, v.now) + '.';

  /* Answer to "how much (screen) time is left?" */
  function statusSentence(v, ask) {
    if (v.state === 'running') {
      return ask === 'finish'
        ? 'Your Screen Time session ends at ' + timeOfDay(v.active.end, v.now) + ', in ' + words(v.remaining) + '.'
        : 'Your Screen Time session has ' + words(v.remaining) + ' remaining.';
    }
    if (v.state === 'alert') return 'Your Screen Time session is over. Press Dismiss on the screen.';
    if (v.state === 'ready') return 'No Screen Time session is running. You can start one now.';
    return 'No Screen Time session is running. ' + nextAt(v);
  }

  /* Why start() refused. (The Start button is hidden when not allowed, so this is mostly a race or storage.) */
  function refusal(result) {
    if (result.reason === 'storage') return 'This browser did not save the Screen Time data, so the session was not started.';
    return result.view ? reason(result.view) : 'A session cannot start right now.';
  }

  return { STATE_LABEL, MODE, RULES, timeOfDay, used, reason, countdown, endsSentence, statusSentence, refusal };
})();
