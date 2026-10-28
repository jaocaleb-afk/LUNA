/* MathRequest: recognises spoken or typed arithmetic questions and answers them with Arithmetic. Pure, no DOM.

     "What is 25 plus 17?"            -> "25 + 17 = 42"
     "Calculate 144 divided by 12."   -> "144 ÷ 12 = 12"
     "What is 15 percent of 80?"      -> "15% of 80 = 12"
     "What is 10 divided by zero?"    -> "You can’t divide by zero, so 10 ÷ 0 has no answer."

   Two steps:
     1. read(raw)    Is this a calculation at all? If so, rewrite the words as symbols ("25 plus 17" -> "25 + 17").
                     Returns null when the text is not a calculation, so other commands are tried.
     2. answer(expr) Evaluate it and word the reply. The reply is written with symbols for the screen; speech-text.js
                     reads the same sentence aloud ("25 plus 17 equals 42"), so screen and voice always agree.

   A request is a calculation when it starts with "what is / what's / what does / how much is / calculate / compute / work out /
   solve" (or is nothing but a sum, like "8 x 7"), AND it contains a number AND an operator or a percentage.
   So "what is the time" or "set a 5 minute timer" are never taken for sums.                                         */
const MathRequest = (() => {
  const LEAD = /^(?:what is|whats|what s|what does|how much is|calculate|compute|work out|evaluate|solve|tell me)\b\s*/;
  const ANSWER_DECIMALS = 4;

  const UNITS = new Map(Object.entries({
    zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  }));
  const TENS = new Map(Object.entries({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }));
  const SCALES = new Map(Object.entries({ thousand: 1e3, million: 1e6 }));

  /* Operator words, longest first. Each becomes a symbol that Arithmetic understands. */
  const PHRASES = [
    [/\bmultiplied by\b/g, ' * '], [/\btimes\b/g, ' * '], [/\bdivided by\b/g, ' / '], [/\bdivide by\b/g, ' / '],
    [/\bover\b/g, ' / '], [/\bplus\b/g, ' + '], [/\bminus\b/g, ' - '], [/\bnegative\b/g, ' - '],
    [/\bper ?cent\b/g, ' % '], [/\b(?:open|left) (?:bracket|parenthesis)\b/g, ' ( '],
    [/\b(?:close|right) (?:bracket|parenthesis)\b/g, ' ) '],
  ];

  /* ---------- words -> digits ("one hundred and five point two" -> "105.2") ---------- */
  const digitOf = (w) => (UNITS.has(w) && UNITS.get(w) < 10 ? UNITS.get(w) : null);
  function isNumberWord(w) { return UNITS.has(w) || TENS.has(w) || w === 'hundred' || SCALES.has(w); }

  /* Reads one spoken number starting at words[i]. Returns {text, next} or null. Stops at the first word that
     cannot continue the number, so "five five" is two numbers (and Arithmetic then refuses "5 5"). */
  function readNumberWords(words, i) {
    let total = 0;
    let current = 0;
    let used = 0;
    let j = i;
    for (; j < words.length; j++) {
      const w = words[j];
      if (w === 'and' && used && isNumberWord(words[j + 1] || '') && current % 100 === 0) continue;  // "one hundred and five"
      if (UNITS.has(w) && w !== 'oh') {
        const n = UNITS.get(w);
        const fits = used === 0 || current % 100 === 0 || (current % 10 === 0 && current % 100 >= 20 && n < 10);
        if (!fits) break;
        current += n;
      } else if (TENS.has(w)) {
        if (used && current % 100 !== 0) break;
        current += TENS.get(w);
      } else if (w === 'hundred') {
        if (current % 100 === 0 && current !== 0) break;
        current = (current || 1) * 100;
      } else if (SCALES.has(w)) {
        total += (current || 1) * SCALES.get(w);
        current = 0;
      } else break;
      used++;
    }
    if (!used) return null;
    let text = String(total + current);
    if (words[j] === 'point' && digitOf(words[j + 1]) !== null) {   // "three point one four"
      let digits = '';
      j++;
      while (j < words.length && digitOf(words[j]) !== null) digits += digitOf(words[j++]);
      text += '.' + digits;
    }
    return { text, next: j };
  }

  function wordsToDigits(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < words.length;) {
      if (/^\d/.test(words[i]) && words[i + 1] === 'point' && /^\d+$/.test(words[i + 2] || '')) {   // "3 point 5"
        out.push(words[i] + '.' + words[i + 2]);
        i += 3;
        continue;
      }
      const number = readNumberWords(words, i);
      if (number) { out.push(number.text); i = number.next; } else out.push(words[i++]);
    }
    return out.join(' ');
  }

  /* ---------- request text -> expression ---------- */
  function clean(raw) {
    return String(raw || '').toLowerCase()
      .replace(/[’']/g, '')
      .replace(/(\d),(?=\d{3}\b)/g, '$1')                      // "1,000" -> "1000"
      .replace(/([a-z])-(?=[a-z])/g, '$1 ')                    // "twenty-five" -> "twenty five"
      .replace(/[?!,;:]+/g, ' ')
      .replace(/\.(?!\d)/g, ' ')                               // a full stop, but not a decimal point
      .replace(/\s+/g, ' ').trim()
      .replace(/^(?:(?:ok(?:ay)?|hi|hello|hey) )?luna\b ?/, '')
      .replace(/\b(?:please|can you|could you|would you)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function toExpression(words) {
    let text = ' ' + words + ' ';
    PHRASES.forEach(([pattern, symbol]) => { text = text.replace(pattern, symbol); });
    text = wordsToDigits(text)
      .replace(/(\d|\))\s*x\s*(?=[\d(.-])/g, '$1 * ')            // "8 x 7"
      .replace(/\s*(?:=|equals?|is equal to)\s*$/, '');        // a trailing "equals"
    return text.replace(/\s+/g, ' ').trim();
  }

  /* Returns null (not a calculation) | {ok:true, expression} | {ok:false, code:'malformed', error}. */
  function read(raw) {
    const text = clean(raw);
    const lead = LEAD.exec(text);
    const body = lead ? text.slice(lead[0].length) : text;
    const expression = toExpression(body);
    const hasNumber = /\d/.test(expression);
    const hasOperator = /[-+*/%×÷−]/.test(expression);
    if (!hasNumber || !hasOperator) return null;
    // Without a lead word, only something that is nothing BUT a sum counts ("8 x 7"), never a sentence.
    if (!lead && /[a-z]/.test(expression.replace(/\bof\b/g, ''))) return null;
    return { ok: true, expression };
  }

  /* ---------- the reply ---------- */
  function formatNumber(value) {
    const rounded = Number(value.toFixed(ANSWER_DECIMALS));
    const approximate = Math.abs(rounded - value) > 1e-9 * Math.max(1, Math.abs(value));
    const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: ANSWER_DECIMALS }).format(Math.abs(rounded));
    return { text: (rounded < 0 ? '−' : '') + text, approximate };
  }

  const ERRORS = {
    'too-large': 'That number is too big for me to work out exactly.',
    'too-long': 'That calculation is too long for me.',
    default: 'I couldn’t work that out. Try something like “what is 25 plus 17”.',
  };

  /* answer(expression) -> {ok, msg}. msg is the one sentence shown AND spoken. */
  function answer(expression) {
    const result = Arithmetic.evaluate(expression);
    if (!result.ok) {
      if (result.code === 'divide-by-zero') {
        return { ok: false, msg: 'You can’t divide by zero, so ' + Arithmetic.display(result.tokens) + ' has no answer.' };
      }
      return { ok: false, msg: ERRORS[result.code] || ERRORS.default };
    }
    const number = formatNumber(result.value);
    return { ok: true, msg: Arithmetic.display(result.tokens) + (number.approximate ? ' ≈ ' : ' = ') + number.text, value: result.value };
  }

  return { read, answer, formatNumber };
})();
