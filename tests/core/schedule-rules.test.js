const a = require('assert');
const { test, L } = require('./harness');
const { Schedule } = require('./load');

const rule = (o) => Object.assign({ name: 'Morning timer', time: '09:00', action: 'timer.start', seconds: 120, repeat: 'daily', days: [], enabled: true }, o);

test('validate: a complete rule is valid', () => {
  a.ok(Schedule.validate(rule()).ok);
});

test('validate: each invalid field gives a useful message', () => {
  const cases = [
    [{ name: '' }, /name/i], [{ name: '   ' }, /name/i], [{ name: 'x'.repeat(41) }, /40/],
    [{ time: '' }, /time/i], [{ time: '25:00' }, /time/i], [{ time: '9:00' }, /time/i],
    [{ seconds: 0 }, /duration/i], [{ seconds: 86401 }, /duration/i], [{ seconds: 1.5 }, /duration/i], [{ seconds: '120' }, /duration/i],
    [{ action: 'reboot' }, /action/i],
    [{ repeat: 'weekly' }, /repeat|often/i],
    [{ repeat: 'days', days: [] }, /day/i], [{ repeat: 'days', days: [7] }, /day/i], [{ repeat: 'days' }, /day/i],
  ];
  for (const [override, pattern] of cases) {
    const v = Schedule.validate(rule(override));
    a.ok(!v.ok, JSON.stringify(override));
    a.ok(v.errors.some((m) => pattern.test(m)), JSON.stringify(override) + ' -> ' + v.errors);
  }
  a.ok(!Schedule.validate(null).ok);
  a.ok(!Schedule.validate({}).ok);
});

test('validate: warns about same-time and overlapping rules, but not unrelated ones', () => {
  const other = Object.assign(Schedule.make(rule({ name: 'A' }), 0), { id: 'a' });

  let v = Schedule.validate(rule({ name: 'B', id: 'b' }), [other]);
  a.ok(v.ok);
  a.ok(v.warnings.length === 1 && /same time/.test(v.warnings[0]));

  v = Schedule.validate(rule({ name: 'B', id: 'b', time: '09:01' }), [other]);
  a.ok(v.warnings.length === 1 && /overlap/.test(v.warnings[0]));

  v = Schedule.validate(rule({ name: 'B', id: 'b', time: '10:00' }), [other]);
  a.strictEqual(v.warnings.length, 0);

  v = Schedule.validate(rule({ name: 'B', id: 'b', repeat: 'days', days: [6] }), [Object.assign({}, other, { repeat: 'days', days: [1] })]);
  a.strictEqual(v.warnings.length, 0, 'different weekdays never clash');

  v = Schedule.validate(rule({ id: 'a' }), [other]);
  a.strictEqual(v.warnings.length, 0, 'a rule does not clash with itself');
});

test('persistence: JSON round-trip keeps rules and lastKey; corrupt entries are dropped', () => {
  const r = Schedule.make(rule({ name: 'Keep', repeat: 'days', days: [5, 1, 1] }), L(2026, 10, 24, 8).getTime());
  r.lastKey = '2026-10-26 09:00';
  r.lastResult = { status: 'started', at: 5, msg: 'ok' };
  const stored = JSON.parse(JSON.stringify([
    r,
    { id: 'bad', name: '', time: '99:99' },
    null,
    'x',
    { id: 'c', name: 'c', time: '09:00', action: 'timer.start', seconds: -5, repeat: 'daily' },
  ]));
  const back = stored.map(Schedule.clean).filter(Boolean);
  a.strictEqual(back.length, 1);
  a.deepStrictEqual(back[0].days, [1, 5]);
  a.strictEqual(back[0].lastKey, '2026-10-26 09:00');
  a.strictEqual(back[0].lastResult.status, 'started');
  a.strictEqual(back[0].enabled, true);

  const odd = Schedule.clean({ id: 'z', name: 'z', time: '09:00', action: 'timer.start', seconds: 60, repeat: 'daily', enabled: 'yes' });
  a.strictEqual(odd.enabled, false, 'a non-boolean "enabled" is not trusted');
});

test('repeatText and durText', () => {
  const text = (o) => Schedule.repeatText(Object.assign({ repeat: 'days', days: [] }, o));
  a.strictEqual(text({ repeat: 'daily' }), 'Every day');
  a.strictEqual(text({ days: [1, 2, 3, 4, 5] }), 'Weekdays');
  a.strictEqual(text({ days: [0, 6] }), 'Weekends');
  a.strictEqual(text({ days: [1, 3] }), 'Mon, Wed');
  a.strictEqual(text({ repeat: 'once' }), 'Once');
  a.strictEqual(Schedule.durText(120), '2 min');
  a.strictEqual(Schedule.durText(5430), '1 h 30 min 30 sec');
});
