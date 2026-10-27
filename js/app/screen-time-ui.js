'use strict';
/* ScreenTimeUI: the Screen Time screen, its home-screen readout (#stbadge) and the end-of-session alert (#stalert).

   The rules and timekeeping live in core (screen-time-policy.js, screen-time-timer.js). This file draws their
   state and offers exactly two buttons:
     Start    (#ststart)    shown ONLY when a session may legally begin
     Dismiss  (#stdismiss)  shown ONLY while the finished-session alert is active; it stops the alarm, nothing else
   There are deliberately no pause, stop, cancel, reset or override controls, shortcuts or settings.
   The ordinary Timer screen and its buttons talk to TimerEngine only and cannot reach this timer. */
const ScreenTimeUI = (() => {
  let timer = null;
  let alertWasShown = false;

  function renderScreen(v) {
    const count = ScreenTimeText.countdown(v);
    setText($('#stmode'), ScreenTimeText.MODE[v.mode]);
    setText($('#stst'), ScreenTimeText.STATE_LABEL[v.state]);
    $('#stst').dataset.state = v.state;
    setText($('#std'), count.time);
    setText($('#stdl'), count.caption);
    setText($('#stused'), ScreenTimeText.used(v));
    setText($('#stwhy'), ScreenTimeText.reason(v));
    $('#ststart').hidden = !v.canStart;
  }

  function renderBadge(v) {
    const badge = $('#stbadge');
    badge.hidden = v.state !== 'running';
    if (!badge.hidden) setText($('#stbt'), fmt(v.remaining));
  }

  function renderAlert(v) {
    const on = v.state === 'alert';
    const el = $('#stalert');
    el.hidden = !on;
    if (on !== alertWasShown) Idle.hold('screen-time-alert', on);   // only on change: hold() restarts the idle countdown
    if (on) ScreenTimeAlarm.start(); else ScreenTimeAlarm.stop();

    const sound = ScreenTimeAlarm.status();
    const note = sound === 'blocked' ? 'The browser is blocking the alarm sound until the screen is tapped.'
      : sound === 'unsupported' ? 'This browser cannot play the alarm sound; only this screen shows the alert.' : '';
    setText($('#stsound'), note);
    $('#stsound').hidden = !note;

    if (on && !alertWasShown) {
      setText($('#stad'), 'The 20-minute session that started at ' + ScreenTimeText.timeOfDay(v.last.start, v.now) +
        ' has ended. Dismiss stops the alarm; it does not give the session back.');
      try { $('#stdismiss').focus(); } catch (e) { /* not focusable yet */ }
    }
    alertWasShown = on;
  }

  function render(v) {
    renderScreen(v);
    renderBadge(v);
    renderAlert(v);
  }

  function onStart() {
    const result = timer.start();
    if (!result.ok) Toast.show(ScreenTimeText.refusal(result), 6000);
    else Toast.show('Screen Time session started: 20 minutes.', 3000);
  }

  return {
    /* Current state, for the assistant's answers. Null before init. */
    view: () => (timer ? timer.view() : null),

    init() {
      $('#strules').replaceChildren(H('h3', { textContent: 'How Screen Time works' }),
        H('ul', { className: 'strules' }, null, ScreenTimeText.RULES.map((text) => H('li', { textContent: text }))));
      $('#ststart').onclick = onStart;
      $('#stdismiss').onclick = () => timer.dismiss();
      ScreenTimeAlarm.init();
      timer = createScreenTimeTimer({
        now: () => Date.now(),
        mono: () => performance.now(),
        load: ScreenTimeStore.load,
        save: ScreenTimeStore.save,
        onChange: render,
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) timer.refresh(); });
      timer.init();
    },

    refresh: () => timer && timer.refresh(),
  };
})();
