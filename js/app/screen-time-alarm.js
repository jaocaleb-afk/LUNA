'use strict';
/* ScreenTimeAlarm: the repeating, deliberately annoying beep when a Screen Time session ends (WebAudio).

   - start() begins a loop that beeps every second until stop(). Calling start() again while it runs does
     nothing, so loops never stack up. stop() also silences beeps already scheduled, so Dismiss is immediate.
   - It does NOT follow the "Timer sound" setting: an ordinary setting must not be a way to silence this alert.
   - Browsers only play sound after the person has interacted with the page. If the alert begins without that
     (e.g. the page was reloaded during it), audio stays blocked; status() reports 'blocked', the screen says
     so, and the first tap or key press anywhere unblocks it. It can also be 'unsupported' (no WebAudio).
   The beeping needs the page to keep running: a closed tab, a sleeping device or muted speakers stop it. */
const ScreenTimeAlarm = (() => {
  const PERIOD_MS = 1000;
  const PATTERN = [[0, 1250], [0.16, 940], [0.32, 1250], [0.48, 940]];   // [seconds into the period, Hz]
  const BEEP_S = 0.12;
  const VOLUME = 0.28;

  let loop = 0;
  let ctx = null;
  let scheduled = [];
  let bursts = 0;

  function context() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try { ctx = new AudioCtx(); } catch (e) { ctx = null; }
    return ctx;
  }

  function unlock() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function burst() {
    bursts++;
    const c = context();
    if (!c) return;
    unlock();
    try {
      const t0 = c.currentTime + 0.02;
      scheduled = scheduled.filter((o) => o.endsAt > c.currentTime);
      PATTERN.forEach(([offset, hz]) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'square';
        osc.frequency.value = hz;
        gain.gain.setValueAtTime(VOLUME, t0 + offset);
        gain.gain.setValueAtTime(0, t0 + offset + BEEP_S);
        osc.connect(gain).connect(c.destination);
        osc.start(t0 + offset);
        osc.stop(t0 + offset + BEEP_S);
        osc.endsAt = t0 + offset + BEEP_S;
        scheduled.push(osc);
      });
    } catch (e) { /* audio output unavailable: the visible alert remains */ }
  }

  return {
    start() {
      if (loop) return;
      burst();
      loop = setInterval(burst, PERIOD_MS);
    },

    stop() {
      clearInterval(loop);
      loop = 0;
      scheduled.forEach((osc) => { try { osc.stop(); } catch (e) { /* already stopped */ } });
      scheduled = [];
    },

    isRunning: () => !!loop,
    bursts: () => bursts,                      // for tests: how many beep groups have been played

    /* 'unsupported' | 'blocked' | 'playing' | 'off' */
    status() {
      if (!loop) return 'off';
      if (!(window.AudioContext || window.webkitAudioContext) || !ctx) return 'unsupported';
      return ctx.state === 'running' ? 'playing' : 'blocked';
    },

    init() {
      ['pointerdown', 'keydown', 'touchstart'].forEach((type) => addEventListener(type, unlock, { capture: true, passive: true }));
    },
  };
})();
