/* SpeechText: turns a reply written for the SCREEN into the same sentence written for a VOICE. Pure, no DOM.

   Replies are written once, for the screen. Speech engines read some of that badly: "LUNA" spelled out letter by
   letter, symbols like × or ≈ skipped or read as their Unicode names, quotation marks, arrows, dashes.
   This rewrites only those things, so the spoken words always say what the screen says:

     "25 + 17 = 42"                 -> "25 plus 17 equals 42."
     "−5 × (2 + 1) = −15"           -> "negative 5 times 2 plus 1, equals negative 15."
     "1 ÷ 3 ≈ 0.3333"               -> "1 divided by 3 is about 0.3333."
     "15% of 80 = 12"               -> "15 percent of 80 equals 12."
     "Try “set a 5 minute timer”."  -> "Try set a 5 minute timer."
   A missing full stop is added, which gives most engines a natural falling ending instead of a clipped one. */
const SpeechText = (() => {
  const RULES = [
    [/\bLUNA\b/g, 'Luna'],
    [/[“”"]/g, ''],
    [/\s*(?:→|—|–)\s*/g, ', '],
    [/…/g, '.'],
    [/(^|[\s(])[−-](?=\d)/g, '$1negative '],       // a minus sign in front of a number
    [/\s+[−-]\s+/g, ' minus '],
    [/\s*\+\s*/g, ' plus '],
    [/\s*×\s*/g, ' times '],
    [/\s*÷\s*/g, ' divided by '],
    [/\s*≈\s*/g, ' is about '],
    [/\s*=\s*/g, ' equals '],
    [/(\d)%/g, '$1 percent'],
    [/\(\s*/g, ''],                                  // "(2 + 1) × 3": a pause after the group keeps the meaning
    [/\s*\)/g, ','],
    [/,\s*([.,!?])/g, '$1'],
    [/,(?=[^\s\d])/g, ', '],                        // but keep "1,000" whole
    [/\s+/g, ' '],
  ];

  function toSpeech(text) {
    let spoken = String(text || '').trim();
    RULES.forEach(([pattern, replacement]) => { spoken = spoken.replace(pattern, replacement); });
    spoken = spoken.trim().replace(/,$/, '');
    if (spoken && !/[.!?]$/.test(spoken)) spoken += '.';
    return spoken;
  }

  return { toSpeech };
})();
