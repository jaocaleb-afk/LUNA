'use strict';
/* TimerReplies: what LUNA does and answers for timer commands (typed or spoken), for both timers:
     the ordinary timer      TimerEngine (pause, resume, reset, cancel all allowed)
     the Screen Time Timer   ScreenTimeUI.view() (read-only here: it can be asked about, never controlled)
   The same sentence is shown on screen and, for voice commands, spoken, so the two always agree.
   Durations are written out in words, rounded up to the second like the on-screen countdown. */
const TimerReplies = (() => {
  const say = (ok, msg) => ({ ok, msg });
  const words = (ms) => DurationParser.words(Math.ceil(ms / 1000));
  const screenTime = () => (typeof ScreenTimeUI !== 'undefined' ? ScreenTimeUI.view() : null);
  const screenTimeRunning = (st) => !!st && st.state === 'running';
  const ordinaryActive = (snap) => snap.state !== 'idle';

  const REFUSAL = {
    cancel: 'This timer cannot be cancelled.',
    pause: 'This timer cannot be paused.',
    reset: 'This timer cannot be reset.',
    resume: 'The Screen Time Timer is never paused.',
  };

  function set(action) {
    const result = TimerEngine.start(action.seconds * 1000);
    if (!result.ok) return result;
    return say(true, 'Starting a timer for ' + DurationParser.words(action.seconds) + '.');
  }

  /* alone = no Screen Time sentence follows, so "You have …" cannot be misread */
  function ordinaryStatus(snap, ask, alone) {
    if (snap.state === 'done') return 'Your timer has finished.';
    if (snap.state === 'ready') return 'Your timer is reset to ' + words(snap.remaining) + ' and is not running.';
    if (snap.state === 'paused') return 'Your timer is paused with ' + words(snap.remaining) + ' remaining.';
    if (ask === 'finish') {
      return 'Your timer will finish at ' + Clock.say(new Date(Date.now() + snap.remaining)) + ', in ' + words(snap.remaining) + '.';
    }
    return alone ? 'You have ' + words(snap.remaining) + ' remaining.' : 'Your timer has ' + words(snap.remaining) + ' remaining.';
  }

  function status(action) {
    const st = screenTime();
    if (action.target === 'screentime') return say(!!st, st ? ScreenTimeText.statusSentence(st, action.ask) : 'Screen Time is not available.');
    const snap = TimerEngine.snapshot();
    const showScreenTime = st && (st.state === 'running' || st.state === 'alert');
    const parts = [];
    if (ordinaryActive(snap)) parts.push(ordinaryStatus(snap, action.ask, !showScreenTime));
    if (showScreenTime) parts.push(ScreenTimeText.statusSentence(st, action.ask));
    return say(true, parts.length ? parts.join(' ') : 'No timer is running.');
  }

  /* pause / resume / cancel / reset. These only ever reach the ordinary timer. */
  function control(action) {
    const verb = action.type.split('.')[1];
    const st = screenTime();
    const refuse = () => say(false, REFUSAL[verb] + (screenTimeRunning(st) ? ' ' + ScreenTimeText.endsSentence(st) : ''));
    if (action.target === 'screentime') return refuse();

    const snap = TimerEngine.snapshot();
    if (!ordinaryActive(snap) && screenTimeRunning(st)) return refuse();   // "cancel that timer" = the Screen Time one
    const result = TimerEngine[verb]();
    if (result.ok && screenTimeRunning(st)) result.msg += ' The Screen Time session keeps running.';
    return result;
  }

  return { set, status, control };
})();
