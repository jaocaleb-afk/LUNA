const a = require('assert');
const { test } = require('./harness');
const { Parser } = require('./load');

const action = (text) => {
  const r = Parser.parse(text);
  a.ok(r.ok, 'expected "' + text + '" to parse, got: ' + r.error);
  return r.action;
};
const seconds = (text) => {
  const act = action(text);
  a.strictEqual(act.type, 'timer.set', text);
  return act.seconds;
};
const rejected = (text) => {
  const r = Parser.parse(text);
  a.ok(!r.ok, 'expected "' + text + '" to be rejected');
  return r.error;
};

test('commands: the brief\'s timer-creation examples', () => {
  a.strictEqual(seconds('Set a timer for 10 minutes.'), 600);
  a.strictEqual(seconds('Set a 10-minute timer.'), 600);
  a.strictEqual(seconds('Start a timer for 30 seconds.'), 30);
  a.strictEqual(seconds('Set a timer for 2 hours.'), 7200);
  a.strictEqual(seconds('Set a timer for 3 hours, 2 minutes, and 19 seconds.'), 10939);
  a.strictEqual(seconds('Set a 3 hour, 2 minute, 19 second timer.'), 10939);
  a.strictEqual(seconds('Start a countdown for 1 hour and 15 minutes.'), 4500);
  a.strictEqual(seconds('I need a timer for 45 minutes and 12 seconds.'), 2712);
  a.strictEqual(seconds('Give me a five-minute timer.'), 300);
  a.strictEqual(seconds('Start a timer for 0 hours, 3 minutes, and 5 seconds.'), 185);
});

test('commands: addressing LUNA and "please" are ignored (this is not a wake phrase)', () => {
  a.strictEqual(seconds('LUNA, set a timer for 10 minutes.'), 600);
  a.strictEqual(seconds('Luna please set a timer for ten minutes'), 600);
  a.strictEqual(seconds('Could you please start a 90 second countdown'), 90);
});

test('commands: the brief\'s timer-checking examples', () => {
  for (const text of ['How much time is left?', 'How long is left on my timer?', 'Check the timer.', 'Tell me the remaining time.',
    'what\'s left on the timer', 'time left']) {
    a.deepStrictEqual(action(text), { type: 'timer.status', ask: 'remaining', target: 'any' }, text);
  }
  a.deepStrictEqual(action('When will my timer finish?'), { type: 'timer.status', ask: 'finish', target: 'any' });
  a.deepStrictEqual(action('What time will the timer be done?'), { type: 'timer.status', ask: 'finish', target: 'any' });
  a.deepStrictEqual(action('How much screen time is left?'), { type: 'timer.status', ask: 'remaining', target: 'screentime' });
});

test('commands: pause / resume / cancel / reset in natural wording', () => {
  a.deepStrictEqual(action('pause the timer'), { type: 'timer.pause', target: 'any' });
  a.deepStrictEqual(action('Can you pause my timer please'), { type: 'timer.pause', target: 'any' });
  a.deepStrictEqual(action('resume the timer'), { type: 'timer.resume', target: 'any' });
  a.deepStrictEqual(action('continue'), { type: 'timer.resume', target: 'any' });
  a.deepStrictEqual(action('Cancel that timer.'), { type: 'timer.cancel', target: 'any' });
  a.deepStrictEqual(action('stop the countdown'), { type: 'timer.cancel', target: 'any' });
  a.deepStrictEqual(action('turn off the timer'), { type: 'timer.cancel', target: 'any' });
  a.deepStrictEqual(action('reset the timer'), { type: 'timer.reset', target: 'any' });
  a.deepStrictEqual(action('cancel the screen time timer'), { type: 'timer.cancel', target: 'screentime' });
  a.deepStrictEqual(action('stop screen time'), { type: 'timer.cancel', target: 'screentime' });
  a.ok(!Parser.parse('stop talking about the weather').ok, 'a control verb inside an unrelated sentence is not a command');
  a.deepStrictEqual(action('stop the music and set a timer for 5 minutes'), { type: 'timer.set', seconds: 300 },
    'extra words mean it is not a plain "stop the timer"');
});

test('commands: existing commands still work', () => {
  a.deepStrictEqual(action('Set a 5 minute timer'), { type: 'timer.set', seconds: 300 });
  a.deepStrictEqual(action('What time is it?'), { type: 'clock.say' });
  a.deepStrictEqual(action('what is the time'), { type: 'clock.say' });
  a.deepStrictEqual(action('go home'), { type: 'nav', screen: 'home' });
  a.deepStrictEqual(action('Open settings'), { type: 'nav', screen: 'settings' });
  a.deepStrictEqual(action('open the schedules screen'), { type: 'nav', screen: 'schedules' });
  a.deepStrictEqual(action('open screen time'), { type: 'nav', screen: 'screentime' });
});

test('commands: invalid timer requests explain themselves instead of guessing', () => {
  a.ok(/How long/.test(rejected('set a timer')));
  a.ok(/without a unit/.test(rejected('set a timer for 5')));
  a.ok(/same unit twice/.test(rejected('set a timer for 5 minutes and 3 minutes')));
  a.ok(/24 hours/.test(rejected('set a timer for 30 hours')));
  a.ok(/negative/.test(rejected('set a timer for minus 5 minutes')));
  a.ok(/minutes or hours/.test(rejected('set a timer for 1:30')));
  a.ok(/exact duration/.test(rejected('set a timer for a few minutes')));
  a.ok(/Start button/.test(rejected('start screen time for 20 minutes')), 'Screen Time is never started by the ordinary timer');
  a.ok(/Unsupported/.test(rejected('make me a sandwich')));
});
