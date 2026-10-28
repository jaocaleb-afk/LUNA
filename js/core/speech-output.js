/* SpeechOutput.createSpeaker: LUNA's spoken replies (text-to-speech) using the browser's built-in speech synthesis.

   This only SPEAKS. Hearing the person is speech RECOGNITION (voice-session.js), a separate browser feature with
   separate support: a browser may have one without the other. The two meet only in voice-ui.js.

   - No API key or paid service: window.speechSynthesis + SpeechSynthesisUtterance, with the voices the browser
     or operating system provides. How human it sounds depends entirely on those voices; LUNA picks the best it finds.
   - Words: the reply shown on screen is passed through SpeechText.toSpeech(), which only rewrites what engines read
     badly (symbols, "LUNA", quotes), so the voice says what the screen says.
   - Newest reply wins: say() cancels anything still queued or speaking, so replies never pile up.
   - Voices load late in Chrome (the list is empty at first). The first reply waits for the list, at most
     VOICE_WAIT_MS, then speaks with whatever is there (or the browser default).
   - A voice that fails (an online voice with no internet, a missing voice) is skipped from then on, and the same
     reply is retried once with the next best voice.
   - say() quietly does nothing when replies are switched off or the browser cannot speak; the reply is still
     shown as text by the caller.

   env = { synth, Utterance, enabled(): bool, lang(): 'en-US', voice(): preferred voice name or '' (automatic),
           setTimeout?, clearTimeout? }
   API: available(), say(text) -> {spoken|waiting, reason?}, stop(), voicesChanged(), voiceName(), lastError(),
        choices() -> voices offered in Settings (best first)                                                   */
const SpeechOutput = (() => {
  /* Joke and effect voices some systems ship (macOS, some Chrome builds). Never chosen automatically. */
  const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox)\b/i;
  /* Names that mark the more natural-sounding voices: neural/"Natural" (Edge, Windows), Enhanced/Premium (Apple),
     Piper (an offline neural engine that can be added to Linux), and Google's voices in Chrome/ChromeOS. */
  const NATURAL = /\b(natural|neural|enhanced|premium|wavenet|studio|piper|siri)\b/i;
  const GOOD = /\bgoogle\b/i;
  /* Formant synthesizers (eSpeak is the usual one on Raspberry Pi OS): clear but robotic. Last resort only. */
  const BASIC = /\b(espeak|e-speak|mbrola|festival|flite)\b/i;

  const PITCH = 1;              // the voice's own pitch; changing it makes voices sound less natural, not more
  const RATE = 1;
  const BASIC_RATE = 0.9;       // eSpeak's default (about 175 words a minute) is brisk; 0.9 is close to conversation
  const VOICE_WAIT_MS = 1500;
  const RETRY_ERRORS = ['synthesis-failed', 'synthesis-unavailable', 'network', 'voice-unavailable', 'language-unavailable'];

  const baseLang = (lang) => String(lang || '').toLowerCase().replace('_', '-').split('-')[0];
  const sameLang = (a, b) => String(a || '').toLowerCase().replace('_', '-') === String(b || '').toLowerCase().replace('_', '-');

  /* How suitable a voice is for `lang` (higher is better); -1 = never pick it automatically. */
  function score(v, lang) {
    if (!v || NOVELTY.test(v.name || '') || baseLang(v.lang) !== baseLang(lang)) return -1;
    const name = v.name || '';
    return (sameLang(v.lang, lang) ? 8 : 4) +
      (NATURAL.test(name) ? 6 : GOOD.test(name) ? 3 : 0) -
      (BASIC.test(name) ? 3 : 0) +
      (v.default ? 2 : 0) + (v.localService ? 1 : 0);
  }

  /* Voices in `lang`'s language, best first. A voice in another language never appears. */
  function rankVoices(voices, lang, skip) {
    return (voices || [])
      .filter((v) => score(v, lang) >= 0 && !(skip && skip.has(v.name)))
      .map((v, i) => ({ v, s: score(v, lang), i }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.v);
  }

  /* The voice to use: the one chosen in Settings if this device has it, otherwise the best ranked one,
     otherwise null (the browser's default voice). */
  function pickVoice(voices, lang, preferred, skip) {
    const list = voices || [];
    const chosen = preferred && list.find((v) => v && v.name === preferred && !(skip && skip.has(v.name)));
    return chosen || rankVoices(list, lang, skip)[0] || null;
  }

  const rateFor = (voice) => (voice && BASIC.test(voice.name || '') ? BASIC_RATE : RATE);

  function createSpeaker(env) {
    const later = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const cancelLater = env.clearTimeout || ((h) => clearTimeout(h));
    const broken = new Set();     // voices that failed on this device; skipped from now on
    let error = null;
    let waiting = null;           // {text, timer} while the first reply waits for the voice list
    let voicesSeen = false;
    let serial = 0;               // which say() is the newest; an old utterance's error must not retry

    const available = () => !!(env.synth && env.Utterance && typeof env.synth.speak === 'function');
    const voices = () => { try { return env.synth.getVoices() || []; } catch (e) { return []; } };
    const lang = () => (env.lang ? env.lang() : 'en-US');
    const preferred = () => (env.voice ? env.voice() : '');

    function cancelWait() {
      if (waiting) cancelLater(waiting.timer);
      waiting = null;
    }

    function stop() {
      cancelWait();
      serial++;
      if (!available()) return;
      try { env.synth.cancel(); } catch (e) { /* nothing to stop */ }
    }

    function speakNow(words, id, retried) {
      const voice = pickVoice(voices(), lang(), preferred(), broken);
      const utterance = new env.Utterance(words);
      if (voice) utterance.voice = voice;
      utterance.lang = voice ? voice.lang : lang();
      utterance.rate = rateFor(voice);
      utterance.pitch = PITCH;
      utterance.onerror = (e) => {
        const code = (e && e.error) || 'failed';
        if (code === 'canceled' || code === 'interrupted') return;
        error = code;
        // This voice does not work here (often an online voice without internet): skip it and try the next one.
        if (!voice || !RETRY_ERRORS.includes(code)) return;
        broken.add(voice.name);
        if (!retried && id === serial) {
          try { speakNow(words, id, true); } catch (err) { /* stay silent; the reply is on screen */ }
        }
      };
      utterance.onend = () => { if (id === serial) error = null; };
      env.synth.speak(utterance);
    }

    function say(text) {
      const words = SpeechText.toSpeech(text);
      if (!words) return { spoken: false, reason: 'empty' };
      if (!env.enabled()) return { spoken: false, reason: 'disabled' };
      if (!available()) return { spoken: false, reason: 'unsupported' };
      try {
        stop();                                       // newest wins: drop anything queued or still speaking
        const id = serial;
        if (!voicesSeen && !voices().length) {        // the voice list has not loaded yet: wait a moment for it
          waiting = { text: words, timer: later(() => { voicesSeen = true; flush(); }, VOICE_WAIT_MS) };
          return { spoken: false, waiting: true };
        }
        voicesSeen = true;
        speakNow(words, id, false);
        return { spoken: true };
      } catch (e) {
        error = 'failed';
        return { spoken: false, reason: 'failed' };
      }
    }

    function flush() {
      if (!waiting) return;
      const words = waiting.text;
      cancelWait();
      try { speakNow(words, serial, false); } catch (e) { error = 'failed'; }
    }

    return {
      available,
      say,
      stop,
      /* Call when the browser reports its voice list has changed (the 'voiceschanged' event). */
      voicesChanged() {
        if (!voices().length) return;
        voicesSeen = true;
        flush();
      },
      voiceName: () => {
        const v = pickVoice(voices(), lang(), preferred(), broken);
        return v ? v.name + ' (' + v.lang + ')' : '';
      },
      choices: () => rankVoices(voices(), lang()),
      lastError: () => error,
    };
  }

  return { createSpeaker, pickVoice, rankVoices };
})();
