/* createKioskGate: fullscreen kiosk mode where leaving needs the exit PIN. No DOM: the fullscreen API,
   "is a PIN set?" and storage are INJECTED, so the logic is unit-tested with fakes.

   Modes
     normal        not in LUNA's kiosk fullscreen
     kiosk         fullscreen; LUNA is used as usual
     confirm-exit  still fullscreen; LUNA's own Exit control was used and the PIN is being asked for
     locked        fullscreen ended WITHOUT the PIN (browser control, Esc, reload ...). LUNA stays covered until
                   the PIN is entered, or fullscreen is restored (which needs a fresh tap: browsers require one).
   With no PIN set there is no protection: every exit is allowed, and the app says so.

   A web page cannot stop the browser from leaving fullscreen. This only decides what LUNA shows afterwards.

   env = {supported, isFullscreen(), request()->Promise, exit()->Promise, hasPin(), loadActive(), saveActive(on), onChange(view)}
   view = {mode, reason:'exited'|'reload'|'', message} */
function createKioskGate(env) {
  let mode = 'normal';
  let reason = '';
  let message = '';
  let approved = false;   // the PIN was accepted for the exit that is now happening

  const view = () => ({ mode, reason, message });
  function set(newMode, newReason, newMessage) {
    mode = newMode;
    reason = newReason || '';
    message = newMessage || '';
    env.onChange(view());
  }

  function finishExit() {
    approved = false;
    env.saveActive(false);
    set('normal');
  }

  /* Leave fullscreen on purpose (PIN accepted, or no PIN set). */
  function leave() {
    approved = true;
    const settle = () => { if (!env.isFullscreen() && mode !== 'normal') finishExit(); };
    return Promise.resolve().then(env.exit).then(settle, settle);
  }

  const gate = {
    view,
    isProtected: () => env.hasPin(),

    /* After a page load: fullscreen always ends on reload, so a reload in kiosk mode counts as an unapproved exit. */
    init() {
      if (env.isFullscreen()) { env.saveActive(true); set('kiosk'); return; }
      if (env.loadActive() && env.hasPin() && env.supported) { set('locked', 'reload'); return; }
      env.saveActive(false);
      set('normal');
    },

    enter() {
      if (!env.supported) return Promise.resolve({ ok: false, msg: 'This browser does not let LUNA go fullscreen.' });
      return Promise.resolve().then(env.request).then(
        () => ({ ok: true }),
        () => ({ ok: false, msg: 'The browser did not allow fullscreen. Tap the button again.' }));
    },

    /* LUNA's own "Exit fullscreen" control. */
    requestExit() {
      if (mode !== 'kiosk') return Promise.resolve();
      if (!env.hasPin()) return leave();
      set('confirm-exit');
      return Promise.resolve();
    },

    cancelExit() { if (mode === 'confirm-exit') set('kiosk'); },

    pinAccepted() {
      if (mode === 'confirm-exit') return leave();
      if (mode === 'locked') finishExit();
      return Promise.resolve();
    },

    pinRejected(text) {
      if (mode === 'confirm-exit' || mode === 'locked') set(mode, reason, text);
    },

    /* From the locked screen. Must be called from a tap/click: browsers only allow fullscreen after a user gesture. */
    returnToFullscreen() {
      if (mode !== 'locked') return Promise.resolve({ ok: false });
      return Promise.resolve().then(env.request).then(
        () => ({ ok: true }),
        () => {
          set('locked', reason, 'The browser did not allow fullscreen. Tap “Return to fullscreen” again, or enter the PIN.');
          return { ok: false };
        });
    },

    /* Call on every `fullscreenchange` event, whatever caused it. */
    fullscreenChanged() {
      if (env.isFullscreen()) {
        approved = false;
        env.saveActive(true);
        if (mode !== 'kiosk' && mode !== 'confirm-exit') set('kiosk');
        return;
      }
      if (mode === 'normal' || mode === 'locked') return;
      if (approved || !env.hasPin()) { finishExit(); return; }
      set('locked', 'exited');
    },
  };
  return gate;
}
