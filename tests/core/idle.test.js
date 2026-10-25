const a = require('assert');
const { test, FakeClock } = require('./harness');
const { createIdle } = require('./load');

function makeIdle(ms) {
  const clock = FakeClock(), events = [];
  let delay = ms;
  const idle = createIdle({
    delay: () => delay,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    onIdle: () => events.push('idle'), onActive: () => events.push('active'),
  });
  return { clock, idle, events, setDelay: (d) => { delay = d; idle.reconfigure(); } };
}

test('idle: goes idle after the timeout and active again on touch', () => {
  const { clock, idle, events } = makeIdle(5000);
  idle.touch();
  clock.advance(4999);
  a.deepStrictEqual(events, []);
  clock.advance(2);
  a.deepStrictEqual(events, ['idle']);
  a.ok(idle.isIdle());
  idle.touch();
  a.deepStrictEqual(events, ['idle', 'active']);
  a.ok(!idle.isIdle());
});

test('idle: every interaction resets the countdown', () => {
  const { clock, idle, events } = makeIdle(5000);
  idle.touch();
  for (let i = 0; i < 10; i++) { clock.advance(4000); idle.touch(); }
  a.deepStrictEqual(events, []);
  clock.advance(5001);
  a.deepStrictEqual(events, ['idle']);
});

test('idle: touching while already active never emits "active" (nothing can flash)', () => {
  const { clock, idle, events } = makeIdle(5000);
  for (let i = 0; i < 50; i++) { idle.touch(); clock.advance(10); }
  a.deepStrictEqual(events, []);
});

test('idle: no repeat events while idle and no leaked timers', () => {
  const { clock, idle, events } = makeIdle(1000);
  idle.touch();
  clock.advance(10000);
  a.deepStrictEqual(events, ['idle']);
  a.strictEqual(clock.pending(), 0);
});

test('idle: "never" (0) never idles; changing the timeout applies immediately', () => {
  const { clock, idle, events, setDelay } = makeIdle(0);
  idle.touch();
  clock.advance(1e7);
  a.deepStrictEqual(events, []);
  setDelay(2000);
  clock.advance(2001);
  a.deepStrictEqual(events, ['idle']);
});

test('idle: a hold (e.g. an open dialog) postpones idling until released', () => {
  const { clock, idle, events } = makeIdle(1000);
  idle.touch();
  idle.hold('dialog', true);
  clock.advance(60000);
  a.deepStrictEqual(events, []);
  idle.hold('dialog', false);
  clock.advance(1001);
  a.deepStrictEqual(events, ['idle']);
});
