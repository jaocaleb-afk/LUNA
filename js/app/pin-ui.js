'use strict';
/* PinUI: the "Exit PIN" card on the Settings screen: set a PIN (typed twice), change it (needs the current PIN),
   remove it (needs the current PIN). It says plainly when exit protection is NOT active. */
const PinUI = (() => {
  let form = null;    // null | 'setup' | 'change' | 'remove'
  let busy = false;
  let error = '';

  const CRYPTO_MISSING = 'An exit PIN cannot be set on this page: the browser’s Web Crypto API is unavailable here. ' +
    'Browsers only provide it on secure pages (https:// or http://localhost). LUNA will not store a PIN without it. Exit protection is NOT active.';

  function statusLine() {
    if (!PinStore.available()) return { text: CRYPTO_MISSING, error: true };
    if (PinStore.isSet()) return { text: 'An exit PIN is set. Leaving LUNA’s fullscreen kiosk mode asks for it.', error: false };
    if (PinStore.unreadable()) return { text: 'The saved PIN could not be read, so exit protection is NOT active. Set a new PIN.', error: true };
    return { text: 'No exit PIN is set. Exit protection is NOT active: anyone can leave fullscreen.', error: true };
  }

  const pinInput = (id, label, autocomplete) => H('div', { className: 'f' }, null,
    H('label', { htmlFor: id, textContent: label }),
    H('input', { id, type: 'password', inputMode: 'numeric', maxLength: Pin.MAX_LENGTH, autocomplete }, { pattern: '[0-9]*' }));

  const value = (id) => { const el = $('#' + id); return el ? el.value : ''; };

  function open(name) {
    form = name;
    error = '';
    Idle.hold('pin-form', !!name);
    render();
    const first = $('#pinset input');
    if (first) first.focus();
  }

  function finish(message) {
    open(null);
    Toast.show(message, 3500);
    Kiosk.refresh();
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const current = value('pin-cur');
    const fresh = value('pin-new');
    const again = value('pin-new2');
    if (form !== 'remove') {
      const problem = Pin.checkNew(fresh, again);
      if (problem) { error = problem; return render(); }
    }
    busy = true;
    error = '';
    render();
    try {
      if (form !== 'setup') {
        const check = await PinStore.verify(current);
        if (!check.ok) { error = 'Current PIN: ' + check.msg; return; }
      }
      if (form === 'remove') { PinStore.remove(); return finish('PIN removed. Exit protection is off.'); }
      await PinStore.save(fresh);
      finish(form === 'setup' ? 'PIN saved. Exit protection is on.' : 'PIN changed.');
    } catch (err) {
      error = err && err.message === 'storage-failed'
        ? 'The browser did not save the PIN (storage is blocked or full). Nothing was changed.'
        : 'The PIN could not be saved: this browser’s Web Crypto API failed. Nothing was changed.';
    } finally {
      busy = false;
      render();
    }
  }

  function formFields() {
    const fields = [];
    if (form !== 'setup') fields.push(pinInput('pin-cur', 'Current PIN', 'current-password'));
    if (form !== 'remove') {
      fields.push(pinInput('pin-new', form === 'change' ? 'New PIN' : 'PIN', 'new-password'));
      fields.push(pinInput('pin-new2', 'Type it again', 'new-password'));
    }
    const title = { setup: 'Set an exit PIN', change: 'Change the exit PIN', remove: 'Remove the exit PIN' }[form];
    const saveText = { setup: 'Save PIN', change: 'Change PIN', remove: 'Remove PIN' }[form];
    return H('form', { id: 'pinform', onsubmit: submit, noValidate: true }, { 'aria-label': title },
      H('div', { className: 'rhelp', textContent: title + '. ' + Pin.MIN_LENGTH + '–' + Pin.MAX_LENGTH + ' digits.' }),
      ...fields,
      H('div', { id: 'pinerr', className: 'errs', textContent: busy ? '' : error }, { role: 'alert' }),
      H('div', { className: 'row' }, null,
        H('button', { className: 'btn', type: 'button', textContent: 'Cancel', disabled: busy, onclick: () => open(null) }),
        H('button', { className: 'btn pri', id: 'pinsave', type: 'submit', disabled: busy, textContent: busy ? 'Checking…' : saveText })));
  }

  function render() {
    const card = $('#pinset');
    // Re-rendering must not wipe what the person has typed (e.g. while "Checking…").
    const typed = {};
    $$('#pinset input').forEach((i) => { typed[i.id] = i.value; });
    const s = statusLine();
    card.replaceChildren(
      H('h3', { textContent: 'Exit PIN' }),
      H('div', { id: 'pinstat', className: 'vstate' + (s.error ? ' err' : ''), textContent: s.text }, { role: 'status' }));
    if (!PinStore.available()) return;
    if (form) {
      card.append(formFields());
      $$('#pinset input').forEach((i) => { if (i.id in typed && error === '') i.value = typed[i.id]; });
      return;
    }
    const row = H('div', { className: 'row' });
    if (PinStore.isSet()) {
      row.append(H('button', { className: 'btn', id: 'pinchg', textContent: 'Change PIN…', onclick: () => open('change') }),
        H('button', { className: 'btn', id: 'pinrm', textContent: 'Remove PIN…', onclick: () => open('remove') }));
    } else {
      row.append(H('button', { className: 'btn pri', id: 'pinnew', textContent: 'Set a PIN…', onclick: () => open('setup') }));
    }
    card.append(row, H('div', { className: 'mut', style: 'margin-top:8px', textContent:
      'The PIN is stored only as a salted hash, separately from your settings, schedules and backgrounds. ' +
      'Forgot it? Clearing this site’s data in the browser removes it (and everything else LUNA saved).' }));
  }

  return { init: render, refresh: render };
})();
