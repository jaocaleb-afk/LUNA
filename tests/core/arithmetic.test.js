const a = require('assert');
const { test } = require('./harness');
const { Arithmetic, MathRequest, Parser } = require('./load');

const value = (expr) => {
  const r = Arithmetic.evaluate(expr);
  a.ok(r.ok, 'expected "' + expr + '" to evaluate, got ' + r.code);
  return r.value;
};
const code = (expr) => {
  const r = Arithmetic.evaluate(expr);
  a.ok(!r.ok, 'expected "' + expr + '" to be refused, got ' + r.value);
  return r.code;
};
const reply = (text) => {
  const parsed = Parser.parse(text);
  a.ok(parsed.ok && parsed.action.type === 'math', 'expected "' + text + '" to be a calculation: ' + JSON.stringify(parsed));
  return MathRequest.answer(parsed.action.expression);
};

/* ---------- Arithmetic: the expression evaluator ---------- */
test('arithmetic: + − × ÷', () => {
  a.strictEqual(value('25 + 17'), 42);
  a.strictEqual(value('20 - 35'), -15);
  a.strictEqual(value('8 * 7'), 56);
  a.strictEqual(value('144 / 12'), 12);
  a.strictEqual(value('8 × 7 ÷ 4 − 1'), 13);
});

test('arithmetic: order of operations and left-to-right', () => {
  a.strictEqual(value('12 + 6 * 3'), 30);
  a.strictEqual(value('2 + 3 * 4 - 6 / 2'), 11);
  a.strictEqual(value('100 / 10 / 2'), 5);
  a.strictEqual(value('10 - 4 - 3'), 3);
});

test('arithmetic: parentheses, including nested', () => {
  a.strictEqual(value('(12 + 6) * 3'), 54);
  a.strictEqual(value('2 * (3 + (4 - 1))'), 12);
  a.strictEqual(value('((((7))))'), 7);
});

test('arithmetic: decimals', () => {
  a.strictEqual(value('1.5 * 4'), 6);
  a.strictEqual(value('.5 + .25'), 0.75);
  a.ok(Math.abs(value('0.1 + 0.2') - 0.3) < 1e-12);
});

test('arithmetic: negative numbers (unary minus)', () => {
  a.strictEqual(value('-5 + 2'), -3);
  a.strictEqual(value('-5 * -3'), 15);
  a.strictEqual(value('4 - -2'), 6);
  a.strictEqual(value('-(2 + 3)'), -5);
  a.strictEqual(value('-2 * 3'), -6);
  a.ok(Object.is(value('0 * -5'), 0), 'no "-0"');
});

test('arithmetic: percentages', () => {
  a.strictEqual(value('15% of 80'), 12);
  a.strictEqual(value('50%'), 0.5);
  a.strictEqual(value('200 * 10%'), 20);
  a.strictEqual(value('25% of 80 + 5'), 25);
});

test('arithmetic: division by zero is an error, never Infinity or NaN', () => {
  a.strictEqual(code('10 / 0'), 'divide-by-zero');
  a.strictEqual(code('0 / 0'), 'divide-by-zero');
  a.strictEqual(code('5 / (3 - 3)'), 'divide-by-zero');
  a.strictEqual(code('1 / 0.0'), 'divide-by-zero');
});

test('arithmetic: malformed expressions are refused', () => {
  ['5 +', '* 5', '(1 + 2', '1 + 2)', '5 5', '()', '3 + * 4', '%', '2 (3)', '5 % 5'].forEach((expr) =>
    a.strictEqual(code(expr), 'syntax', expr));
  a.strictEqual(code('1..2'), 'bad-token');
});

test('arithmetic: only arithmetic tokens are accepted (no code can run)', () => {
  ['alert(1)', '2 ** 3', 'Math.PI', '1; 2', 'x', '1e3', 'constructor', '5 of 80', '2 ^ 3'].forEach((expr) => {
    const r = Arithmetic.evaluate(expr);
    a.ok(!r.ok && ['bad-token', 'syntax'].includes(r.code), expr + ' -> ' + JSON.stringify(r.code));
  });
  a.strictEqual(code(''), 'empty');
});

test('arithmetic: limits (too long, too deep, too large)', () => {
  a.strictEqual(code('1 + '.repeat(60) + '1'), 'too-long');
  a.strictEqual(code('('.repeat(30) + '1' + ')'.repeat(30)), 'too-long');
  a.strictEqual(code('99999999 * 99999999'), 'too-large');
  a.strictEqual(code('1234567890123456'), 'too-large');
});

test('arithmetic: display() writes the calculation with typeset symbols', () => {
  const show = (expr) => Arithmetic.display(Arithmetic.evaluate(expr).tokens);
  a.strictEqual(show('12+6*3'), '12 + 6 × 3');
  a.strictEqual(show('-5 * (2 + 1)'), '−5 × (2 + 1)');
  a.strictEqual(show('15 % of 80'), '15% of 80');
  a.strictEqual(show('20 - -35'), '20 − −35');
  a.strictEqual(show('144/12'), '144 ÷ 12');
});

/* ---------- MathRequest + Parser: natural requests ---------- */
test('math: the brief\'s examples, as voice or typed requests', () => {
  a.strictEqual(reply('Hey Luna, what is 25 plus 17?').msg, '25 + 17 = 42');
  a.strictEqual(reply('Calculate 144 divided by 12.').msg, '144 ÷ 12 = 12');
  a.strictEqual(reply('What is 8 times 7?').msg, '8 × 7 = 56');
  a.strictEqual(reply('What is 15 percent of 80?').msg, '15% of 80 = 12');
  a.strictEqual(reply('Calculate 12 plus 6 times 3.').msg, '12 + 6 × 3 = 30');
  a.strictEqual(reply('What is 20 minus 35?').msg, '20 − 35 = −15');
  const zero = reply('What is 10 divided by zero?');
  a.ok(!zero.ok && zero.msg === 'You can’t divide by zero, so 10 ÷ 0 has no answer.', zero.msg);
});

test('math: what a speech recogniser types (symbols, "x", thousands commas)', () => {
  a.strictEqual(reply('what is 25 + 17').msg, '25 + 17 = 42');
  a.strictEqual(reply('What is 8 x 7?').msg, '8 × 7 = 56');
  a.strictEqual(reply('what\'s 1,000 times 3').msg, '1000 × 3 = 3,000');
  a.strictEqual(reply('What is 15% of 80?').msg, '15% of 80 = 12');
  a.strictEqual(reply('144 / 12').msg, '144 ÷ 12 = 12');
});

test('math: number words, decimals, negatives and brackets in words', () => {
  a.strictEqual(reply('what is twenty-five plus seventeen').msg, '25 + 17 = 42');
  a.strictEqual(reply('what is one hundred and five minus five').msg, '105 − 5 = 100');
  a.strictEqual(reply('what is three point five times two').msg, '3.5 × 2 = 7');
  a.strictEqual(reply('what is 2.5 times 4').msg, '2.5 × 4 = 10');
  a.strictEqual(reply('what is negative 5 times 3').msg, '−5 × 3 = −15');
  a.strictEqual(reply('calculate open bracket 12 plus 6 close bracket times 3').msg, '(12 + 6) × 3 = 54');
  a.strictEqual(reply('what is 7 multiplied by 6').msg, '7 × 6 = 42');
  a.strictEqual(reply('how much is two thousand five hundred divided by 5').msg, '2500 ÷ 5 = 500');
});

test('math: answers are rounded sensibly and marked when approximate', () => {
  a.strictEqual(reply('what is 0.1 plus 0.2').msg, '0.1 + 0.2 = 0.3');
  a.strictEqual(reply('what is 1 divided by 3').msg, '1 ÷ 3 ≈ 0.3333');
  a.strictEqual(reply('what is 2 divided by 3').msg, '2 ÷ 3 ≈ 0.6667');
  a.strictEqual(reply('what is 1 divided by 8').msg, '1 ÷ 8 = 0.125');
  a.strictEqual(reply('what is 1234 times 1000').msg, '1234 × 1000 = 1,234,000');
});

test('math: malformed requests get a short, helpful reply', () => {
  const r = reply('what is 5 plus');
  a.ok(!r.ok && /couldn’t work that out/.test(r.msg), r.msg);
  const words = reply('what is 5 plus banana');
  a.ok(!words.ok && /couldn’t work that out/.test(words.msg), words.msg);
  a.ok(/too big/.test(reply('what is 99999999 times 99999999').msg));
});

test('math: other commands and questions are NOT taken for sums', () => {
  a.strictEqual(Parser.parse('set a timer for 5 minutes').action.type, 'timer.set');
  a.strictEqual(Parser.parse('what time is it').action.type, 'clock.say');
  a.strictEqual(Parser.parse('how much time is left').action.type, 'timer.status');
  a.strictEqual(Parser.parse('Set a 3 hour, 2 minute, 19 second timer').action.seconds, 10939);
  a.strictEqual(MathRequest.read('what is the weather'), null);
  a.strictEqual(MathRequest.read('what is 5'), null);
  a.strictEqual(MathRequest.read('open settings'), null);
  a.strictEqual(MathRequest.read('set a timer for 5 - 10 minutes'), null);
  const weather = Parser.parse('what is the weather');
  a.ok(!weather.ok && weather.kind === 'unknown');
});
