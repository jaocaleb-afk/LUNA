const a = require('assert');
const { test, L } = require('./harness');
const { ScreenTimeRecord: R, ScreenTimePolicy: P } = require('./load');

const NOW = L(2026, 10, 26, 12, 0).getTime();
const session = (start, dismissed = true) => ({ start, end: start + P.SESSION_MS, dismissed });
const good = () => ({ v: 1, sessions: [session(NOW - 3 * 3600e3), session(NOW - 3600e3, false)], lockedUntil: 0, lockReason: '' });
const cleaned = (value) => R.clean({ status: 'ok', value }, NOW);

test('screen time record: valid data is accepted as-is (and copied, not shared)', () => {
  const value = good();
  const r = cleaned(value);
  a.strictEqual(r.problem, null);
  a.deepStrictEqual(r.record, value);
  a.notStrictEqual(r.record.sessions[0], value.sessions[0]);
});

test('screen time record: missing data is a normal first run with a full allowance', () => {
  const r = R.clean({ status: 'missing' }, NOW);
  a.strictEqual(r.problem, null);
  a.deepStrictEqual(r.record, R.empty());
});

test('screen time record: corrupt or edited data never grants sessions: it locks until midnight', () => {
  const midnight = L(2026, 10, 27, 0, 0).getTime();
  const variants = {
    unparseable: { status: 'unreadable' },
    'not an object': { status: 'ok', value: 'hello' },
    'wrong version': { status: 'ok', value: Object.assign(good(), { v: 2 }) },
    'extra field': { status: 'ok', value: Object.assign(good(), { bonus: 3 }) },
    'sessions not a list': { status: 'ok', value: Object.assign(good(), { sessions: {} }) },
    'shortened session': { status: 'ok', value: Object.assign(good(), { sessions: [{ start: NOW - 3600e3, end: NOW - 3500e3, dismissed: true }] }) },
    'text instead of a number': { status: 'ok', value: Object.assign(good(), { sessions: [{ start: String(NOW), end: NOW + P.SESSION_MS, dismissed: true }] }) },
    'overlapping sessions': { status: 'ok', value: Object.assign(good(), { sessions: [session(NOW - 3600e3), session(NOW - 3000e3)] }) },
    'unsorted sessions': { status: 'ok', value: Object.assign(good(), { sessions: [session(NOW - 3600e3), session(NOW - 9 * 3600e3)] }) },
    'old session still alerting': { status: 'ok', value: Object.assign(good(), { sessions: [session(NOW - 9 * 3600e3, false), session(NOW - 3600e3)] }) },
    'absurd lock': { status: 'ok', value: Object.assign(good(), { lockedUntil: NOW + 30 * 24 * 3600e3, lockReason: 'corrupt' }) },
    'negative lock': { status: 'ok', value: Object.assign(good(), { lockedUntil: -1 }) },
    'unknown lock reason': { status: 'ok', value: Object.assign(good(), { lockReason: 'parent override' }) },
    'extra session field': { status: 'ok', value: Object.assign(good(), { sessions: [Object.assign(session(NOW - 3600e3), { refund: true })] }) },
    'too many sessions': { status: 'ok', value: Object.assign(good(), { sessions: Array.from({ length: 301 }, (_, i) => session(NOW - (400 - i) * 3600e3)) }) },
  };
  for (const [name, loaded] of Object.entries(variants)) {
    const r = R.clean(loaded, NOW);
    a.strictEqual(r.problem, 'corrupt', name);
    a.strictEqual(r.record.lockedUntil, midnight, name + ': locked until the next local midnight');
    a.strictEqual(r.record.lockReason, 'corrupt', name);
    const v = P.evaluate(r.record, NOW);
    a.ok(!v.canStart, name + ': no session can start');
  }
});

test('screen time record: pruning keeps what the rules need', () => {
  const old = [session(NOW - 5 * 24 * 3600e3), session(NOW - 4 * 24 * 3600e3), session(NOW - 3600e3)];
  a.deepStrictEqual(R.prune(old, NOW), [old[1], old[2]], 'drops old history but always keeps the newest two');
  const recent = [session(NOW - 20 * 3600e3), session(NOW - 10 * 3600e3), session(NOW - 3600e3)];
  a.deepStrictEqual(R.prune(recent, NOW), recent);
  a.deepStrictEqual(R.prune([session(NOW - 9 * 24 * 3600e3)], NOW).length, 1);
});
