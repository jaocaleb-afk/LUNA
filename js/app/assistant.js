'use strict';
/* Assistant: runs a parsed command (typed OR spoken) against the app, and mounts the command box
   used on the Assistant and Settings screens. Voice (voice-ui.js) calls Assistant.run() with recognised text.
   Timer commands are answered by TimerReplies (timer-replies.js), which also knows about the Screen Time Timer;
   calculations by MathRequest (core/math-request.js).

   run(text) -> {ok, msg, kind}. msg is shown on screen and, for voice, spoken. kind says how it went:
     done         the command ran
     invalid      a supported command LUNA could not carry out as asked; msg says why or asks a question
     unsupported  understood, but not something LUNA does this way
     unknown      not recognised as a command at all
   Voice uses kind to choose its reply to misunderstood commands (miss-counter.js). */
const Assistant = (() => {
  const LOG_LIMIT = 5;
  const EXAMPLES = ['Set a 5 minute timer', 'Set a timer for 1 hour and 15 minutes', 'How much time is left?', 'Pause the timer',
    'What is 12 plus 6 times 3?', 'What is 15 percent of 80?', 'What time is it?', 'Open settings'];
  const SCREEN_NAMES = { screentime: 'Screen Time' };

  const say = (ok, msg) => ({ ok, msg });

  function openScreen(action) {
    if (!Nav.go(action.screen)) return say(false, 'Unknown screen.');
    if (action.screen === 'backgrounds') BgUI.enter();
    TimerUI.render();
    return say(true, 'Opening ' + (SCREEN_NAMES[action.screen] || action.screen) + '.');
  }

  /* One handler per action type produced by Parser.parse(). Each returns {ok, msg}. */
  const HANDLERS = {
    'timer.set': (a) => TimerReplies.set(a),
    'timer.status': (a) => TimerReplies.status(a),
    'timer.pause': (a) => TimerReplies.control(a),
    'timer.resume': (a) => TimerReplies.control(a),
    'timer.cancel': (a) => TimerReplies.control(a),
    'timer.reset': (a) => TimerReplies.control(a),
    'clock.say': () => say(true, 'It’s ' + Clock.say() + '.'),
    'math': (a) => MathRequest.answer(a.expression),
    'nav': openScreen,
  };

  function run(text) {
    const parsed = Parser.parse(text);
    if (!parsed.ok) return { ok: false, msg: parsed.error, kind: parsed.kind || 'invalid' };

    const handler = HANDLERS[parsed.action.type];
    if (!handler) return { ok: false, msg: 'No handler for that action.', kind: 'unknown' };

    let result;
    try { result = handler(parsed.action); } catch (e) { console.error(e); result = say(false, 'That action failed.'); }
    return { ok: !!result.ok, msg: result.msg, kind: result.ok ? 'done' : 'invalid' };
  }

  function mount(root) {
    root.innerHTML =
      '<form class="cmd"><input aria-label="Command" placeholder="Type a command" autocomplete="off">' +
      '<button class="btn pri">Run</button></form><div class="row chips" style="margin-top:8px"></div><ul class="log"></ul>';
    const form = $('form', root);
    const input = $('input', root);
    const log = $('.log', root);

    EXAMPLES.forEach((example) => {
      $('.row', root).append(H('button', {
        type: 'button', className: 'btn', textContent: example,
        onclick: () => { input.value = example; form.requestSubmit(); },
      }));
    });

    form.onsubmit = (e) => {
      e.preventDefault();
      const text = input.value;
      if (!text.trim()) return;
      const result = run(text);
      log.prepend(H('li', { className: result.ok ? '' : 'err', textContent: '“' + text + '” → ' + result.msg }));
      while (log.children.length > LOG_LIMIT) log.lastChild.remove();
      input.value = '';
    };
  }

  return { run, mount };
})();
