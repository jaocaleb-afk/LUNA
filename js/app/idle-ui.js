'use strict';
/* Idle: hides the on-screen controls after a period without interaction, and brings them back on the next one.

   What "idle" does
     home screen        the button dock fades out (the clock, running-timer readout and alerts are untouched)
     any other screen   after at least 30 s the display returns to the clock, so the clock is visible again
   What reveals the controls: a tap/click, mouse movement, a key press, or scrolling.
   Other ways into a screen while controls are hidden: open /#settings, or say "open settings".

   The countdown logic itself is createIdle() in core/idle.js (unit-tested). This file connects it to the page. */
const Idle = (() => {
  const SUB_SCREEN_MIN_MS = 30000;
  const SWALLOW_MS = 700;
  const NAVIGATION_KEYS = ['Tab', 'Enter', ' ', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'];
  const MOUSE_JITTER_PX = 8;

  let lastX = null;
  let lastY = null;
  let swallowClicksUntil = 0;

  function delayMs() {
    const seconds = Settings.get().idleSec;
    if (!seconds) return 0;                                   // "Never"
    return Nav.cur === 'home' ? seconds * 1000 : Math.max(seconds * 1000, SUB_SCREEN_MIN_MS);
  }

  const countdown = createIdle({
    delay: delayMs,
    onIdle() {
      if (Nav.cur !== 'home') { Nav.go('home', { silent: true }); TimerUI.render(); }
      document.body.classList.add('idle');
      DockMenu.close();
      const focused = document.activeElement;
      if (focused && focused.closest('#dock')) focused.blur();
    },
    onActive() { document.body.classList.remove('idle'); },
  });

  const modalOpen = () => !!document.querySelector('dialog[open]') || $('#alarm').classList.contains('on') || !$('#gate').hidden || !$('#stalert').hidden;

  function onUserEvent(e) {
    // Ignore tiny mouse movements so a vibrating table or jittery mouse does not keep the controls up.
    if (e.type === 'pointermove') {
      if (lastX === null) { lastX = e.clientX; lastY = e.clientY; return; }
      if (Math.hypot(e.clientX - lastX, e.clientY - lastY) < MOUSE_JITTER_PX) return;
      lastX = e.clientX;
      lastY = e.clientY;
    }

    const wasIdle = countdown.isIdle();
    const isPress = e.type === 'pointerdown' || e.type === 'touchstart';
    const onModal = e.target.closest && e.target.closest('#alarm, #stalert, dialog, #gate');

    // The tap that REVEALS the controls must not also press whatever button appears under the finger.
    if (wasIdle && isPress && !onModal) swallowClicksUntil = performance.now() + SWALLOW_MS;

    // Keyboard: reveal, then put focus on the first button so keyboard users can carry on immediately.
    if (wasIdle && e.type === 'keydown' && Nav.cur === 'home' && !modalOpen()) {
      countdown.touch();
      if (NAVIGATION_KEYS.includes(e.key)) {
        const first = $('#dock .btn:not([hidden])');
        if (first) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    countdown.touch();
  }

  return {
    touch: () => countdown.touch(),
    hold: (key, on) => countdown.hold(key, on),
    reconfigure: () => countdown.reconfigure(),
    isIdle: () => countdown.isIdle(),

    init() {
      ['pointerdown', 'touchstart', 'wheel', 'pointermove'].forEach((type) =>
        addEventListener(type, onUserEvent, { capture: true, passive: true }));
      // keydown must NOT be passive: we call preventDefault() to move focus onto the revealed controls.
      addEventListener('keydown', onUserEvent, { capture: true });
      document.addEventListener('click', (e) => {
        if (performance.now() < swallowClicksUntil) { e.stopPropagation(); e.preventDefault(); }
      }, true);
      countdown.touch();
    },
  };
})();
