/* SpeechOutput.createSpeaker: LUNA's spoken replies (text-to-speech) using the browser's built-in speech synthesis.

   This only SPEAKS. Hearing the person is speech RECOGNITION (voice-session.js), a separate browser feature with
   separate support: a browser may have one without the other. The two meet only in voice-ui.js.

   - No API key or paid service: window.speechSynthesis + SpeechSynthesisUtterance, with the voices the browser
     or operating system provides. If none suits, the browser's default voice is used.
   - Newest reply wins: say() cancels anything still queued or speaking, so replies never pile up.
   - say() quietly does nothing when replies are switched off or the browser cannot speak; the reply is still
     shown as text by the caller.

   env = { synth: speechSynthesis|null, Utterance: SpeechSynthesisUtterance|null, enabled(): bool, lang(): 'en-US' }
   API: available(), say(text) -> {spoken, reason?}, stop(), voiceName(), lastError(), pickVoice(voices, lang)       */
const SpeechOutput = (() => {
  /* Joke and effect voices some systems ship (macOS, some Chrome builds). Never chosen automatically. */
  const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox)\b/i;
  const RATE = 1;
  const PITCH = 1;

  const baseLang = (lang) => String(lang || '').toLowerCase().replace('_', '-').split('-')[0];
  const sameLang = (a, b) => String(a || '').toLowerCase().replace('_', '-') === String(b || '').toLowerCase().replace('_', '-');

  /* Choose a clear, standard voice for `lang`: the exact language first, then the same base language
     ("en-GB" for "en-US"); within those, the system default, then an on-device voice (works offline, e.g. on
     a Raspberry Pi), then whatever is listed first. Returns null to let the browser use its default voice. */
  function pickVoice(voices, lang) {
    const usable = (voices || []).filter((v) => v && !NOVELTY.test(v.name || ''));
    const score = (v) => (sameLang(v.lang, lang) ? 8 : baseLang(v.lang) === baseLang(lang) ? 4 : 0) +
      (v.default ? 2 : 0) + (v.localService ? 1 : 0);
    let best = null;
    let bestScore = 3;            // a voice in another language never wins
    usable.forEach((v) => { const s = score(v); if (s > bestScore) { best = v; bestScore = s; } });
    return best;
  }

  function createSpeaker(env) {
    let error = null;
    let chosen = null;

    const available = () => !!(env.synth && env.Utterance && typeof env.synth.speak === 'function');
    const voices = () => { try { return env.synth.getVoices() || []; } catch (e) { return []; } };

    function stop() {
      if (!available()) return;
      try { env.synth.cancel(); } catch (e) { /* nothing to stop */ }
    }

    function say(text) {
      const words = String(text || '').trim();
      if (!words) return { spoken: false, reason: 'empty' };
      if (!env.enabled()) return { spoken: false, reason: 'disabled' };
      if (!available()) return { spoken: false, reason: 'unsupported' };
      const lang = env.lang ? env.lang() : 'en-US';
      try {
        stop();                                       // newest wins: drop anything queued or still speaking
        const utterance = new env.Utterance(words);
        chosen = pickVoice(voices(), lang);
        if (chosen) utterance.voice = chosen;
        utterance.lang = chosen ? chosen.lang : lang;
        utterance.rate = RATE;
        utterance.pitch = PITCH;
        utterance.onerror = (e) => {
          const code = e && e.error;
          if (code !== 'canceled' && code !== 'interrupted') error = code || 'failed';
        };
        utterance.onend = () => { error = null; };
        env.synth.speak(utterance);
        return { spoken: true };
      } catch (e) {
        error = 'failed';
        return { spoken: false, reason: 'failed' };
      }
    }

    return {
      available,
      say,
      stop,
      voiceName: () => {
        const v = chosen || pickVoice(voices(), env.lang ? env.lang() : 'en-US');
        return v ? v.name + ' (' + v.lang + ')' : '';
      },
      lastError: () => error,
    };
  }

  return { createSpeaker, pickVoice };
})();
