'use strict';
/* VoiceView: draws the voice UI from the current state. It never decides anything:
   buttons call back into the `actions` it is given (see voice-ui.js).

   Three places show voice:
     #vind    home-screen indicator (top right). Only says "Listening" when audio is really flowing.
     #vcard   Assistant screen: status, Talk button, recent commands
     #vset    Settings screen: turn voice on/off, always-listen toggle, language, privacy notes */
const VoiceView = (() => {
  function indicatorFor(state, voice) {
    switch (state) {
      case 'command': return { cls: 'cmd', text: 'Listening…' };
      case 'wake': return { cls: 'wake', text: 'Hey LUNA' + (voice.isVerified() ? '' : ' (unverified)') };
      case 'starting': return { cls: '', text: 'Starting mic…' };
      case 'error': return { cls: 'err', text: 'Voice unavailable' };
      default: return { cls: 'err', text: 'Hey LUNA is not listening' };
    }
  }

  function renderHomeIndicator(ctx) {
    const { voice, on, wake } = ctx;
    const state = voice.getState();
    const el = $('#vind');
    el.hidden = !(on && (state !== 'idle' || wake));
    el.className = '';
    el.innerHTML = '';
    if (el.hidden) return;
    const info = indicatorFor(state, voice);
    el.className = info.cls;
    el.append(H('i'), document.createTextNode(info.text));
  }

  function renderAssistantCard(ctx, status) {
    const { voice, on, wake, logs, actions } = ctx;
    const state = voice.getState();
    const card = $('#vcard');
    card.innerHTML = '';
    card.append(
      H('h3', { textContent: 'Voice' }),
      H('div', { className: 'vstate' + (status.error ? ' err' : ''), textContent: status.text }, { role: 'status' }),
    );

    const row = H('div', { className: 'row' });
    if (on) {
      row.append(H('button', { id: 'vtalk', className: 'btn vmic' + (state === 'command' ? ' live' : ''), textContent: state === 'command' ? '■ Stop' : '🎤 Talk', onclick: actions.talk }));
    } else {
      row.append(H('button', { className: 'btn pri', textContent: 'Set up voice…', onclick: () => Nav.go('settings') }));
    }
    if (on && wake && state === 'idle') row.append(H('button', { className: 'btn', textContent: 'Start listening', onclick: actions.startWake }));
    card.append(row);

    if (logs.length) {
      card.append(H('ul', { className: 'log', id: 'vlog' }, null, logs.map((l) => H('li', { className: l.ok ? '' : 'err', textContent: l.text }))));
    }
    card.append(H('div', { className: 'mut', style: 'margin-top:10px', textContent: VoiceText.PRIVACY }));
  }

  function renderSettingsCard(ctx, status) {
    const { voice, on, wake, lang, actions } = ctx;
    const state = voice.getState();
    const card = $('#vset');
    card.innerHTML = '';
    card.append(
      H('h3', { textContent: 'Voice & “Hey LUNA”' }),
      H('div', { className: 'vstate' + (status.error ? ' err' : ''), textContent: status.text }),
    );

    const row = H('div', { className: 'row' });
    row.append(on
      ? H('button', { className: 'btn', id: 'vtoggle', textContent: 'Turn voice off', onclick: actions.disableVoice })
      : H('button', { className: 'btn pri', id: 'vtoggle', textContent: 'Turn voice on…', onclick: actions.enableVoice, disabled: !voice.support().ok }));
    row.append(H('button', {
      className: 'btn' + (wake ? ' sel' : ''), id: 'wtoggle', disabled: !on,
      textContent: 'Always listen for “Hey LUNA”: ' + (wake ? 'On' : 'Off'),
      onclick: wake ? actions.disableWake : actions.enableWake,
    }, { 'aria-pressed': String(wake) }));
    if (on && wake && state === 'idle') row.append(H('button', { className: 'btn', textContent: 'Start listening', onclick: actions.startWake }));
    card.append(row);

    const select = H('select', { className: 'vlang', id: 'vlang', onchange: (e) => actions.setLanguage(e.target.value) }, { 'aria-label': 'Speech language' },
      VLANGS.map((l) => H('option', { value: l[0], textContent: l[1], selected: lang === l[0] })));
    card.append(
      H('div', { className: 'f', style: 'margin:12px 0 0' }, null, H('label', { textContent: 'Language', style: 'width:90px' }), select),
      H('div', { className: 'mut', style: 'margin-top:10px', textContent: VoiceText.PRIVACY }),
      H('div', { className: 'mut', style: 'margin-top:8px', textContent: VoiceText.WAKE_LIMITS }),
    );
  }

  /* ctx = {voice, on, wake, lang, logs:[{ok,text}], actions} */
  function render(ctx) {
    const status = VoiceText.status(ctx.voice, { on: ctx.on, wake: ctx.wake });
    $('#talk').hidden = !ctx.on;
    renderHomeIndicator(ctx);
    renderAssistantCard(ctx, status);
    renderSettingsCard(ctx, status);
  }

  return { render };
})();
