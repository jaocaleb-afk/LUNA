'use strict';
/* Kiosk: LUNA's fullscreen kiosk mode, and the PIN gate (#gate) shown when leaving it.
   The decisions are made by createKioskGate() (core/kiosk-gate.js, unit-tested); this file connects it to
   the browser's Fullscreen API, the dock button, the Settings card and the gate overlay.

   What this can and cannot do (see README.md, "Fullscreen kiosk mode and the exit PIN"):
   - LUNA's own Exit button asks for the PIN before it leaves fullscreen.
   - The browser's own controls (Esc, its exit-fullscreen button, F11, tab/window close) cannot be blocked by a page.
     LUNA notices the `fullscreenchange` and covers itself with the PIN gate. It cannot keep the browser chrome hidden.
   - Real enforcement needs the browser's/device's kiosk mode (ChromeOS kiosk policies, or Chromium --kiosk). */
const Kiosk = (() => {
  const ACTIVE_KEY = 'luna.kiosk.v1';
  const COVERED = '.screen, #alarm, #stalert, #toast';   // made inert while the gate is up
  const root = document.documentElement;
  const supported = !!(document.fullscreenEnabled && root.requestFullscreen && document.exitFullscreen);

  let gate = null;
  let checking = false;

  const isFullscreen = () => !!document.fullscreenElement;

  /* Chrome only: while fullscreen, Esc must be HELD to exit (a quick press reaches the page). Optional; failures ignored. */
  function lockEscape() {
    try {
      if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {});
    } catch (e) { /* not available */ }
  }

  const env = {
    supported,
    isFullscreen,
    request: () => root.requestFullscreen({ navigationUI: 'hide' }).then(lockEscape),
    exit: () => (isFullscreen() ? document.exitFullscreen() : Promise.resolve()),
    hasPin: () => PinStore.isSet(),
    loadActive: () => store.get(ACTIVE_KEY, false) === true,
    saveActive: (on) => store.set(ACTIVE_KEY, on),
    onChange: () => render(),
  };

  /* ---------- drawing ---------- */
  const inKiosk = (mode) => mode === 'kiosk' || mode === 'confirm-exit';

  function renderDockButton(view) {
    const button = $('#fs');
    button.hidden = !supported;
    setText($('.lbl', button), inKiosk(view.mode) ? 'Exit fullscreen' : 'Fullscreen');
  }

  function renderCard(view) {
    const card = $('#kset');
    const protectedNow = PinStore.isSet();
    let text;
    if (!supported) text = 'This browser does not let LUNA go fullscreen, so kiosk mode is unavailable. Everything else works normally.';
    else if (inKiosk(view.mode)) text = protectedNow ? 'Kiosk mode is on. Leaving fullscreen asks for the exit PIN.' : 'Kiosk mode is on, but NO exit PIN is set: anyone can leave fullscreen.';
    else text = protectedNow ? 'Kiosk mode is off. When it is on, leaving fullscreen asks for the exit PIN.' : 'Kiosk mode is off. No exit PIN is set, so it would not be protected.';
    const button = supported && H('button', {
      className: 'btn' + (inKiosk(view.mode) ? '' : ' pri'), id: 'kbtn',
      textContent: inKiosk(view.mode) ? 'Exit fullscreen' : 'Enter fullscreen kiosk mode', onclick: toggle,
    });
    card.replaceChildren(
      H('h3', { textContent: 'Kiosk mode (fullscreen)' }),
      H('div', { id: 'kstat', className: 'vstate' + (supported && !protectedNow ? ' err' : ''), textContent: text }),
      ...(button ? [H('div', { className: 'row' }, null, button)] : []),
      H('div', { className: 'mut', style: 'margin-top:8px', textContent:
        'A web page cannot stop the browser itself from leaving fullscreen (Esc, its exit button, closing the tab). ' +
        'If that happens without the PIN, LUNA covers its screen and asks for the PIN. For a locked-down device, also use the browser’s or device’s own kiosk mode.' }));
  }

  const GATE_TEXT = {
    'confirm-exit': ['Enter the PIN to leave fullscreen', 'LUNA stays in kiosk mode until the exit PIN is entered.'],
    exited: ['LUNA left fullscreen', 'Fullscreen ended without the exit PIN. Enter the PIN to leave kiosk mode, or return to fullscreen to keep using LUNA.'],
    reload: ['LUNA is in kiosk mode', 'The page was reloaded while in kiosk mode. Enter the PIN to leave kiosk mode, or return to fullscreen to keep using LUNA.'],
  };

  function renderGate(view) {
    const el = $('#gate');
    const show = view.mode === 'confirm-exit' || view.mode === 'locked';
    const wasHidden = el.hidden;
    el.hidden = !show;
    $$(COVERED).forEach((node) => { node.inert = show; });
    Idle.hold('gate', show);
    $('#gok').disabled = checking;
    setText($('#gok'), checking ? 'Checking…' : 'Unlock');
    if (!show) return;

    // Nothing may sit above the gate: close any dialog that was open (dialogs render in the top layer).
    $$('dialog[open]').forEach((d) => d.close());
    const [title, text] = GATE_TEXT[view.mode === 'locked' ? view.reason || 'exited' : view.mode];
    setText($('#gt'), title);
    setText($('#gd'), text);
    setText($('#gerr'), view.message);
    $('#gcancel').hidden = view.mode !== 'confirm-exit';
    $('#greturn').hidden = view.mode !== 'locked' || !supported;
    if (wasHidden) { $('#gpin').value = ''; $('#gpin').focus(); }
  }

  function render() {
    if (!gate) return;
    const view = gate.view();
    renderDockButton(view);
    renderCard(view);
    renderGate(view);
  }

  /* ---------- actions ---------- */
  function toggle() {
    const mode = gate.view().mode;
    if (inKiosk(mode)) return gate.requestExit();
    return gate.enter().then((r) => {
      if (!r.ok) Toast.show(r.msg, 6000);
      else if (!PinStore.isSet()) Toast.show('Fullscreen. No exit PIN is set, so leaving is not protected.', 5000);
    });
  }

  async function submitPin(e) {
    e.preventDefault();
    if (checking) return;
    const input = $('#gpin');
    const pin = input.value;
    input.value = '';
    checking = true;
    render();
    let result;
    try { result = await PinStore.verify(pin); } catch (err) { result = { ok: false, msg: 'The PIN could not be checked on this page (Web Crypto failed).' }; }
    checking = false;
    if (result.ok) await gate.pinAccepted(); else gate.pinRejected(result.msg);
    render();
    if (!$('#gate').hidden) input.focus();
  }

  function buildKeypad() {
    const pad = $('#gpad');
    const input = $('#gpin');
    const press = (key) => {
      if (key === '⌫') input.value = input.value.slice(0, -1);
      else if (input.value.length < Pin.MAX_LENGTH) input.value += key;
      input.focus();
    };
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'].forEach((key) => {
      pad.append(H('button', { type: 'button', className: 'btn', textContent: key, onclick: () => press(key) },
        { 'aria-label': key === '⌫' ? 'Delete last digit' : key }));
    });
  }

  return {
    supported,
    view: () => gate && gate.view(),
    refresh: render,

    init() {
      gate = createKioskGate(env);
      buildKeypad();
      $('#gform').onsubmit = submitPin;
      $('#gcancel').onclick = () => gate.cancelExit();
      $('#greturn').onclick = () => gate.returnToFullscreen();
      $('#fs').onclick = toggle;
      document.addEventListener('fullscreenchange', () => gate.fullscreenChanged());
      gate.init();
      render();
    },
  };
})();
