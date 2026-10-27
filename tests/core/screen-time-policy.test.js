const a = require('assert');
const { test, L } = require('./harness');
const { ScreenTimePolicy: P } = require('./load');

const MIN = 60000;
const at = (...args) => L(...args).getTime();
const session = (startMs, dismissed = true) => ({ start: startMs, end: startMs + P.SESSION_MS, dismissed });
const rec = (...sessions) => ({ v: 1, sessions, lockedUntil: 0, lockReason: '' });
const evalAt = (record, ms) => P.evaluate(record, ms);

// 2026-10-26 is a Monday; 2026-10-30 Friday; 2026-10-31 Saturday; 2026-11-01 Sunday.

test('screen time policy: Monday to Friday use weekday rules; Saturday and Sunday weekend rules', () => {
  [26, 27, 28, 29, 30].forEach((d) => a.strictEqual(evalAt(rec(), at(2026, 10, d, 12)).mode, 'weekday', 'Oct ' + d));
  [31].forEach((d) => a.strictEqual(evalAt(rec(), at(2026, 10, d, 12)).mode, 'weekend'));
  a.strictEqual(evalAt(rec(), at(2026, 11, 1, 12)).mode, 'weekend');
  a.strictEqual(evalAt(rec(), at(2026, 10, 26, 12)).limit, 4);
  a.strictEqual(evalAt(rec(), at(2026, 10, 31, 12)).limit, null);
});

test('screen time policy: nothing can start while a session runs, or before its alert is dismissed', () => {
  const s = session(at(2026, 10, 26, 15, 0), false);
  const running = evalAt(rec(s), at(2026, 10, 26, 15, 19, 59));
  a.strictEqual(running.state, 'running');
  a.ok(!running.canStart);
  a.strictEqual(running.active, s);
  const alert = evalAt(rec(s), at(2026, 10, 26, 15, 40));
  a.strictEqual(alert.state, 'alert', 'the alert stays until dismissed, even long after the end');
  a.ok(!alert.canStart);
});

test('screen time policy: weekday 10-minute gap after the session ENDS, eligible exactly at the boundary', () => {
  const record = rec(session(at(2026, 10, 26, 14, 40)));              // ends 15:00
  const cooling = evalAt(record, at(2026, 10, 26, 15, 9, 59));
  a.strictEqual(cooling.state, 'cooldown');
  a.strictEqual(cooling.reason, 'gap');
  a.strictEqual(cooling.nextStart, at(2026, 10, 26, 15, 10), 'finishes 3:00 PM -> next at 3:10 PM');
  a.ok(!cooling.canStart);
  const boundary = evalAt(record, at(2026, 10, 26, 15, 10));
  a.ok(boundary.canStart, 'exactly 10:00 after the end is allowed');
  a.strictEqual(boundary.state, 'ready');
});

test('screen time policy: the fifth weekday session is blocked until local midnight', () => {
  const day = [9, 10, 11, 12].map((h) => session(at(2026, 10, 27, h)));
  const used3 = evalAt(rec(...day.slice(0, 3)), at(2026, 10, 27, 11, 50));
  a.strictEqual(used3.usedToday, 3);
  a.ok(used3.canStart);
  const full = evalAt(rec(...day), at(2026, 10, 27, 18));
  a.strictEqual(full.state, 'limit');
  a.strictEqual(full.usedToday, 4);
  a.ok(!full.canStart);
  a.strictEqual(full.nextStart, at(2026, 10, 28, 0, 0), 'next local midnight');
  a.strictEqual(evalAt(rec(...day), at(2026, 10, 27, 23, 59, 59)).state, 'limit');
  const nextDay = evalAt(rec(...day), at(2026, 10, 28, 0, 0));
  a.ok(nextDay.canStart, 'resets AT local midnight, not 24 h after the first session');
  a.strictEqual(nextDay.usedToday, 0);
});

test('screen time policy: a session crossing midnight counts for the day it started; the gap still applies', () => {
  const late = session(at(2026, 10, 27, 23, 50));                  // ends 00:10 on the 28th
  a.strictEqual(evalAt(rec(late), at(2026, 10, 28, 0, 5)).state, 'running', 'still running after midnight');
  const after = evalAt(rec(late), at(2026, 10, 28, 0, 15));
  a.strictEqual(after.usedToday, 0, 'counted for the 27th');
  a.strictEqual(after.state, 'cooldown');
  a.strictEqual(after.nextStart, at(2026, 10, 28, 0, 20));
  // The brief's example: four sessions, the last finishing 11:55 PM -> the new allowance arrives at midnight,
  // and (gap rule) the first new session can start at 12:05 AM.
  const day = [at(2026, 10, 27, 9), at(2026, 10, 27, 10), at(2026, 10, 27, 11), at(2026, 10, 27, 23, 35)].map((t) => session(t));
  const before = evalAt(rec(...day), at(2026, 10, 27, 23, 58));
  a.strictEqual(before.state, 'limit');
  a.strictEqual(before.nextStart, at(2026, 10, 28, 0, 5));
  a.strictEqual(evalAt(rec(...day), at(2026, 10, 28, 0, 1)).state, 'cooldown');
  a.ok(evalAt(rec(...day), at(2026, 10, 28, 0, 5)).canStart);
});

test('screen time policy: weekend sessions may start back-to-back, then a cooldown (the brief\'s example)', () => {
  const s1 = session(at(2026, 10, 31, 10, 0));                     // 10:00 - 10:20
  const afterFirst = evalAt(rec(s1), at(2026, 10, 31, 10, 20));
  a.ok(afterFirst.canStart, 'session 2 can start immediately at 10:20');
  const s2 = session(at(2026, 10, 31, 10, 20));                    // 10:20 - 10:40, back-to-back
  const afterSecond = evalAt(rec(s1, s2), at(2026, 10, 31, 10, 40));
  a.ok(afterSecond.backToBack);
  a.strictEqual(afterSecond.state, 'cooldown');
  a.strictEqual(afterSecond.reason, 'pair');
  a.strictEqual(afterSecond.nextStart, at(2026, 10, 31, 10, 50));
  a.ok(!evalAt(rec(s1, s2), at(2026, 10, 31, 10, 49, 59)).canStart);
  a.ok(evalAt(rec(s1, s2), at(2026, 10, 31, 10, 50)).canStart, 'allowed exactly 10:00 after the second one ended');
  // A session started exactly at the boundary is NOT back-to-back, so the one after it may follow immediately ...
  const s3 = session(at(2026, 10, 31, 10, 50));
  const afterThird = evalAt(rec(s1, s2, s3), at(2026, 10, 31, 11, 10));
  a.ok(!afterThird.backToBack);
  a.ok(afterThird.canStart);
  // ... and that pair then needs its own cooldown: the rule keeps applying.
  const s4 = session(at(2026, 10, 31, 11, 10));
  const afterFourth = evalAt(rec(s1, s2, s3, s4), at(2026, 10, 31, 11, 30));
  a.strictEqual(afterFourth.state, 'cooldown');
  a.strictEqual(afterFourth.nextStart, at(2026, 10, 31, 11, 40));
});

test('screen time policy: "back-to-back" means started less than 10 min after the previous one ended', () => {
  const s1 = session(at(2026, 11, 1, 9, 0));                       // ends 9:20
  const nineMinLater = session(at(2026, 11, 1, 9, 29, 59));
  a.ok(evalAt(rec(s1, nineMinLater), at(2026, 11, 1, 9, 50)).backToBack);
  const tenMinLater = session(at(2026, 11, 1, 9, 30));
  a.ok(!evalAt(rec(s1, tenMinLater), at(2026, 11, 1, 9, 50)).backToBack);
  a.ok(evalAt(rec(s1, tenMinLater), at(2026, 11, 1, 9, 50)).canStart);
});

test('screen time policy: weekends have no four-session cap', () => {
  const sessions = [];
  let t = at(2026, 10, 31, 8, 0);
  for (let i = 0; i < 8; i++) { sessions.push(session(t)); t += P.SESSION_MS + 10 * MIN; }
  const v = evalAt(rec(...sessions), t);
  a.strictEqual(v.usedToday, 8);
  a.ok(v.canStart, 'eight sessions on a Saturday and still allowed');
});

test('screen time policy: Friday night -> Saturday uses the new day\'s rules; Sunday -> Monday the weekday gap', () => {
  const friLate = session(at(2026, 10, 30, 23, 35));               // ends 23:55 Friday
  const fri = evalAt(rec(friLate), at(2026, 10, 30, 23, 58));
  a.strictEqual(fri.state, 'cooldown');
  a.strictEqual(fri.nextStart, at(2026, 10, 31, 0, 0), 'weekend rules start at midnight (no pair yet)');
  a.ok(evalAt(rec(friLate), at(2026, 10, 31, 0, 0)).canStart);
  const sun = [session(at(2026, 11, 1, 23, 0)), session(at(2026, 11, 1, 23, 25))];   // second ends 23:45
  const mon = evalAt(rec(...sun), at(2026, 11, 2, 0, 0));
  a.strictEqual(mon.mode, 'weekday');
  a.strictEqual(mon.usedToday, 0);
  a.ok(mon.canStart, 'Monday 00:00 is 15 min after the last end');
});

test('screen time policy: a clock earlier than the last session blocks starting instead of guessing', () => {
  const s = session(at(2026, 10, 26, 15, 0));
  const v = evalAt(rec(s), at(2026, 10, 26, 14, 0));
  a.strictEqual(v.state, 'blocked');
  a.strictEqual(v.reason, 'clock');
  a.ok(!v.canStart);
  a.strictEqual(v.nextStart, s.end + P.GAP_MS);
});

test('screen time policy: a lock from corrupt data blocks starting until it expires', () => {
  const record = Object.assign(rec(), { lockedUntil: at(2026, 10, 27, 0, 0), lockReason: 'corrupt' });
  const v = evalAt(record, at(2026, 10, 26, 12));
  a.strictEqual(v.state, 'blocked');
  a.strictEqual(v.reason, 'locked');
  a.ok(!v.canStart);
  a.ok(evalAt(record, at(2026, 10, 27, 0, 0)).canStart);
});

test('screen time policy: midnight follows the local calendar across daylight-saving changes', () => {
  a.strictEqual(P.nextMidnight(at(2026, 11, 1, 0, 30)), at(2026, 11, 2, 0, 0), 'the 25-hour day (DST ends Nov 1)');
  a.strictEqual(P.nextMidnight(at(2026, 3, 8, 12)), at(2026, 3, 9, 0, 0), 'the 23-hour day (DST starts Mar 8)');
});
