'use strict';
/* VoiceUI: connects the voice state machine (core/voice-session.js) to the page.

   Consent model (nothing is opened or sent before the person agrees):
     1. "Turn voice on"  -> disclosure dialog (audio goes to the browser's cloud speech service) -> consent stored.
                            The microphone is still NOT opened. It opens when the person taps Talk.
     2. "Always listen"  -> a second, stronger disclosure (continuous streaming) -> stored separately.
     3. Turning voice off, or Restore defaults, stops the microphone and deletes both consents.
   After a reload, always-listening resumes only if consent exists AND the browser already holds microphone
   permission, so a page load never triggers a surprise permission prompt. */
const VoiceUI = (() => {
  const CONSENT_KEY = 'luna.voice.consent.v1';
  const MAX_LOG = 5;
  const consent = () => store.get(CONSENT_KEY, {});
  const saveConsent = (c) => store.set(CONSENT_KEY, c);

  let voice = null;
  let previousState = 'idle';
  let bubbleTimer = 0;
  let logs = [];

  const isOn = () => Settings.get().voiceOn;
  const wantsWake = () => Settings.get().wakeOn;

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
      if (e.state === 'command' && previousState !== 'command') Sound.chime(); // audible "I'm listening"
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
      showBubble(['I didn’t catch a command.'], '', 4000);
    } else if (e.type === 'error') {
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
        'In Chromium and Chrome, while you are speaking to LUNA, microphone audio is sent to Google’s servers to be converted to text. LUNA does not record or store audio.',
        'The browser will ask for microphone permission the first time you tap Talk. You can turn voice off at any time.',
      ], 'I understand — allow', () => {
        saveConsent({ push: Date.now() });
        Settings.set('voiceOn', true);
        Toast.show('Voice is on. Tap Talk to speak.', 3000);
      });
    },

    disableVoice() {
      voice.stop();
      saveConsent({});
      Settings.set('wakeOn', false);
      Settings.set('voiceOn', false);
    },

    enableWake() {
      askConsent('Always listen for “Hey LUNA”? (experimental)', [
        'This keeps the microphone open and continuously streams ALL audio it hears — not only after you say “Hey LUNA” — to the browser’s cloud speech service (Google, in Chromium). Anything said near the device is sent.',
        'LUNA throws away text that does not start with “Hey LUNA”, but the audio has already been sent to the service.',
        'It may not work on a Raspberry Pi, and LUNA will say so if it cannot. Talk (push-to-talk) only listens after you tap it and is the more private choice.',
      ], 'Allow always-listening', () => {
        saveConsent({ ...consent(), wake: Date.now() });
        Settings.set('wakeOn', true);
        voice.startWake(); // the microphone permission prompt appears now, in response to the person's choice
      });
    },

    disableWake() {
      voice.stop();
      const c = consent();
      delete c.wake;
      saveConsent(c);
      Settings.set('wakeOn', false);
    },

    startWake() { voice.startWake(); },

    talk() {
      const state = voice.getState();
      if (state === 'command' && !voice.wantsWake()) return voice.stop(); // tapping Stop
      if (state === 'starting') return;
      voice.listenOnce();
    },

    setLanguage(lang) { Settings.set('voiceLang', lang); },
  };

  function render() {
    if (!voice) return;
    VoiceView.render({ voice, on: isOn(), wake: wantsWake(), lang: Settings.get().voiceLang, logs, actions });
  }

  /* After a reload: resume always-listening only when consent exists and the mic is already permitted. */
  function resumeWakeIfPermitted() {
    if (!(isOn() && wantsWake() && consent().wake && voice.support().ok)) return;
    try {
      navigator.permissions.query({ name: 'microphone' }).then(
        (p) => { if (p.state === 'granted') voice.startWake(); else render(); },
        () => render());
    } catch (e) { render(); }
  }

  return {
    init() {
      voice = VoiceCore.createVoice({
        ctor: window.SpeechRecognition || window.webkitSpeechRecognition || null,
        secure: !!window.isSecureContext,
        lang: () => Settings.get().voiceLang,
        emit: onVoiceEvent,
        run: (text) => Assistant.run(text),
      });
      $('#talk').onclick = actions.talk;
      render();
      resumeWakeIfPermitted();
    },

    /* Called when a voice-related setting changes (including "Restore defaults"). */
    onSetting(key) {
      if (!voice) return;
      if (!isOn()) {
        voice.stop();
        saveConsent({});
        if (wantsWake()) Settings.set('wakeOn', false);
      } else if (key === 'voiceLang' && voice.wantsWake()) {
        voice.stop();
        voice.startWake();
      } else if (!wantsWake() && voice.wantsWake()) {
        voice.stop();
      }
      render();
    },
  };
})();
