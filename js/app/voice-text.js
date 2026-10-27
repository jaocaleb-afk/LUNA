'use strict';
/* VoiceText: the privacy wording, the page-security line and the status line for voice commands.
   The status line is derived ONLY from the recogniser's real state (and the browser's real microphone
   permission), so the UI never claims "listening" unless the browser has actually confirmed it. */
const VoiceText = (() => {
  const PRIVACY =
    'Voice uses your browser’s built-in speech recognition. In Chrome and Chromium that sends microphone audio to Google’s servers to be turned into text, so it needs an internet connection. ' +
    'LUNA never records or stores audio. Voice is off until you turn it on, and the microphone only opens when you tap Talk, for one command.';

  const PERMISSION_BLOCKED =
    'Microphone permission is blocked for this site. Open the site controls next to the address bar (lock or “tune” icon) → Site settings → Microphone → Allow, then reload LUNA.';

  /* "Is this page a secure context?" — shown so the HTTPS setup can be checked from the screen itself. */
  function security(secure, origin) {
    return secure
      ? { text: 'Secure page: ' + origin + ' (the browser allows the microphone here).', error: false }
      : { text: 'Not a secure page: ' + origin + '. Voice commands and the exit PIN need https:// (or http://localhost). See README.md.', error: true };
  }

  /* status(voice, {on, mic}) -> {text, error}.  mic = browser microphone permission: 'granted'|'denied'|'prompt'|'unknown' */
  function status(voice, flags) {
    const support = voice.support();
    const state = voice.getState();

    if (!support.ok) return { text: 'Voice is unavailable here: ' + support.msg, error: true };
    if (state === 'error') {
      const err = voice.getError();
      return { text: 'Not working: ' + (err ? err.msg : 'unknown error'), error: true };
    }
    if (state === 'starting') return { text: 'Starting the microphone… (not listening yet)', error: false };
    if (state === 'listening') return { text: 'Listening for your command…', error: false };
    if (flags.mic === 'denied') return { text: PERMISSION_BLOCKED, error: true };
    if (!flags.on) return { text: 'Voice is off. Nothing is listening.', error: false };
    return { text: 'Voice is on. Not listening. Tap Talk, then say a command.', error: false };
  }

  return { PRIVACY, security, status };
})();
