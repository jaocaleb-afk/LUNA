'use strict';
/* Assistant: runs a parsed command (typed OR spoken) against the app, and mounts the command box
   used on the Assistant and Settings screens. Voice (voice-ui.js) calls Assistant.run() with recognised text. */
const Assistant = (() => {
  const LOG_LIMIT = 5;
  const EXAMPLES = ['Set a 5 minute timer', 'Pause the timer', 'What time is it?', 'Open settings'];

  const say = (ok, msg) => ({ ok, msg });

  function openScreen(action) {
    if (!Nav.go(action.screen)) return say(false, 'Unknown screen.');
    if (action.screen === 'backgrounds') BgUI.enter();
    TimerUI.render();
    return say(true, 'Opened ' + action.screen + '.');
  }

  /* One handler per action type produced by Parser.parse(). Each returns {ok, msg}. */
  const HANDLERS = {
    'timer.set': (a) => TimerEngine.start(a.seconds * 1000),
    'timer.pause': () => TimerEngine.pause(),
    'timer.resume': () => TimerEngine.resume(),
    'timer.cancel': () => TimerEngine.cancel(),
    'timer.reset': () => TimerEngine.reset(),
    'clock.say': () => say(true, 'It is ' + Clock.say() + '.'),
    'nav': openScreen,
  };

  function run(text) {
    const parsed = Parser.parse(text);
    if (!parsed.ok) return say(false, parsed.error);

    const handler = HANDLERS[parsed.action.type];
    if (!handler) return say(false, 'No handler for that action.');

    let result;
    try { result = handler(parsed.action); } catch (e) { result = say(false, 'That action failed.'); }
    if (result.ok && parsed.action.type === 'timer.set') {
      result.msg = 'Timer set for ' + fmt(parsed.action.seconds * 1000) + '.';
    }
    return result;
  }

  function mount(root) {
    root.innerHTML =
      '<form class="cmd"><input aria-label="Command" placeholder="Type a command" autocomplete="off">' +
      '<button class="btn pri">Run</button></form><div class="row" style="margin-top:10px"></div><ul class="log"></ul>';
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
