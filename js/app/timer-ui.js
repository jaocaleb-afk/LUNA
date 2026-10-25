'use strict';
/* TimerUI: the Timer screen, the always-visible readout on the home screen, and the "time's up" alert.

   Three places show the same timer:
     #td / #tst / #tsrc   Timer screen: big countdown, state, and WHO started it (manual vs a schedule)
     #tbadge              home screen: small readout that stays visible when the controls hide
     #alarm               full-screen alert when the timer finishes (stays until dismissed) */
const TimerUI = (() => {
  const BUTTON_TEXT = { start: 'Start', pause: 'Pause', resume: 'Resume', reset: 'Reset', cancel: 'Cancel' };
  const PRIMARY = ['start', 'resume'];
  const BUTTONS_FOR_STATE = {
    idle: ['start'],
    ready: ['start', 'cancel'],
    running: ['pause', 'reset', 'cancel'],
    paused: ['resume', 'reset', 'cancel'],
    done: ['reset', 'cancel'],
  };
  const STATE_TEXT = { idle: '', ready: 'Ready', running: 'Running', paused: 'Paused', done: 'Time’s up' };

  let controlsBuiltFor = '';

  const typedDurationMs = () => ((+$('#tm').value || 0) * 60 + (+$('#ts').value || 0)) * 1000;
  const startedBySchedule = (s) => s.source === 'rule' && !!s.label;

  /* Buttons are rebuilt only when the STATE changes. (Rebuilding on every 250 ms tick would
     swallow taps that straddle a tick and drop keyboard focus.) */
  function renderControls(s) {
    if (s.state === controlsBuiltFor) return;
    controlsBuiltFor = s.state;

    const row = $('#tctl');
    row.innerHTML = '';
    BUTTONS_FOR_STATE[s.state].forEach((action) => {
      const button = H('button', { className: 'btn ' + (PRIMARY.includes(action) ? 'pri' : ''), textContent: BUTTON_TEXT[action] });
      button.dataset.act = action;
      button.onclick = () => onButton(action);
      row.append(button);
    });
    // Duration entry only makes sense while no timer exists.
    $('#tin').hidden = s.state !== 'idle';
    $('#presets').hidden = s.state !== 'idle';
  }

  function renderScreen(s) {
    const done = s.state === 'done';
    setText($('#td'), done ? '0:00' : s.state === 'idle' ? fmt(typedDurationMs()) : fmt(s.remaining));
    $('#td').classList.toggle('done', done);
    setText($('#tst'), STATE_TEXT[s.state]);

    let source = '';
    if (s.state !== 'idle') source = startedBySchedule(s) ? 'Started automatically by schedule “' + s.label + '”' : 'Started manually';
    setText($('#tsrc'), source);
  }

  function renderHomeReadout(s) {
    const done = s.state === 'done';
    const active = s.state === 'running' || s.state === 'paused' || done;
    const badge = $('#tbadge');
    badge.hidden = !active;
    if (!active) return;

    setText($('#tbt'), done ? '0:00' : fmt(s.remaining));
    const note = done
      ? 'Time’s up'
      : [s.state === 'paused' ? 'Paused' : '', startedBySchedule(s) ? s.label : ''].filter(Boolean).join(' · ');
    setText($('#tbl'), note);
    badge.classList.toggle('paused', s.state === 'paused');
    badge.classList.toggle('done', done);
  }

  function render(s) {
    renderScreen(s);
    renderControls(s);
    renderHomeReadout(s);
  }

  function onButton(action) {
    let result;
    if (action === 'start') {
      result = TimerEngine.snapshot().state === 'ready' ? TimerEngine.startReady() : TimerEngine.start(typedDurationMs());
    } else {
      result = TimerEngine[action]();
    }
    if (!result.ok) Toast.show(result.msg);
  }

  function showAlarm(s) {
    const length = Schedule.durText(Math.round(s.duration / 1000));
    setText($('#als'), startedBySchedule(s) ? '“' + s.label + '” — scheduled ' + length + ' timer finished' : length + ' timer finished');
    $('#alarm').classList.add('on');
    Sound.beep();
    try { $('#dis').focus(); } catch (e) { /* not focusable yet */ }
  }

  const dismissAlarm = () => $('#alarm').classList.remove('on');

  function init() {
    TimerEngine.subscribe((s, kind) => { render(s); if (kind === 'done') showAlarm(s); });

    $$('#presets button').forEach((button) => {
      button.onclick = () => {
        if (TimerEngine.snapshot().state !== 'idle') return Toast.show('Cancel the current timer first');
        $('#tm').value = button.dataset.m;
        $('#ts').value = 0;
        render(TimerEngine.snapshot());
      };
    });
    ['#tm', '#ts'].forEach((id) => { $(id).oninput = () => render(TimerEngine.snapshot()); });

    $('#dis').onclick = () => { dismissAlarm(); TimerEngine.reset(); };
    document.addEventListener('visibilitychange', () => TimerEngine.refresh());
    render(TimerEngine.snapshot());
  }

  return { init, render: () => render(TimerEngine.snapshot()), dismissAlarm };
})();
