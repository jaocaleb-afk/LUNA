'use strict';
/* VoiceText: the privacy/limitation wording and the status line for voice features.
   The status line is derived ONLY from the recogniser's real state, so the UI never claims
   "listening" or "wake word working" unless the browser has actually confirmed it. */
const VoiceText = (() => {
  const PRIVACY =
    'Voice uses your browser’s built-in speech recognition. In Chromium and Chrome that sends microphone audio to Google’s servers to be turned into text. ' +
    'LUNA never records or stores audio. Voice is off until you turn it on, and the microphone is not opened until you tap Talk.';

  const WAKE_LIMITS =
    '“Hey LUNA” is experimental. A browser cannot detect a wake word on the device itself, so this keeps the microphone open and streams everything it hears to the speech service, ' +
    'then looks for the phrase in the text that comes back. It may be unreliable or unavailable on a Raspberry Pi. LUNA shows it as “not verified” until it has actually heard you say “Hey LUNA”. ' +
    'Talk (push-to-talk) is more private and more dependable.';

  /* status(voice, {on, wake}) -> {text, error} */
  function status(voice, flags) {
    const support = voice.support();
    const state = voice.getState();

    if (!flags.on) {
      return support.ok
        ? { text: 'Voice is off. Nothing is listening.', error: false }
        : { text: 'Voice is unavailable here: ' + support.msg, error: true };
    }
    if (state === 'error') {
      const err = voice.getError();
      return { text: 'Not working: ' + (err ? err.msg : 'unknown error'), error: true };
    }
    if (state === 'starting') return { text: 'Starting the microphone… (not listening yet)', error: false };
    if (state === 'wake') {
      return {
        text: 'Listening for “Hey LUNA”' + (voice.isVerified() ? ' — heard it at least once this session.' : ' — not verified yet. Say “Hey LUNA” to test it.'),
        error: false,
      };
    }
    if (state === 'command') return { text: 'Listening for your command…', error: false };
    return {
      text: flags.wake
        ? '“Hey LUNA” is enabled but not listening right now. Press “Start listening”.'
        : 'Voice is on. Not listening. Tap Talk to speak a command.',
      error: false,
    };
  }

  return { PRIVACY, WAKE_LIMITS, status };
})();
