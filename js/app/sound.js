'use strict';
/* Sound: short beeps via WebAudio: the timer alarm and the "listening" chime. Both respect the Timer sound setting. */
const Sound = {
  ctx: null, chime() {
    if (!Settings.get().sound)
      return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C)
        return;
      this.ctx = this.ctx || new C();
      const c = this.ctx;
      if (c.state === 'suspended')
        c.resume();
      const o = c.createOscillator();
      const g = c.createGain();
      const t = c.currentTime;
      o.frequency.value = 660;
      g.gain.setValueAtTime(.12, t);
      g.gain.exponentialRampToValueAtTime(.001, t + .18);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + .2);
    }
    catch (e) {
    }
  }, beep() {
    if (!Settings.get().sound)
      return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C)
        return;
      this.ctx = this.ctx || new C();
      const c = this.ctx;
      for (let i = 0; i < 3; i++) {
        const o = c.createOscillator();
        const g = c.createGain();
        const t = c.currentTime + i * .5;
        o.frequency.value = 880;
        g.gain.setValueAtTime(.2, t);
        g.gain.exponentialRampToValueAtTime(.001, t + .35);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + .4);
      }
    }
    catch (e) {
    }
  }
};
