const a = require('assert');
const { test, L } = require('./harness');
const { Schedule, createScheduler } = require('./load');

const mk = (override, armedAt) => Schedule.make(
  Object.assign({ name: 'Morning timer', time: '09:00', seconds: 120, repeat: 'daily', days: [], enabled: true }, override),
  armedAt.getTime());
const started = () => ({ status: 'started', msg: 'ok' });

/* Builds a scheduler whose clock you control through `clock.t`, and counts how often the action ran. */
function harnessFor(rules, nowDate, fire) {
  const state = { t: nowDate, fired: 0, saved: 0, log: [] };
  const scheduler = createScheduler({
    now: () => state.t,
    getRules: () => rules,
    saveRules: () => { state.saved++; },
    log: (e) => state.log.push(e),
    fire: fire || (() => { state.fired++; return started(); }),
  });
  return { state, tick: scheduler.tick };
}

test('scheduler: 120 ticks within the same scheduled minute fire exactly once', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  const { state, tick } = harnessFor([r], L(2026, 10, 26, 9, 0, 0));
  for (let i = 0; i < 120; i++) { state.t = new Date(L(2026, 10, 26, 9, 0, 0).getTime() + i * 500); tick(); }
  a.strictEqual(state.fired, 1);
});

test('scheduler: runs again the next day and records the result', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  const { state, tick } = harnessFor([r], L(2026, 10, 26, 9, 0));
  tick();
  state.t = L(2026, 10, 27, 9, 0, 1);
  tick();
  a.strictEqual(state.fired, 2);
  a.strictEqual(r.lastResult.status, 'started');
});

test('scheduler: a one-time rule runs once then turns itself off', () => {
  const r = mk({ repeat: 'once' }, L(2026, 10, 26, 8, 0));
  const { state, tick } = harnessFor([r], L(2026, 10, 26, 9, 0, 2));
  tick(); tick();
  a.strictEqual(state.fired, 1);
  a.strictEqual(r.enabled, false);
});

test('scheduler: a skipped result is recorded and claimed, not retried every second', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  let calls = 0;
  const { state, tick } = harnessFor([r], L(2026, 10, 26, 9, 0), () => { calls++; return { status: 'skipped', msg: 'Skipped: another timer is running.' }; });
  tick();
  state.t = L(2026, 10, 26, 9, 0, 5);
  tick();
  a.strictEqual(calls, 1);
  a.strictEqual(r.lastResult.status, 'skipped');
  a.strictEqual(state.log.length, 1);
});

test('scheduler: a throwing action is recorded as an error and does not crash the loop', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  const { tick } = harnessFor([r], L(2026, 10, 26, 9, 0), () => { throw new Error('boom'); });
  const original = console.error;
  console.error = () => {};
  try { tick(); } finally { console.error = original; }
  a.strictEqual(r.lastResult.status, 'error');
});

test('scheduler: the claim is saved BEFORE the action runs', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  let keyWhenFired = null;
  const { tick } = harnessFor([r], L(2026, 10, 26, 9, 0), () => { keyWhenFired = r.lastKey; return started(); });
  tick();
  a.strictEqual(keyWhenFired, '2026-10-26 09:00');
});

test('scheduler: device asleep until 9:40 is "missed" (timer NOT started); until 9:03 starts late', () => {
  let r = mk({}, L(2026, 10, 26, 8, 0));
  let h = harnessFor([r], L(2026, 10, 26, 9, 40));
  h.tick();
  a.strictEqual(h.state.fired, 0);
  a.strictEqual(r.lastResult.status, 'missed');
  a.ok(/Missed/.test(r.lastResult.msg));

  r = mk({}, L(2026, 10, 26, 8, 0));
  h = harnessFor([r], L(2026, 10, 26, 9, 3));
  h.tick();
  a.strictEqual(h.state.fired, 1);
});

test('scheduler: the "missed" message reads cleanly for whole hours and mixed durations', () => {
  const msg = (lateAt) => {
    const r = mk({}, L(2026, 10, 26, 7, 0));
    harnessFor([r], lateAt).tick();
    return r.lastResult.msg;
  };
  a.ok(msg(L(2026, 10, 26, 13, 0)).includes('due 4 h ago'), msg(L(2026, 10, 26, 13, 0)));
  a.ok(msg(L(2026, 10, 26, 10, 29)).includes('due 1 h 29 min ago'), msg(L(2026, 10, 26, 10, 29)));
  a.ok(msg(L(2026, 10, 26, 9, 40)).includes('due 40 min ago'), msg(L(2026, 10, 26, 9, 40)));
});

test('scheduler: page closed for days reports only the latest miss (no burst of timers)', () => {
  const r = mk({}, L(2026, 10, 23, 8, 0));
  const { state, tick } = harnessFor([r], L(2026, 10, 26, 12, 0));
  tick();
  a.strictEqual(state.fired, 0);
  a.strictEqual(state.log.length, 1);
  a.strictEqual(state.log[0].status, 'missed');
});

test('scheduler: a clock set backwards does not wedge the rule', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  r.armedAt = L(2026, 10, 30, 0, 0).getTime();
  const { tick } = harnessFor([r], L(2026, 10, 26, 9, 0, 0));
  tick();
  a.ok(r.armedAt <= L(2026, 10, 26, 9, 0).getTime());
});

test('scheduler: after a reload the same occurrence does not fire again', () => {
  const r = mk({}, L(2026, 10, 26, 8, 0));
  harnessFor([r], L(2026, 10, 26, 9, 0)).tick();
  const reloaded = Schedule.clean(JSON.parse(JSON.stringify(r)));
  const h = harnessFor([reloaded], L(2026, 10, 26, 9, 0, 30));
  h.tick();
  a.strictEqual(h.state.fired, 0);
});
