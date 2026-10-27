/* Tiny test harness shared by the core tests: test(), FakeClock, done().
   A test may be async (return a promise); async tests run one after another, after the synchronous ones.
   Sets a US time zone so the daylight-saving cases are deterministic on any machine. */
process.env.TZ = 'America/Los_Angeles';

let passed = 0, failed = 0;
let chain = Promise.resolve();

const pass = (name) => { passed++; console.log('PASS ' + name); };
const fail = (name, e) => { failed++; console.log('FAIL ' + name + '\n     ' + String((e && e.stack) || e).split('\n').slice(0, 4).join('\n     ')); };

function test(name, fn) {
  let result;
  try { result = fn(); } catch (e) { fail(name, e); return; }
  if (result && typeof result.then === 'function') {
    chain = chain.then(() => result.then(() => pass(name), (e) => fail(name, e)));
  } else pass(name);
}

/* Like test(), but the body is only started once earlier async tests have finished (so timings do not overlap). */
function testAsync(name, fn) {
  chain = chain.then(() => Promise.resolve().then(fn).then(() => pass(name), (e) => fail(name, e)));
}

/* A manual clock: now(), setTimeout(), clearTimeout(), advance(ms). Timers fire in order as time advances. */
function FakeClock() {
  let t = 0, nextId = 0;
  const queue = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => { queue.set(++nextId, { at: t + ms, fn }); return nextId; },
    clearTimeout: (h) => queue.delete(h),
    pending: () => queue.size,
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let best = null;
        for (const [id, item] of queue) if (item.at <= end && (!best || item.at < best[1].at)) best = [id, item];
        if (!best) break;
        queue.delete(best[0]);
        t = best[1].at;
        best[1].fn();
      }
      t = end;
    },
  };
}

/* Local-time Date helper: L(2026, 10, 26, 9, 0) = 26 Oct 2026, 09:00 local. */
const L = (y, mo, d, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s, 0);

/* Resolves with the number of failures once every test (including async ones) has finished. */
function done() {
  return chain.then(() => {
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    return failed;
  });
}

module.exports = { test, testAsync, FakeClock, L, done };
