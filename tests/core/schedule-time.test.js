const a = require('assert');
const { test, L } = require('./harness');
const { Schedule } = require('./load');

const mk = (override, armedAt) => Schedule.make(
  Object.assign({ name: 'Morning timer', time: '09:00', seconds: 120, repeat: 'daily', days: [], enabled: true }, override),
  armedAt.getTime());

// ---- nextRun ----
test('nextRun: daily - later today, otherwise tomorrow', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  a.strictEqual(+Schedule.nextRun(r, L(2026, 10, 26, 8, 30)), +L(2026, 10, 26, 9, 0));
  a.strictEqual(+Schedule.nextRun(r, L(2026, 10, 26, 9, 0, 0)), +L(2026, 10, 27, 9, 0), 'at exactly 9:00:00 the next run is tomorrow');
  a.strictEqual(+Schedule.nextRun(r, L(2026, 10, 26, 9, 0, 1)), +L(2026, 10, 27, 9, 0));
});

test('nextRun: selected days wrap weeks and months', () => {
  const r = mk({ repeat: 'days', days: [1, 3] }, L(2026, 10, 24, 12, 0)); // Mon + Wed; 24 Oct 2026 is a Saturday
  a.strictEqual(+Schedule.nextRun(r, L(2026, 10, 24, 12, 0)), +L(2026, 10, 26, 9, 0));
  a.strictEqual(+Schedule.nextRun(r, L(2026, 10, 26, 9, 30)), +L(2026, 10, 28, 9, 0));
  a.strictEqual(+Schedule.nextRun(r, L(2026, 10, 28, 9, 30)), +L(2026, 11, 2, 9, 0), 'wraps into the next month');
});

test('nextRun: disabled is null; a one-time rule is null once it has run', () => {
  const off = Object.assign(mk({}, L(2026, 10, 24)), { enabled: false });
  a.strictEqual(Schedule.nextRun(off, L(2026, 10, 24)), null);
  const once = mk({ repeat: 'once' }, L(2026, 10, 24, 8, 0));
  a.strictEqual(+Schedule.nextRun(once, L(2026, 10, 24, 8, 5)), +L(2026, 10, 24, 9, 0));
  once.lastKey = '2026-10-24 09:00';
  a.strictEqual(Schedule.nextRun(once, L(2026, 10, 24, 9, 5)), null);
});

test('nextRun: a one-time rule created after its time today runs tomorrow', () => {
  const once = mk({ repeat: 'once' }, L(2026, 10, 24, 10, 0));
  a.strictEqual(+Schedule.nextRun(once, L(2026, 10, 24, 10, 0)), +L(2026, 10, 25, 9, 0));
});

// ---- due: simulated times, no waiting for 9 AM ----
test('due: fires at 9:00:00 and not before', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  a.strictEqual(Schedule.due(r, L(2026, 10, 26, 8, 59, 59)), null);
  const d = Schedule.due(r, L(2026, 10, 26, 9, 0, 0));
  a.strictEqual(d.type, 'fire');
  a.strictEqual(d.key, '2026-10-26 09:00');
});

test('due: a rule created after today\'s time waits for tomorrow instead of firing', () => {
  const r = mk({}, L(2026, 10, 26, 9, 3));
  a.strictEqual(Schedule.due(r, L(2026, 10, 26, 9, 3, 1)), null);
  a.strictEqual(Schedule.due(r, L(2026, 10, 26, 12, 0)), null, 'and it is not reported as "missed" either');
  a.strictEqual(Schedule.due(r, L(2026, 10, 27, 9, 0, 0)).type, 'fire');
});

test('due: late within the grace window fires; beyond it is "missed"', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  a.strictEqual(Schedule.due(r, L(2026, 10, 26, 9, 4, 59)).type, 'fire');
  a.strictEqual(Schedule.due(r, L(2026, 10, 26, 9, 5, 1)).type, 'missed');
  const missed = Schedule.due(r, L(2026, 10, 26, 13, 0));
  a.strictEqual(missed.type, 'missed');
  a.ok(missed.lateMs > 3.9 * 3600e3);
});

test('due: only the selected weekdays fire', () => {
  const r = mk({ repeat: 'days', days: [1] }, L(2026, 10, 24, 8, 0)); // Mondays
  a.strictEqual(Schedule.due(r, L(2026, 10, 25, 9, 0)), null);
  a.strictEqual(Schedule.due(r, L(2026, 10, 26, 9, 0)).type, 'fire');
});

test('due: disabled never fires; lastKey blocks a refire; editing the time re-arms the same day', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  r.enabled = false;
  a.strictEqual(Schedule.due(r, L(2026, 10, 26, 9, 0)), null);
  r.enabled = true;

  const d = Schedule.due(r, L(2026, 10, 26, 9, 0));
  r.lastKey = d.key;
  a.strictEqual(Schedule.due(r, L(2026, 10, 26, 9, 0, 30)), null);

  r.time = '09:30';
  r.armedAt = L(2026, 10, 26, 9, 5).getTime();
  a.strictEqual(Schedule.due(r, L(2026, 10, 26, 9, 30)).type, 'fire');
});

test('due: midnight rollover (rule at 23:59, device woke at 00:01)', () => {
  const r = mk({ time: '23:59' }, L(2026, 10, 26, 20, 0));
  const d = Schedule.due(r, L(2026, 10, 27, 0, 1));
  a.strictEqual(d.type, 'fire');
  a.strictEqual(d.key, '2026-10-26 23:59');
});

// ---- daylight saving (time zone is America/Los_Angeles, set in harness.js) ----
test('DST spring-forward: 02:30 does not exist on 2026-03-08 and fires once at the shifted time', () => {
  const r = mk({ time: '02:30' }, L(2026, 3, 7, 12, 0));
  a.strictEqual(Schedule.due(r, L(2026, 3, 8, 1, 59, 59)), null);
  const d = Schedule.due(r, L(2026, 3, 8, 3, 30, 0));
  a.strictEqual(d.type, 'fire');
  a.strictEqual(d.key, '2026-03-08 02:30');
});

test('DST fall-back: 01:30 happens twice on 2026-11-01 but is still one occurrence', () => {
  const r = mk({ time: '01:30' }, L(2026, 10, 31, 12, 0));
  const first = new Date(L(2026, 11, 1, 1, 30).getTime());
  const second = new Date(first.getTime() + 3600e3);
  const d = Schedule.due(r, first);
  a.strictEqual(d.type, 'fire');
  r.lastKey = d.key;
  a.strictEqual(Schedule.due(r, second), null, 'the repeated 01:30 must not fire again');
});
