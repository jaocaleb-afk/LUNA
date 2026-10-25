/* Parser: turns a typed or spoken sentence into an action object.
   Pure function, no DOM. Example: "set a five minute timer" -> {type:'timer.set', seconds:300} */
const Parser = (() => {
  const UNIT_SECONDS = { sec: 1, second: 1, minute: 60, min: 60, hour: 3600, hr: 3600 };
  const MAX_SECONDS = 86400;

  const ONES = new Map(Object.entries({
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  }));
  const TENS = new Map(Object.entries({
    twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  }));
  const UNIT_WORD = /^(hour|minute|min|second|sec)s?$/;

  /* Speech engines sometimes return "five minute" instead of "5 minute".
     Converts number words to digits: "twenty five" -> "25", "a minute" -> "1 minute". */
  function numberWordsToDigits(text) {
    const words = text.replace(/-/g, ' ').split(' ');
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const next = words[i + 1];
      if (TENS.has(word)) {
        let n = TENS.get(word);
        const unit = ONES.get(next);
        if (unit > 0 && unit < 10) { n += unit; i++; }
        out.push(String(n));
      } else if (ONES.has(word)) {
        out.push(String(ONES.get(word)));
      } else if ((word === 'a' || word === 'an') && UNIT_WORD.test(next || '')) {
        out.push('1');
      } else {
        out.push(word);
      }
    }
    return out.join(' ');
  }

  const fail = (error) => ({ ok: false, error });
  const succeed = (action) => ({ ok: true, action });

  function parse(raw) {
    const text = numberWordsToDigits(
      String(raw || '').toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim()
    );
    if (!text) return fail('Type a command, for example “set a 5 minute timer”.');

    let m = text.match(/^(?:set|start)(?: a| an)? (?:timer (?:for|of) )?(\d+) (second|sec|minute|min|hour|hr)s?(?: timer)?$/);
    if (m) {
      const seconds = parseInt(m[1], 10) * UNIT_SECONDS[m[2]];
      if (!(seconds >= 1)) return fail('A timer needs at least 1 second.');
      if (seconds > MAX_SECONDS) return fail('Timers can be up to 24 hours.');
      return succeed({ type: 'timer.set', seconds });
    }

    m = text.match(/^(pause|resume|cancel|reset)(?: the)? timer$/);
    if (m) return succeed({ type: 'timer.' + m[1] });

    if (/^(what time is it|what is the time|whats the time|what time is it now)$/.test(text)) {
      return succeed({ type: 'clock.say' });
    }
    if (/^(go home|go to home|home)$/.test(text)) return succeed({ type: 'nav', screen: 'home' });
    if (/^open (settings|timer|assistant|schedules|backgrounds)$/.test(text)) {
      return succeed({ type: 'nav', screen: text.split(' ')[1] });
    }

    if (/timer/.test(text)) {
      return fail('I couldn’t read that timer command. Try “set a 5 minute timer” or “pause the timer”.');
    }
    return fail('Unsupported command: “' + text + '”.');
  }

  return { parse };
})();
