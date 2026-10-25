'use strict';
/* ScheduleFormat: turns rule data into the words shown on the Schedules screen. No DOM access. */
const ScheduleFormat = (() => {
  const use12h = () => Settings.get().timeFormat === '12';

  /* '09:00' -> '9:00 AM' (or '09:00' in 24-hour mode) */
  function clockText(time) {
    const [h, m] = time.split(':').map(Number);
    if (!use12h()) return time;
    return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  const dateTimeText = (date) => date.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: use12h(),
  });

  const shortTimeText = (ms) => new Date(ms).toLocaleString('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: use12h(),
  });

  function relativeText(ms) {
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return 'in under a minute';
    if (minutes < 60) return 'in ' + minutes + ' min';
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return 'in ' + hours + ' h' + (minutes % 60 ? ' ' + (minutes % 60) + ' min' : '');
    return 'in ' + Math.round(hours / 24) + ' days';
  }

  function nextRunText(rule) {
    if (!rule.enabled) return rule.repeat === 'once' && rule.lastKey ? 'Finished (one-time rule)' : 'Disabled — will not run';
    const next = Schedule.nextRun(rule, new Date());
    return next ? 'Next run: ' + dateTimeText(next) + ' (' + relativeText(next - Date.now()) + ')' : 'No upcoming run';
  }

  return { clockText, dateTimeText, shortTimeText, relativeText, nextRunText };
})();
