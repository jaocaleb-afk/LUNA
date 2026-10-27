'use strict';
/* Speech: LUNA's spoken replies on the page. The speaking itself is SpeechOutput (core/speech-output.js); this file
   hands it the browser's speechSynthesis, draws the "Spoken replies" card in Settings (#sset), and is what
   voice-ui.js calls to answer a voice command aloud.

   Only replies to VOICE commands are spoken. Typed commands, ticking timers and other screen updates stay silent,
   and the text reply is always shown on screen too, so nothing is lost when speech is off or unavailable. */
const Speech = (() => {
  const TEST_PHRASE = 'This is how LUNA sounds.';
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

  function render() {
    const card = $('#sset');
    if (!card) return;
    const test = H('button', { className: 'btn', id: 'sstest', textContent: 'Test voice', disabled: !available() || !isOn(), onclick: () => say(TEST_PHRASE) });
    card.replaceChildren(
      H('h3', { textContent: 'Spoken replies' }),
      H('div', { id: 'ssstat', className: 'vstate' + (available() ? '' : ' err'), textContent: statusText() }, { role: 'status' }),
      H('div', { className: 'row' }, null, choiceButton('On', true), choiceButton('Off', false), test),
      H('div', { className: 'mut', style: 'margin-top:8px', textContent:
        'Uses the voices built into this browser or operating system (no account or internet service of LUNA’s own). ' +
        'Only answers to voice commands are spoken; LUNA stops speaking when you tap Talk.' }));
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
      });
      // Chrome loads its voice list after the page; redraw so the chosen voice's name appears.
      if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', render);
      render();
    },

    onSetting() {
      if (!isOn()) speaker && speaker.stop();
      render();
    },
  };
})();
