/* DurationParser: reads a spoken or typed duration and returns an exact number of seconds. Pure, no DOM.

     "3 hours, 2 minutes, and 19 seconds"   -> 10939
     "a five-minute"  "half an hour"  "an hour and a half"  "1.5 hours"  "5m 30s"

   It does not guess. Anything it cannot read with certainty is rejected with an explanation,
   so a misheard command never silently becomes a different timer:
     a number without a unit ("5", "5 minutes and 30"), the same unit twice, a range ("10 to 15 minutes"),
     a clock-style "1:30" (minutes or hours?), vague words ("a few minutes"), negative values,
     fractions that do not come to whole seconds, zero, and anything over MAX_SECONDS.

   DurationParser.read(text)        -> {ok:true, seconds, parts:{hour, minute, second}} | {ok:false, code, error}
   DurationParser.mentions(text)    -> true if the text contains anything duration-like (a number or a unit)
   DurationParser.words(seconds)    -> "3 hours, 2 minutes, and 19 seconds" (used for both the screen and speech) */
const DurationParser = (() => {
  const MAX_SECONDS = 24 * 3600;
  const UNIT_SECONDS = { hour: 3600, minute: 60, second: 1 };
  const UNIT_ALIASES = {
    hour: ['h', 'hr', 'hrs', 'hour', 'hours'],
    minute: ['m', 'min', 'mins', 'minute', 'minutes'],
    second: ['s', 'sec', 'secs', 'second', 'seconds'],
  };
  const UNIT_OF = new Map();
  Object.entries(UNIT_ALIASES).forEach(([unit, names]) => names.forEach((n) => UNIT_OF.set(n, unit)));

  const SMALL = new Map(Object.entries({
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  }));
  const TENS = new Map(Object.entries({
    twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  }));
  const VAGUE = new Set(['few', 'couple', 'several', 'some', 'many', 'bit', 'while', 'little']);
  const FRACTIONS = new Set(['quarter', 'quarters', 'third', 'thirds', 'fifth', 'fifths']);
  const RANGE_WORDS = new Set(['to', 'or', 'through', 'between']);

  const MESSAGES = {
    missing: 'How long should the timer be? For example, “set a timer for 10 minutes”.',
    'no-unit': 'I heard a number without a unit. Say hours, minutes or seconds, for example “5 minutes and 30 seconds”.',
    'no-number': 'I heard a unit but not how many. For example, “set a timer for 10 minutes”.',
    'repeated-unit': 'I heard the same unit twice, so I am not sure how long you mean. Say each unit once.',
    range: 'Please give one duration, not a range.',
    colon: 'I can’t tell whether that means minutes or hours. Say the units, for example “1 minute 30 seconds”.',
    vague: 'Please say an exact duration, for example “3 minutes”.',
    fraction: 'I can only use “half” as a fraction. Try minutes instead, for example “15 minutes”.',
    negative: 'A timer can’t be negative.',
    'not-whole': 'That doesn’t come to a whole number of seconds. Try whole minutes and seconds.',
    'too-short': 'A timer needs at least 1 second.',
    'too-long': 'Timers can be up to 24 hours.',
  };
  const failure = (code) => ({ ok: false, code, error: MESSAGES[code] });

  /* ---------- step 1: text -> words ---------- */
  function splitWords(raw) {
    return String(raw || '').toLowerCase()
      .replace(/[’']/g, '')
      .replace(/(\d),(\d{3})\b/g, '$1$2')          // "1,000" -> "1000"
      .replace(/(\d)\.(\d)/g, '$1§$2')               // protect decimal points ...
      .replace(/[^a-z0-9§\s]/g, ' ')                 // ... drop all other punctuation, including hyphens
      .replace(/§/g, '.')
      .replace(/(\d)([a-z])/g, '$1 $2')              // "10min" -> "10 min", "5m30s" -> "5 m30s"
      .replace(/([a-z])(\d)/g, '$1 $2')              //                       -> "5 m 30 s"
      .split(/\s+/).filter(Boolean);
  }

  /* A number as an exact fraction {num, den}, so 1.5 hours is 5400 seconds with no floating-point error. */
  function digitsValue(word) {
    const m = /^(\d{1,6})(?:\.(\d{1,3}))?$/.exec(word);
    if (!m) return null;
    const decimals = m[2] || '';
    return { num: Number(m[1] + decimals), den: 10 ** decimals.length };
  }

  /* Reads number words starting at words[i] ("twenty five", "one hundred and five"). Returns {value, next} or null. */
  function readBelowHundred(words, i) {
    const w = words[i];
    if (TENS.has(w)) {
      const ones = SMALL.get(words[i + 1]);
      return ones > 0 && ones < 10 ? { value: TENS.get(w) + ones, next: i + 2 } : { value: TENS.get(w), next: i + 1 };
    }
    if (SMALL.has(w)) return { value: SMALL.get(w), next: i + 1 };
    return null;
  }

  function readNumberWords(words, i) {
    const first = readBelowHundred(words, i);
    if (!first || words[first.next] !== 'hundred') return first;
    let value = first.value * 100;
    let next = first.next + 1;
    const skipAnd = words[next] === 'and' && readBelowHundred(words, next + 1) ? 1 : 0;
    const rest = readBelowHundred(words, next + skipAnd);
    if (rest) { value += rest.value; next = rest.next; }
    return { value, next };
  }

  /* ---------- step 2: words -> tokens  {kind:'number', value:{num,den}} | {kind:'unit', unit} | {kind:'word', word} ---------- */
  function tokenize(words) {
    const tokens = [];
    for (let i = 0; i < words.length;) {
      const w = words[i];
      const digits = digitsValue(w);
      if (digits) { tokens.push({ kind: 'number', value: digits }); i++; continue; }
      if (/^\d/.test(w)) return { error: 'too-long' };          // more than 6 digits, or several decimal places
      const spoken = readNumberWords(words, i);
      if (spoken) { tokens.push({ kind: 'number', value: { num: spoken.value, den: 1 } }); i = spoken.next; continue; }
      if (UNIT_OF.has(w)) tokens.push({ kind: 'unit', unit: UNIT_OF.get(w) });
      else tokens.push({ kind: 'word', word: w });
      i++;
    }
    return { tokens };
  }

  const isWord = (t, ...words) => t && t.kind === 'word' && words.includes(t.word);
  const isArticle = (t) => isWord(t, 'a', 'an');
  const plusHalf = (v) => ({ num: v.num * 2 + v.den, den: v.den * 2 });
  const ONE = { num: 1, den: 1 };
  const HALF = { num: 1, den: 2 };

  /* ---------- step 3: tokens -> {hour, minute, second} as exact fractions ---------- */
  function collectParts(tokens) {
    const parts = {};
    let lastUnit = null;
    const add = (unit, value) => {
      if (unit in parts) return 'repeated-unit';
      parts[unit] = value;
      lastUnit = unit;
      return null;
    };

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const next = tokens[i + 1];
      let problem = null;

      if (t.kind === 'number') {
        let value = t.value;
        let j = i + 1;
        // "one and a half hours"
        if (isWord(tokens[j], 'and') && isArticle(tokens[j + 1]) && isWord(tokens[j + 2], 'half')) { value = plusHalf(value); j += 3; }
        if (!tokens[j] || tokens[j].kind !== 'unit') {
          return isWord(tokens[j], ...RANGE_WORDS) ? 'range' : 'no-unit';
        }
        problem = add(tokens[j].unit, value);
        i = j;
      } else if (isArticle(t) && next && next.unit === 'second' && isWord(tokens[i + 2], 'timer', 'countdown')) {
        i++;                                                            // "a second timer" means another timer, not 1 s
      } else if (isArticle(t) && next && next.kind === 'unit') {        // "a minute", "an hour"
        problem = add(next.unit, ONE);
        i++;
      } else if (isWord(t, 'half')) {
        const afterUnit = tokens[i - 3] && tokens[i - 3].kind === 'unit';
        if (lastUnit && afterUnit && isWord(tokens[i - 1], 'a') && isWord(tokens[i - 2], 'and')) {   // "an hour and a half"
          parts[lastUnit] = plusHalf(parts[lastUnit]);
          lastUnit = null;
          continue;
        }
        const k = isArticle(next) ? i + 2 : i + 1;                      // "half an hour", "half hour"
        if (!tokens[k] || tokens[k].kind !== 'unit') return 'fraction';
        problem = add(tokens[k].unit, HALF);
        i = k;
      } else if (t.kind === 'unit') {
        return 'no-number';
      } else if (VAGUE.has(t.word)) {
        return 'vague';
      } else if (FRACTIONS.has(t.word)) {
        return 'fraction';
      } else if (isWord(t, 'minus', 'negative')) {
        return 'negative';
      }
      if (problem) return problem;
    }
    return parts;
  }

  /* ---------- public ---------- */
  function read(raw) {
    const text = String(raw || '');
    if (/(^|[^\w])[-−]\s*\d/.test(text)) return failure('negative');
    if (/\d\s*:\s*\d/.test(text)) return failure('colon');

    const { tokens, error } = tokenize(splitWords(text));
    if (error) return failure(error);
    const parts = collectParts(tokens);
    if (typeof parts === 'string') return failure(parts);
    if (!Object.keys(parts).length) return failure('missing');

    let seconds = 0;
    const whole = {};
    for (const unit of Object.keys(UNIT_SECONDS)) {
      const value = parts[unit] || { num: 0, den: 1 };
      const scaled = value.num * UNIT_SECONDS[unit];
      if (scaled % value.den !== 0) return failure('not-whole');
      whole[unit] = scaled / value.den / UNIT_SECONDS[unit];
      seconds += scaled / value.den;
    }
    if (seconds > MAX_SECONDS) return failure('too-long');
    if (seconds < 1) return failure('too-short');
    return { ok: true, seconds, parts: whole };
  }

  function mentions(raw) {
    const words = splitWords(raw);
    return words.some((w) => /^\d/.test(w) || UNIT_OF.has(w) || SMALL.has(w) || TENS.has(w) || w === 'half');
  }

  /* 10939 -> "3 hours, 2 minutes, and 19 seconds";  4500 -> "1 hour and 15 minutes";  0 -> "0 seconds" */
  function words(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const amounts = [[Math.floor(s / 3600), 'hour'], [Math.floor((s % 3600) / 60), 'minute'], [s % 60, 'second']];
    const named = amounts.filter(([n]) => n > 0).map(([n, unit]) => n + ' ' + unit + (n === 1 ? '' : 's'));
    if (!named.length) return '0 seconds';
    if (named.length === 1) return named[0];
    if (named.length === 2) return named[0] + ' and ' + named[1];
    return named[0] + ', ' + named[1] + ', and ' + named[2];
  }

  return { read, mentions, words, MAX_SECONDS, MESSAGES };
})();
