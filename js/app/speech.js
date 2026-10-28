'use strict';
/* Speech: LUNA's spoken replies on the page. The speaking itself is SpeechOutput (core/speech-output.js); this file
   hands it the browser's speechSynthesis, draws the "Spoken replies" card in Settings (#sset), and is what
   voice-ui.js calls to answer a voice command aloud.

   Only replies to VOICE commands are spoken. Typed commands, ticking timers and other screen updates stay silent,
   and the text reply is always shown on screen too, so nothing is lost when speech is off or unavailable.

   The voice is picked automatically (the most natural-sounding one this device offers in the chosen language),
   or chosen by hand in the card. A hand-picked voice that this device does not have falls back to automatic. */
const Speech = (() => {
  const TEST_PHRASE = 'Hi, I’m LUNA. This is how I sound.';
  let speaker = null;

  const isOn = () => Settings.get().speakOn;
  const available = () => !!speaker && speaker.available();

  function statusText() {
    if (!available()) return 'This browser has no speech synthesis, so replies are shown as text only.';
    if (!isOn()) return 'Off. Replies to voice commands are shown as text only.';
    const voice = speaker.voiceName();
    let text = 'On. LUNA answers voice commands aloud with ' + (voice ? 'the voice “' + voice + '”.' : 'the browser’s default voice.');
    if (speaker.lastError()) text += ' The last reply could not be spoken (' + speaker.lastError() + '); this device may have no working voice.';
    return text;
  }

  function choiceButton(label, value) {
    const pressed = isOn() === value;
    return H('button', {
      className: 'btn' + (pressed ? ' sel' : ''), id: value ? 'sson' : 'ssoff', textContent: label,
      disabled: !available(), onclick: () => Settings.set('speakOn', value),
    }, { 'aria-pressed': String(pressed) });
  }

  /* "Automatic" plus this device's voices in the speech language, best first. */
  function voiceSelect() {
    const wanted = Settings.get().speakVoice;
    const voices = available() ? speaker.choices() : [];
    const options = [H('option', { value: '', textContent: 'Automatic (most natural available)' })];
    voices.forEach((v) => options.push(H('option', { value: v.name, textContent: v.name + ' (' + v.lang + ')' })));
    if (wanted && !voices.some((v) => v.name === wanted)) {
      options.push(H('option', { value: wanted, textContent: wanted + ' — not on this device, using automatic' }));
    }
    const select = H('select', { id: 'ssvoice', disabled: !available() || !isOn(), onchange: (e) => Settings.set('speakVoice', e.target.value) },
      { 'aria-label': 'Voice for spoken replies' }, options);
    select.value = wanted;
    return select;
  }

  function render() {
    const card = $('#sset');
    if (!card) return;
    const test = H('button', { className: 'btn', id: 'sstest', textContent: 'Test voice', disabled: !available() || !isOn(), onclick: () => say(TEST_PHRASE) });
    card.replaceChildren(
      H('h3', { textContent: 'Spoken replies' }),
      H('div', { id: 'ssstat', className: 'vstate' + (available() ? '' : ' err'), textContent: statusText() }, { role: 'status' }),
      H('div', { className: 'row' }, null, H('div', { className: 'seg' }, null, choiceButton('On', true), choiceButton('Off', false)), test),
      H('div', { className: 'f', style: 'margin:10px 0 0' }, null, H('label', { htmlFor: 'ssvoice', textContent: 'Voice' }), voiceSelect()),
      H('div', { className: 'mut', style: 'margin-top:8px', textContent:
        'Uses the voices built into this browser or operating system (no account or internet service of LUNA’s own). ' +
        'How natural it sounds depends on the voices installed. Only answers to voice commands are spoken; LUNA stops speaking when you tap Talk.' }));
  }

  function say(text) {
    if (!speaker) return { spoken: false, reason: 'unsupported' };
    const result = speaker.say(text);
    setTimeout(render, 600);   // show a synthesis error, if the browser reports one
    return result;
  }

  return {
    say,
    stop: () => speaker && speaker.stop(),
    available,

    init() {
      const synth = window.speechSynthesis || null;
      speaker = SpeechOutput.createSpeaker({
        synth,
        Utterance: window.SpeechSynthesisUtterance || null,
        enabled: isOn,
        lang: () => Settings.get().voiceLang,
        voice: () => Settings.get().speakVoice,
      });
      // Chrome loads its voice list after the page: speak a reply that was waiting for it, and redraw the choices.
      if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', () => { speaker.voicesChanged(); render(); });
      render();
    },

    onSetting() {
      if (!isOn()) speaker && speaker.stop();
      render();
    },
  };
})();
