'use strict';
/* VoiceView: draws the voice UI from the current state. It never decides anything:
   buttons call back into the `actions` it is given (see voice-ui.js).

   Three places show voice:
     #vind    home-screen indicator (top right). Only says "Listening" when audio is really flowing.
     #vcard   Assistant screen: status, Talk/Stop button, recent commands
     #vset    Settings screen: page security, turn voice on/off, language, privacy notes */
const VoiceView = (() => {
  const INDICATOR = {
    listening: { cls: 'live', text: 'Listening…' },
    starting: { cls: '', text: 'Starting mic…' },
    error: { cls: 'err', text: 'Voice unavailable' },
  };

  const isActive = (state) => state === 'starting' || state === 'listening';
  const talkLabel = (state) => state === 'listening' ? 'Stop' : state === 'starting' ? 'Cancel' : 'Talk';
  const talkIcon = (state) => (isActive(state) ? 'stop' : 'mic');

  function renderHomeIndicator(ctx) {
    const state = ctx.voice.getState();
    const el = $('#vind');
    const info = ctx.on && INDICATOR[state];
    el.hidden = !info;
    el.className = '';
    el.innerHTML = '';
    if (!info) return;
    el.className = info.cls;
    el.append(H('i'), document.createTextNode(info.text));
  }

  function renderTalkButton(ctx) {
    const state = ctx.voice.getState();
    const talk = $('#talk');
    talk.hidden = !ctx.on;
    setText($('.lbl', talk), talkLabel(state));
    Icons.set($('.ico', talk), talkIcon(state));
    talk.classList.toggle('live', isActive(state));
  }

  function renderAssistantCard(ctx, status) {
    const { voice, on, logs, actions } = ctx;
    const state = voice.getState();
    const card = $('#vcard');
    card.innerHTML = '';
    card.append(
      H('h3', { textContent: 'Voice' }),
      H('div', { className: 'vstate' + (status.error ? ' err' : ''), textContent: status.text }, { role: 'status' }),
    );

    const row = H('div', { className: 'row' });
    if (on) {
      row.append(H('button', { id: 'vtalk', className: 'btn vmic' + (isActive(state) ? ' live' : ''), onclick: actions.talk }, null,
        Icons.make(talkIcon(state)), talkLabel(state)));
    } else {
      row.append(H('button', { className: 'btn pri', textContent: 'Set up voice…', onclick: () => Nav.go('settings') }));
    }
    card.append(row);

    if (logs.length) {
      card.append(H('ul', { className: 'log', id: 'vlog' }, null, logs.map((l) => H('li', { className: l.ok ? '' : 'err', textContent: l.text }))));
    }
    card.append(H('div', { className: 'mut', style: 'margin-top:10px', textContent: VoiceText.PRIVACY }));
  }

  function renderSettingsCard(ctx, status) {
    const { voice, on, lang, actions, secure, origin } = ctx;
    const card = $('#vset');
    const page = VoiceText.security(secure, origin);
    card.innerHTML = '';
    card.append(
      H('h3', { textContent: 'Voice commands (push-to-talk)' }),
      H('div', { id: 'vsec', className: 'mut' + (page.error ? ' warn' : ''), textContent: page.text }),
      H('div', { className: 'vstate' + (status.error ? ' err' : ''), textContent: status.text }),
    );

    const row = H('div', { className: 'row' });
    row.append(on
      ? H('button', { className: 'btn', id: 'vtoggle', textContent: 'Turn voice off', onclick: actions.disableVoice })
      : H('button', { className: 'btn pri', id: 'vtoggle', textContent: 'Turn voice on…', onclick: actions.enableVoice, disabled: !voice.support().ok }));
    card.append(row);

    const select = H('select', { className: 'vlang', id: 'vlang', onchange: (e) => actions.setLanguage(e.target.value) }, { 'aria-label': 'Speech language' },
      VLANGS.map((l) => H('option', { value: l[0], textContent: l[1], selected: lang === l[0] })));
    card.append(
      H('div', { className: 'f', style: 'margin:12px 0 0' }, null, H('label', { textContent: 'Language', style: 'width:90px' }), select),
      H('div', { className: 'mut', style: 'margin-top:10px', textContent: VoiceText.PRIVACY }),
    );
  }

  /* ctx = {voice, on, mic, lang, secure, origin, logs:[{ok,text}], actions} */
  function render(ctx) {
    const status = VoiceText.status(ctx.voice, { on: ctx.on, mic: ctx.mic });
    renderTalkButton(ctx);
    renderHomeIndicator(ctx);
    renderAssistantCard(ctx, status);
    renderSettingsCard(ctx, status);
  }

  return { render };
})();
