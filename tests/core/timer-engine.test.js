const a = require('assert');
const { test, FakeClock } = require('./harness');
const { createTimerEngine } = require('./load');

function makeEngine() {
  const clock = FakeClock(), events = [];
  const engine = createTimerEngine({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  engine.subscribe((snap, kind) => events.push(kind));
  return { clock, engine, events };
}

test('timer: idle > running > paused > running > done > ready > cancel', () => {
  const { clock, engine, events } = makeEngine();
  a.strictEqual(engine.snapshot().state, 'idle');

  a.ok(engine.start(10000).ok);
  a.strictEqual(engine.snapshot().state, 'running');
  clock.advance(3000);
  a.ok(Math.abs(engine.snapshot().remaining - 7000) <= 1);

  a.ok(engine.pause().ok);
  a.strictEqual(engine.snapshot().state, 'paused');
  clock.advance(60000);
  a.ok(Math.abs(engine.snapshot().remaining - 7000) <= 1, 'paused time must not drain');

  a.ok(engine.resume().ok);
  clock.advance(6999);
  a.strictEqual(engine.snapshot().state, 'running');
  clock.advance(2);
  a.strictEqual(engine.snapshot().state, 'done');
  a.strictEqual(engine.snapshot().remaining, 0);
  a.strictEqual(events.filter((e) => e === 'done').length, 1, 'done fires exactly once');

  a.ok(engine.reset().ok);
  a.strictEqual(engine.snapshot().state, 'ready');
  a.strictEqual(engine.snapshot().remaining, 10000);
  a.ok(engine.startReady().ok);
  a.strictEqual(engine.snapshot().state, 'running');

  a.ok(engine.cancel().ok);
  a.strictEqual(engine.snapshot().state, 'idle');
  a.strictEqual(clock.pending(), 0, 'no leaked timers');
});

test('timer: illegal transitions are rejected with messages', () => {
  const { engine } = makeEngine();
  for (const op of ['pause', 'resume', 'reset', 'cancel']) a.ok(!engine[op]().ok, op + ' on idle');
  a.ok(!engine.start(500).ok);
  a.ok(!engine.start(NaN).ok);
  a.ok(!engine.start(864e5 + 1).ok);

  a.ok(engine.start(5000).ok);
  a.ok(!engine.start(5000).ok, 'cannot overwrite a running timer');
  a.ok(!engine.resume().ok);
  engine.pause();
  a.ok(!engine.start(5000).ok, 'cannot overwrite a paused timer');
  a.ok(!engine.pause().ok);
});

test('timer: label/source are recorded and cleared', () => {
  const { engine } = makeEngine();
  engine.start(2000, { label: 'Morning timer', source: 'rule' });
  a.strictEqual(engine.snapshot().label, 'Morning timer');
  a.strictEqual(engine.snapshot().source, 'rule');
  engine.reset();
  engine.startReady();
  a.strictEqual(engine.snapshot().label, 'Morning timer', 'label survives reset and restart');
  engine.cancel();
  a.strictEqual(engine.snapshot().label, '');
  a.strictEqual(engine.snapshot().source, 'manual');
});

test('timer: a finished timer can be replaced by a new one', () => {
  const { clock, engine } = makeEngine();
  engine.start(1000);
  clock.advance(1200);
  a.strictEqual(engine.snapshot().state, 'done');
  a.ok(engine.start(2000).ok);
});
