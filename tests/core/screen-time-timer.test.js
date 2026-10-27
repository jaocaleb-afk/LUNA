const a = require('assert');
const { test, FakeClock, L } = require('./harness');
const { createScreenTimeTimer, ScreenTimePolicy: P, createTimerEngine } = require('./load');

const MIN = 60000;

/* A device: a fake clock that drives timers, a wall clock (can be set, or skip ahead in "sleep"), a monotonic clock,
   and a storage slot holding exactly what localStorage would (JSON text). */
function device(startDate, options = {}) {
  const clock = FakeClock();
  let wallOffset = startDate.getTime();
  let monoOffset = 0;
  let saved = options.saved === undefined ? null : options.saved;
  let saveWorks = true;
  const events = [];
  const env = {
    now: () => clock.now() + wallOffset,
    mono: () => clock.now() + monoOffset,
    load: () => (saved === null ? { status: 'missing' } : (() => { try { return { status: 'ok', value: JSON.parse(saved) }; } catch (e) { return { status: 'unreadable' }; } })()),
    save: (record) => { if (!saveWorks) return false; saved = JSON.stringify(record); return true; },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onChange: (view, kind) => events.push(kind),
  };
  const make = () => { const t = createScreenTimeTimer(env); t.init(); return t; };
  return {
    clock, env, events, make,
    advance: (ms) => clock.advance(ms),
    setWall: (ms) => { wallOffset += ms; },                     // someone changes the device clock
    sleep: (ms) => { wallOffset += ms; monoOffset -= ms; },     // device asleep: wall moves, monotonic does not
    saved: () => saved && JSON.parse(saved),
    breakStorage: () => { saveWorks = false; },
  };
}

test('screen time timer: has no pause, stop, cancel, reset or shorten operation at all', () => {
  const timer = device(L(2026, 10, 26, 9)).make();
  a.deepStrictEqual(Object.keys(timer).sort(), ['dismiss', 'init', 'refresh', 'start', 'view']);
});

test('screen time timer: every session lasts exactly 20 minutes; delayed callbacks do not change it', () => {
  const d = device(L(2026, 10, 26, 9));
  const timer = d.make();
  a.ok(timer.start().ok);
  a.strictEqual(timer.view().remaining, 20 * MIN);
  // Simulate a throttled background tab: the next timer callback runs 7 minutes late.
  d.clock.advance(0);
  const pending = d.clock.pending();
  a.ok(pending >= 1);
  d.advance(7 * MIN + 123);
  a.strictEqual(timer.view().remaining, 13 * MIN - 123, 'remaining time comes from the clock, not from counting ticks');
  d.advance(13 * MIN - 124);
  a.strictEqual(timer.view().state, 'running');
  d.advance(1);
  a.strictEqual(timer.view().state, 'alert', 'ends at exactly 20:00');
  a.ok(d.events.includes('expired'));
  const s = d.saved().sessions[0];
  a.strictEqual(s.end - s.start, P.SESSION_MS);
});

test('screen time timer: no session can start during an active session, the alert, or the cooldown', () => {
  const d = device(L(2026, 10, 26, 9));
  const timer = d.make();
  a.ok(timer.start().ok);
  a.deepStrictEqual([timer.start().ok, timer.start().reason], [false, 'running']);
  d.advance(20 * MIN);
  a.deepStrictEqual([timer.start().ok, timer.start().reason], [false, 'alert']);
  a.ok(timer.dismiss().ok);
  a.deepStrictEqual([timer.start().ok, timer.start().reason], [false, 'gap']);
  d.advance(10 * MIN - 1);
  a.ok(!timer.start().ok);
  d.advance(1);
  a.ok(timer.start().ok, 'eligible exactly at the 10-minute boundary');
});

test('screen time timer: the alert stays until Dismiss; dismissing refunds nothing', () => {
  const d = device(L(2026, 10, 27, 8));
  const timer = d.make();
  for (let i = 0; i < 4; i++) {
    a.ok(timer.start().ok, 'session ' + (i + 1));
    d.advance(20 * MIN);
    d.advance(3 * 3600e3);                                       // nobody dismisses for 3 hours
    a.strictEqual(timer.view().state, 'alert', 'still alerting hours later');
    a.strictEqual(timer.view().usedToday, i + 1);
    timer.dismiss();
    a.strictEqual(timer.view().usedToday, i + 1, 'dismissing does not give the session back');
  }
  a.strictEqual(timer.view().state, 'limit');
  a.strictEqual(timer.start().reason, 'limit', 'the fifth weekday session is blocked');
  a.ok(!timer.dismiss().ok, 'Dismiss does nothing when there is no alert');
});

test('screen time timer: reload recovers a running session from storage (no restart from 20:00)', () => {
  const d = device(L(2026, 10, 26, 9));
  d.make().start();
  d.advance(7 * MIN);
  const reloaded = d.make();                                     // new page, same storage
  a.strictEqual(reloaded.view().state, 'running');
  a.strictEqual(reloaded.view().remaining, 13 * MIN);
  a.ok(!reloaded.start().ok, 'a reload does not allow a second session');
  d.advance(13 * MIN);
  a.strictEqual(reloaded.view().state, 'alert');
});

test('screen time timer: a session that expired while the page was closed shows the alert on reopen', () => {
  const d = device(L(2026, 10, 26, 9));
  d.make().start();
  d.advance(45 * MIN);                                           // page closed meanwhile
  const reopened = d.make();
  a.strictEqual(reopened.view().state, 'alert');
  a.strictEqual(reopened.view().usedToday, 1);
  reopened.dismiss();
  a.strictEqual(d.make().view().state, 'ready', 'a dismissal is saved too (the gap had already passed)');
});

test('screen time timer: an active session crossing midnight runs its full 20 minutes', () => {
  const d = device(L(2026, 10, 27, 23, 50));
  const timer = d.make();
  timer.start();
  d.advance(15 * MIN);                                           // 00:05 on the 28th
  const v = timer.view();
  a.strictEqual(v.state, 'running');
  a.strictEqual(v.remaining, 5 * MIN);
  a.strictEqual(v.usedToday, 0, 'the new day already has its allowance');
  d.advance(5 * MIN);
  a.strictEqual(timer.view().state, 'alert');
});

test('screen time timer: the allowance resets at local midnight while the page stays open', () => {
  const d = device(L(2026, 10, 27, 20, 0));
  const timer = d.make();
  for (let i = 0; i < 4; i++) { timer.start(); d.advance(20 * MIN); timer.dismiss(); d.advance(10 * MIN); }
  a.strictEqual(timer.view().state, 'limit');
  d.advance(L(2026, 10, 28, 0, 0) - d.env.now() - 1);
  a.strictEqual(timer.view().state, 'limit');
  d.advance(1);
  a.ok(timer.view().canStart, 'available at 00:00 local');
  a.ok(timer.start().ok);
});

test('screen time timer: weekend back-to-back tracking survives a reload', () => {
  const d = device(L(2026, 10, 31, 10, 0));
  let timer = d.make();
  timer.start(); d.advance(20 * MIN); timer.dismiss();
  a.ok(timer.start().ok, 'second session straight away on a Saturday');
  d.advance(20 * MIN);
  timer = d.make();                                              // reload during the alert
  a.strictEqual(timer.view().state, 'alert');
  timer.dismiss();
  timer = d.make();                                              // and again during the cooldown
  a.strictEqual(timer.view().state, 'cooldown');
  a.strictEqual(timer.view().reason, 'pair');
  a.strictEqual(timer.view().nextStart, L(2026, 10, 31, 10, 50).getTime());
  d.advance(10 * MIN);
  a.ok(timer.start().ok);
});

test('screen time timer: corrupt saved data does not grant sessions', () => {
  const d = device(L(2026, 10, 26, 9), { saved: '{"v":1,"sessions":"lots"}' });
  const timer = d.make();
  const v = timer.view();
  a.strictEqual(v.state, 'blocked');
  a.strictEqual(v.problem, 'corrupt');
  a.ok(!timer.start().ok);
  a.strictEqual(d.saved().lockedUntil, L(2026, 10, 27, 0, 0).getTime(), 'the lock is saved, so a reload keeps it');
  a.strictEqual(d.make().view().state, 'blocked');
  const broken = device(L(2026, 10, 26, 9), { saved: '{not json' }).make();
  a.ok(!broken.start().ok);
});

test('screen time timer: if the browser will not save, the session is not started', () => {
  const d = device(L(2026, 10, 26, 9));
  const timer = d.make();
  d.breakStorage();
  const r = timer.start();
  a.deepStrictEqual([r.ok, r.reason], [false, 'storage']);
  a.strictEqual(timer.view().state, 'ready');
});

test('screen time timer: moving the clock back mid-session does not lengthen it', () => {
  const d = device(L(2026, 10, 26, 15, 0));
  const timer = d.make();
  timer.start();
  d.advance(5 * MIN);
  d.setWall(-60 * MIN);                                          // someone sets the clock back an hour
  d.advance(1000);
  a.strictEqual(timer.view().remaining, 15 * MIN - 1000);
  d.advance(15 * MIN - 1000);
  a.strictEqual(timer.view().state, 'alert', 'ends after 20 real minutes, not 80');
  const s = d.saved().sessions[0];
  a.strictEqual(s.end, d.env.now(), 'saved times follow the new clock, so later rules use it');
  a.strictEqual(s.end - s.start, P.SESSION_MS);
});

test('screen time timer: device sleep (wall clock moves, monotonic clock paused) is caught up', () => {
  const d = device(L(2026, 10, 26, 15, 0));
  const timer = d.make();
  timer.start();
  d.advance(5 * MIN);
  d.sleep(30 * MIN);
  d.advance(1000);
  a.strictEqual(timer.view().state, 'alert', '35 real minutes passed: the session is over');
  a.strictEqual(d.saved().sessions[0].start, L(2026, 10, 26, 15, 0).getTime(), 'original times kept');
  const short = device(L(2026, 10, 26, 15, 0));
  const t2 = short.make();
  t2.start();
  short.advance(5 * MIN);
  short.sleep(10 * MIN);
  short.advance(1000);
  a.strictEqual(t2.view().remaining, 5 * MIN - 1000, 'a short sleep: the countdown jumps to the real remaining time');
});

test('screen time timer: a clock set before the last session (after a reload) blocks rather than guesses', () => {
  const d = device(L(2026, 10, 26, 15, 0));
  d.make().start();
  d.advance(30 * MIN);
  d.setWall(-2 * 3600e3);
  const v = d.make().view();
  a.strictEqual(v.state, 'blocked');
  a.strictEqual(v.reason, 'clock');
});

test('screen time timer: the ordinary timer is a separate object; cancelling it leaves Screen Time running', () => {
  const d = device(L(2026, 10, 26, 9));
  const screenTime = d.make();
  const ordinary = createTimerEngine({ now: d.env.mono, setTimeout: d.clock.setTimeout, clearTimeout: d.clock.clearTimeout });
  screenTime.start();
  ordinary.start(5 * MIN);
  d.advance(MIN);
  a.ok(ordinary.pause().ok);
  a.ok(ordinary.reset().ok);
  a.ok(ordinary.cancel().ok);
  a.strictEqual(screenTime.view().state, 'running');
  a.strictEqual(screenTime.view().remaining, 19 * MIN);
});
