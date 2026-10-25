/* VoicePhrases: wake-phrase matching and the wording of voice errors. Pure text, no browser APIs. */
const VoicePhrases = (() => {
  // "Hey LUNA" plus the spellings speech engines commonly return for it.
  const WAKE = /\b(?:hey|hay)[\s,.!-]+(?:luna|loona|lunar|looner|lunah)\b/i;

  /* matchWake("Hey Luna, set a timer.") -> {woke:true, command:'set a timer'} */
  function matchWake(text) {
    const s = String(text || '');
    const m = WAKE.exec(s);
    if (!m) return { woke: false, command: '' };
    const command = s.slice(m.index + m[0].length)
      .replace(/^[\s,.!?:;-]+/, '')
      .replace(/[\s,.!?]+$/, '');
    return { woke: true, command };
  }

  /* Remove a leading wake phrase if there is one: "hey luna what time is it" -> "what time is it" */
  function stripWake(text) {
    const m = matchWake(text);
    return m.woke ? m.command : String(text || '').trim();
  }

  const MESSAGES = {
    unsupported: 'This browser has no speech recognition (Firefox, for example, does not). Use Chromium or Chrome, or type commands instead.',
    insecure: 'The microphone is only available on secure pages. Open LUNA at https://… or http://localhost (not a plain http://192.168… address), or start Chromium with its “treat insecure origin as secure” flag for this address.',
    'not-allowed': 'Microphone permission was denied. Allow the microphone for this site in the browser’s site settings, then try again.',
    'service-not-allowed': 'The browser blocked speech recognition for this page (browser policy, or the speech service is unavailable).',
    'audio-capture': 'No microphone was found. Plug in a microphone and check it is the system’s selected input.',
    network: 'The browser’s speech service could not be reached. Cloud speech needs an internet connection, and Chromium on Raspberry Pi OS may not have access to Google’s speech service at all.',
    'language-not-supported': 'That speech language is not supported by this browser.',
    'restart-failed': 'Wake-phrase listening stopped after repeated failures.',
    'start-failed': 'The microphone could not be started.',
  };

  const explain = (code) => MESSAGES[code] || 'Speech recognition error: ' + code + '.';

  return { matchWake, stripWake, explain };
})();
