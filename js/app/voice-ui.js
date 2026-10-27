'use strict';
/* VoiceUI: connects the push-to-talk state machine (core/voice-session.js) to the page.

   Consent model (nothing is opened or sent before the person agrees):
     1. "Turn voice on" -> disclosure dialog (audio goes to the browser's cloud speech service) -> consent stored.
                           The microphone is still NOT opened.
     2. Talk            -> opens the microphone for ONE command (the browser asks for permission the first time).
                           Tapping it again while starting/listening stops it.
     3. Turning voice off, or Restore defaults, stops the microphone and deletes the stored consent.
   The browser's microphone permission is only READ (navigator.permissions.query), never requested on load,
   so a page load never opens the microphone or shows a permission prompt. */
const VoiceUI = (() => {
  const CONSENT_KEY = 'luna.voice.consent.v1';
  const MAX_LOG = 5;
  const saveConsent = (c) => store.set(CONSENT_KEY, c);

  let voice = null;
  let previousState = 'idle';
  let bubbleTimer = 0;
  let logs = [];
  let mic = 'unknown';   // browser microphone permission, as last reported

  const isOn = () => Settings.get().voiceOn;

  /* ---------- speech bubble on the home screen (the recognised command and LUNA's response) ---------- */
  function showBubble(parts, cls, ms) {
    const bubble = $('#vbubble');
    bubble.innerHTML = '';
    bubble.className = cls || '';
    parts.forEach((p) => bubble.append(typeof p === 'string' ? document.createTextNode(p) : p));
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
  }
  const quoted = (text) => H('span', { className: 'you', textContent: '“' + text + '”' });

  function onVoiceEvent(e) {
    if (e.type === 'state') {
      if (e.state === 'listening' && previousState !== 'listening') Sound.chime(); // audible "I'm listening"
      previousState = e.state;
      render();
    } else if (e.type === 'heard') {
      showBubble([quoted(e.text), e.final ? ' …' : '…'], '', e.final ? 4000 : 9000);
    } else if (e.type === 'command') {
      showBubble([quoted(e.text), ' → ' + e.msg], e.ok ? '' : 'err', 9000);
      logs.unshift({ ok: e.ok, text: '“' + e.text + '” → ' + e.msg });
      logs.length = Math.min(logs.length, MAX_LOG);
      render();
    } else if (e.type === 'timeout') {
      showBubble([e.msg], '', 4000);
    } else if (e.type === 'error') {
      if (e.code === 'not-allowed') mic = 'denied';
      showBubble([e.msg], 'err', 12000);
      render();
    }
  }

  /* ---------- consent dialog ---------- */
  function askConsent(title, paragraphs, yesText, onYes) {
    const dialog = $('#vdlg');
    $('#vdt').textContent = title;
    const body = $('#vdb');
    body.innerHTML = '';
    paragraphs.forEach((text) => body.append(H('p', { textContent: text })));
    $('#vyes').textContent = yesText;
    $('#vyes').onclick = () => { dialog.close(); onYes(); };
    $('#vno').onclick = () => dialog.close();
    dialog.showModal();
    Idle.hold('voice-dialog', true);
    dialog.addEventListener('close', () => Idle.hold('voice-dialog', false), { once: true });
  }

  /* ---------- actions (called by the buttons) ---------- */
  const actions = {
    enableVoice() {
      const support = voice.support();
      if (!support.ok) { Toast.show(support.msg, 8000); return render(); }
      askConsent('Turn on voice commands?', [
        'LUNA has no speech recognition of its own; it uses the one built into this browser.',
        'In Chrome and Chromium, while you are speaking to LUNA, microphone audio is sent to Google’s servers to be converted to text. LUNA does not record or store audio.',
        'The microphone only opens when you tap Talk, for one command. The browser will ask for microphone permission the first time. You can turn voice off at any time.',
      ], 'I understand — allow', () => {
        saveConsent({ push: Date.now() });
        Settings.set('voiceOn', true);
        Toast.show('Voice is on. Tap Talk to speak.', 3000);
      });
    },

    disableVoice() {
      voice.stop();
      saveConsent({});
      Settings.set('voiceOn', false);
    },

    /* Talk toggles: idle/error -> listen for one command; starting/listening -> stop. */
    talk() {
      const state = voice.getState();
      if (state === 'starting' || state === 'listening') return voice.stop();
      voice.listen();
    },

    setLanguage(lang) { Settings.set('voiceLang', lang); },
  };

  function render() {
    if (!voice) return;
    VoiceView.render({
      voice, on: isOn(), mic, lang: Settings.get().voiceLang, logs, actions,
      secure: !!window.isSecureContext, origin: location.origin,
    });
  }

  /* Read (never request) the microphone permission, and follow changes, so a blocked microphone is explained up front. */
  function watchMicPermission() {
    if (!window.isSecureContext || !navigator.permissions || !navigator.permissions.query) return;
    try {
      navigator.permissions.query({ name: 'microphone' }).then((p) => {
        mic = p.state;
        p.onchange = () => { mic = p.state; render(); };
        render();
      }, () => { /* this browser cannot report it */ });
    } catch (e) { /* unsupported permission name */ }
  }

  /* Data written by older versions that had an always-listening mode. */
  function dropLegacyWakeData() {
    const c = store.get(CONSENT_KEY, {});
    if (c && 'wake' in c) { delete c.wake; saveConsent(c); }
  }

  return {
    init() {
      dropLegacyWakeData();
      voice = VoiceCore.createVoice({
        ctor: window.SpeechRecognition || window.webkitSpeechRecognition || null,
        secure: !!window.isSecureContext,
        lang: () => Settings.get().voiceLang,
        emit: onVoiceEvent,
        run: (text) => Assistant.run(text),
      });
      $('#talk').onclick = actions.talk;
      render();
      watchMicPermission();
    },

    /* Called when a voice-related setting changes (including "Restore defaults"). */
    onSetting() {
      if (!voice) return;
      if (!isOn()) {
        voice.stop();
        saveConsent({});
      }
      render();
    },
  };
})();
