/* createIdle: "has the user been inactive for N seconds?"
   env = {delay(): ms (0 = never), onIdle(), onActive(), setTimeout?, clearTimeout?}

   - touch()       call on every user interaction: leaves idle (once) and restarts the countdown
   - hold(k, on)   while any hold is set (e.g. an open dialog) the countdown does not run
   - reconfigure() call after the delay setting changes
   onActive fires only on the idle -> active edge, never repeatedly, so the UI cannot flicker. */
function createIdle(env) {
  const later = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const cancelLater = env.clearTimeout || ((h) => clearTimeout(h));
  const holds = new Set();
  let idle = false;
  let handle = null;

  function arm() {
    cancelLater(handle);
    handle = null;
    const ms = env.delay();
    if (!ms || holds.size) return;
    handle = later(() => {
      handle = null;
      if (holds.size) return;
      idle = true;
      env.onIdle();
    }, ms);
  }

  return {
    touch() {
      const wasIdle = idle;
      idle = false;
      if (wasIdle) env.onActive();
      arm();
    },
    hold(key, on) {
      if (on) holds.add(key); else holds.delete(key);
      arm();
    },
    reconfigure: arm,
    isIdle: () => idle,
  };
}
