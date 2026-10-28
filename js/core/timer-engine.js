/* TimerEngine: one countdown timer as a small state machine.

     idle --start--> running <--pause/resume--> paused
                        |
                      (time up)
                        v
                       done --reset--> ready --start--> running
     cancel from any state --> idle

   `createTimerEngine(env)` lets tests inject a fake clock; `TimerEngine` is the real one. */
function createTimerEngine(env) {
  env = env || {};
  const now = env.now || (() => performance.now());
  const later = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const cancelLater = env.clearTimeout || ((h) => clearTimeout(h));

  let state = 'idle';
  let duration = 0;     // ms the timer was started with
  let remaining = 0;    // ms left while paused / ready
  let deadline = 0;     // now() value at which a running timer ends
  let handle = null;
  let label = '';       // who started it, e.g. a schedule's name
  let source = 'manual'; // 'manual' | 'rule'
  const subscribers = new Set();

  const msLeft = () => (state === 'running' ? Math.max(0, deadline - now()) : remaining);
  const snapshot = () => ({ state, duration, remaining: msLeft(), label, source });
  const emit = (kind) => subscribers.forEach((fn) => {
    try { fn(snapshot(), kind); } catch (e) { console.error(e); }
  });
  const rejected = (msg) => ({ ok: false, msg });
  const accepted = (msg) => ({ ok: true, msg });

  function scheduleTick() {
    cancelLater(handle);
    if (state !== 'running') return;
    handle = later(tick, Math.max(0, Math.min(250, deadline - now())));
  }

  function tick() {
    if (state !== 'running') return;
    if (deadline - now() <= 0) {
      state = 'done';
      remaining = 0;
      emit('done');
      emit('tick');
    } else {
      emit('tick');
      scheduleTick();
    }
  }

  const api = {
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    snapshot,
    refresh() { if (state === 'running') tick(); }, // call after the page becomes visible again

    /* start(ms, {label, source}) */
    start(ms, opts) {
      ms = Number(ms);
      if (!Number.isFinite(ms) || ms < 1000) return rejected('Enter a duration of at least 1 second.');
      if (ms > 864e5) return rejected('Timers can be up to 24 hours.');
      if (state === 'running' || state === 'paused') {
        return rejected('A timer is already running. Cancel or reset it first.');
      }
      duration = remaining = Math.round(ms);
      deadline = now() + remaining;
      state = 'running';
      label = opts && opts.label ? String(opts.label) : '';
      source = (opts && opts.source) || 'manual';
      scheduleTick();
      emit('start');
      return accepted('Timer started.');
    },

    pause() {
      if (state !== 'running') return rejected('No timer is running.');
      remaining = msLeft();
      state = 'paused';
      cancelLater(handle);
      emit('pause');
      return accepted('Timer paused.');
    },

    resume() {
      if (state !== 'paused') return rejected('There’s no paused timer to resume.');
      deadline = now() + remaining;
      state = 'running';
      scheduleTick();
      emit('resume');
      return accepted('Timer resumed.');
    },

    reset() {
      if (!duration) return rejected('There’s no timer to reset.');
      cancelLater(handle);
      state = 'ready';
      remaining = duration;
      emit('reset');
      return accepted('Timer reset.');
    },

    cancel() {
      if (state === 'idle') return rejected('There’s no timer to cancel.');
      cancelLater(handle);
      state = 'idle';
      duration = remaining = 0;
      label = '';
      source = 'manual';
      emit('cancel');
      return accepted('Timer cancelled.');
    },

    startReady() {
      if (state !== 'ready') return rejected('Nothing ready.');
      const again = { label, source };
      const ms = duration;
      state = 'idle';
      return api.start(ms, again);
    },
  };
  return api;
}

const TimerEngine = createTimerEngine();
