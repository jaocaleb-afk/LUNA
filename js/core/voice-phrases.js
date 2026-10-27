/* VoicePhrases: the wording of voice problems, each with what to do about it. Pure text, no browser APIs. */
const VoicePhrases = (() => {
  const MESSAGES = {
    unsupported: 'This browser has no speech recognition (Firefox, for example, does not). Use Google Chrome (ChromeOS, desktop) or Chromium, or type commands instead.',
    insecure: 'The microphone only works on a secure page. Open LUNA over https:// with a certificate this device trusts (see “HTTPS on the local network” in README.md), ' +
      'or at http://localhost on the computer that serves LUNA. A plain http://192.168… address is not secure, so the browser blocks the microphone.',
    'not-allowed': 'Microphone permission is blocked for this site. Open the site controls next to the address bar (lock or “tune” icon) → Site settings → Microphone → Allow, then reload LUNA and tap Talk again.',
    'service-not-allowed': 'The browser refused to start speech recognition for this page. This happens on pages that are not secure, when a device or administrator policy blocks it, or when this browser has no speech service.',
    'audio-capture': 'No microphone was found. Plug in a microphone and check it is the system’s selected input.',
    network: 'The browser’s speech service could not be reached. Chrome’s speech recognition sends audio to an online service, so it needs an internet connection. Some browsers (for example Chromium on Raspberry Pi OS) cannot reach it at all.',
    'language-not-supported': 'That speech language is not supported by this browser.',
    'start-failed': 'The microphone could not be started.',
  };

  const explain = (code) => MESSAGES[code] || 'Speech recognition error: ' + code + '.';

  return { explain };
})();
