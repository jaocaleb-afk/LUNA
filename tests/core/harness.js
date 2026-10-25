/* Tiny test harness shared by the core tests: test(), FakeClock, summary().
   Sets a US time zone so the daylight-saving cases are deterministic on any machine. */
process.env.TZ = 'America/Los_Angeles';

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).split('\n').slice(0, 4).join('\n     ')); }
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

function summary() {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  return failed;
}

module.exports = { test, FakeClock, L, summary };
