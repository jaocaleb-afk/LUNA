/* Arithmetic: a small, safe calculator. Pure, no DOM.

   It never uses eval() or Function(). The text is split into tokens, and ONLY these are accepted:
     numbers        12   3.5   .5
     operators      +  -  *  /   (also the typeset forms × ÷ − –)
     parentheses    (  )
     percent        %    postfix: "15%" is 0.15
     of             only straight after a percent: "15% of 80" is 15% × 80
   Anything else (letters, other symbols) is refused, so nothing a person says can run as code.

   Grammar, with the usual precedence (× ÷ before + −, left to right; a leading minus applies to the number after it):
     expression := term (('+' | '-') term)*
     term       := signed (('*' | '/' | 'of') signed)*
     signed     := ('-' | '+') signed | percent
     percent    := primary '%'*
     primary    := number | '(' expression ')'

   Arithmetic.evaluate('12 + 6 * 3') -> {ok:true, value:30, tokens}
   Arithmetic.evaluate('10 / 0')     -> {ok:false, code:'divide-by-zero', tokens}
   Arithmetic.display(tokens)        -> '12 + 6 × 3'   (how the calculation is written on screen)
   Failure codes: empty, bad-token, syntax, divide-by-zero, too-long, too-large                                     */
const Arithmetic = (() => {
  const MAX_TOKENS = 80;
  const MAX_DEPTH = 20;            // nested parentheses
  const MAX_DIGITS = 15;           // per number, so every input is exactly representable
  const MAX_MAGNITUDE = 1e15;      // results beyond this are refused rather than shown imprecisely

  const SYMBOLS = { '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '/': '/', '÷': '/', '(': '(', ')': ')', '%': '%' };

  /* A failure travels up through the recursive parser as a thrown {code}; evaluate() turns it into a result. */
  const stop = (code) => { throw { arithmetic: code }; };

  /* ---------- text -> tokens ---------- */
  function tokenize(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      const rest = text.slice(i);
      const space = /^\s+/.exec(rest);
      if (space) { i += space[0].length; continue; }

      const number = /^(\d+(?:\.\d+)?|\.\d+)/.exec(rest);
      if (number) {
        if (number[1].replace('.', '').length > MAX_DIGITS) stop('too-large');
        tokens.push({ type: 'num', value: Number(number[1]), text: number[1] });
        i += number[1].length;
        continue;
      }
      if (/^of\b/.test(rest)) {
        const previous = tokens[tokens.length - 1];
        if (!previous || previous.value !== '%') stop('bad-token');     // "of" only as in "15% of 80"
        tokens.push({ type: 'op', value: 'of' });
        i += 2;
        continue;
      }
      const symbol = SYMBOLS[text[i]];
      if (!symbol) stop('bad-token');
      tokens.push({ type: 'op', value: symbol });
      i += 1;
    }
    if (!tokens.length) stop('empty');
    if (tokens.length > MAX_TOKENS) stop('too-long');
    return tokens;
  }

  /* ---------- tokens -> value (recursive descent) ---------- */
  function calculate(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const isOp = (value) => peek() && peek().type === 'op' && peek().value === value;
    const checked = (value) => (Number.isFinite(value) && Math.abs(value) < MAX_MAGNITUDE ? value : stop('too-large'));

    function expression(depth) {
      let value = term(depth);
      while (isOp('+') || isOp('-')) {
        const op = tokens[pos++].value;
        const right = term(depth);
        value = checked(op === '+' ? value + right : value - right);
      }
      return value;
    }

    function term(depth) {
      let value = signed(depth);
      while (isOp('*') || isOp('/') || isOp('of')) {
        const op = tokens[pos++].value;
        const right = signed(depth);
        if (op === '/' && right === 0) stop('divide-by-zero');
        value = checked(op === '/' ? value / right : value * right);
      }
      return value;
    }

    function signed(depth) {
      if (isOp('-')) { pos++; return -signed(depth); }
      if (isOp('+')) { pos++; return signed(depth); }
      let value = primary(depth);
      while (isOp('%')) { pos++; value /= 100; }
      return value;
    }

    function primary(depth) {
      const token = peek();
      if (!token) stop('syntax');                        // ended too early: "5 +"
      if (token.type === 'num') { pos++; return token.value; }
      if (token.value !== '(') stop('syntax');           // e.g. "* 5" or ")"
      if (depth >= MAX_DEPTH) stop('too-long');
      pos++;
      const value = expression(depth + 1);
      if (!isOp(')')) stop('syntax');                    // missing ")"
      pos++;
      return value;
    }

    const value = expression(0);
    if (pos !== tokens.length) stop('syntax');           // leftovers: "5 5", "(1) 2", "3 )"
    return value === 0 ? 0 : value;                      // no "-0"
  }

  function evaluate(text) {
    let tokens = [];
    try {
      tokens = tokenize(String(text || ''));
      return { ok: true, value: calculate(tokens), tokens };
    } catch (e) {
      if (e && e.arithmetic) return { ok: false, code: e.arithmetic, tokens };
      throw e;
    }
  }

  /* ---------- tokens -> readable text ("12 + 6 × 3", "−5 × (2 + 1)", "15% of 80") ---------- */
  const SHOWN = { '+': '+', '-': '−', '*': '×', '/': '÷', of: 'of' };

  function display(tokens) {
    let out = '';
    let previous = null;
    for (const token of tokens) {
      const unaryMinus = token.value === '-' && (!previous || (previous.type === 'op' && !['%', ')'].includes(previous.value)));
      if (token.type === 'num') out += token.text;
      else if (token.value === '(') out += '(';
      else if (token.value === ')' || token.value === '%') out = out.trimEnd() + token.value + ' ';
      else if (unaryMinus) out += '−';
      else out = out.trimEnd() + ' ' + SHOWN[token.value] + ' ';
      if (token.type === 'num') out += ' ';
      previous = token;
    }
    return out.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ').trim();
  }

  return { evaluate, display, MAX_MAGNITUDE };
})();
