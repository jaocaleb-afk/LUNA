/* Parser: turns a typed or spoken sentence into an action object. Pure function, no DOM.

     "set a five minute timer"                 -> {type:'timer.set', seconds:300}
     "how much time is left?"                  -> {type:'timer.status', ask:'remaining', target:'any'}
     "cancel that timer"                       -> {type:'timer.cancel', target:'any'}
     "cancel the screen time timer"            -> {type:'timer.cancel', target:'screentime'}

   Instead of one exact phrase per command, each command is recognised by its INTENT (a few keyword tests, in a
   fixed order), and durations are read by DurationParser, which understands hours, minutes and seconds together.
   Leading "LUNA," and "please" are ignored, so "LUNA, please set a timer for 10 minutes" works. (This is not a
   wake phrase: commands are only heard after Talk is tapped.) */
const Parser = (() => {
  const SCREENS = ['home', 'timer', 'schedules', 'assistant', 'backgrounds', 'settings', 'screentime'];

  const TIMER_WORD = /\b(timers?|countdowns?)\b/;
  const SCREEN_TIME = /\bscreen ?time\b/;
  const SET_VERB = /\b(set|start|begin|make|create|give|need|want|put|run|add|launch)\b/;
  const STATUS_LEFT = /\b(left|remaining|remain|remains)\b/;
  const STATUS_ASK = /\b(check|status|how long|how much|when|what time|finish|finished|finishes|done|over)\b/;
  const FINISH_ASK = /\b(when|what time)\b/;

  /* Control commands: the verb, plus nothing but these filler words ("can you pause my timer please"). */
  const CONTROL_VERBS = new Map(Object.entries({
    pause: 'pause', hold: 'pause', freeze: 'pause',
    resume: 'resume', continue: 'resume', unpause: 'resume',
    cancel: 'cancel', stop: 'cancel', delete: 'cancel', clear: 'cancel', end: 'cancel', remove: 'cancel', abort: 'cancel', kill: 'cancel',
    reset: 'reset',
  }));
  const FILLER = new Set(['the', 'my', 'that', 'this', 'it', 'a', 'current', 'timer', 'countdown', 'can', 'you', 'could',
    'would', 'will', 'now', 'screen', 'time', 'screentime', 'normal', 'ordinary', 'kitchen']);

  const fail = (error) => ({ ok: false, error });
  const succeed = (action) => ({ ok: true, action });

  function normalize(raw) {
    return String(raw || '').toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[.,!?;:]/g, ' ')
      .replace(/\bturn off\b/g, 'stop')
      .replace(/\s+/g, ' ').trim()
      .replace(/^(?:ok(?:ay)? |hi |hello )?luna\b ?/, '')
      .replace(/\bplease\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  const target = (text) => (SCREEN_TIME.test(text) ? 'screentime' : 'any');

  /* ---------- intents, tried in this order ---------- */
  function navigation(text) {
    if (/^(?:go )?(?:back )?(?:to )?(?:the )?home(?: screen)?$/.test(text)) return { type: 'nav', screen: 'home' };
    const m = /^(?:open|show(?: me)?|go to|switch to)(?: the)? (settings|timer|assistant|schedules|backgrounds|screen ?time(?: timer)?)(?: screen| page)?$/.exec(text);
    if (!m) return null;
    const screen = SCREEN_TIME.test(m[1]) ? 'screentime' : m[1];
    return SCREENS.includes(screen) ? { type: 'nav', screen } : null;
  }

  function timerStatus(text) {
    if (SET_VERB.test(text) && DurationParser.mentions(text)) return null;          // "set a timer for the time left" etc.
    const mentionsTimer = TIMER_WORD.test(text) || SCREEN_TIME.test(text);
    if (!(STATUS_LEFT.test(text) || (mentionsTimer && STATUS_ASK.test(text)))) return null;
    return { type: 'timer.status', ask: FINISH_ASK.test(text) ? 'finish' : 'remaining', target: target(text) };
  }

  function clockQuestion(text) {
    return /\bwhat time is it\b|\bwhats the time\b|\bwhat is the time\b|^(?:tell me )?the time$|^time$/.test(text)
      ? { type: 'clock.say' } : null;
  }

  function timerControl(text) {
    const verbs = [];
    for (const word of text.split(' ')) {
      if (CONTROL_VERBS.has(word)) verbs.push(CONTROL_VERBS.get(word));
      else if (!FILLER.has(word)) return null;            // anything else: not a plain control command
    }
    if (verbs.length !== 1) return null;
    if (text.split(' ').length > 1 && !(TIMER_WORD.test(text) || SCREEN_TIME.test(text) || /\b(it|that|this)\b/.test(text))) return null;
    return { type: 'timer.' + verbs[0], target: target(text) };
  }

  function timerSet(text, raw) {
    const wantsTimer = TIMER_WORD.test(text) || SET_VERB.test(text);
    if (!wantsTimer) return null;
    if (SCREEN_TIME.test(text)) {
      return fail('Screen Time sessions are started with the Start button on the Screen Time screen.');
    }
    if (!DurationParser.mentions(text)) {
      return TIMER_WORD.test(text) && SET_VERB.test(text) ? fail(DurationParser.MESSAGES.missing) : null;
    }
    const duration = DurationParser.read(raw);
    if (!duration.ok) return fail(duration.error);
    return succeed({ type: 'timer.set', seconds: duration.seconds });
  }

  function parse(raw) {
    const text = normalize(raw);
    if (!text) return fail('Type a command, for example “set a 5 minute timer”.');

    for (const intent of [navigation, timerStatus, clockQuestion, timerControl]) {
      const action = intent(text);
      if (action) return succeed(action);
    }
    const set = timerSet(text, raw);
    if (set) return set;

    if (TIMER_WORD.test(text)) {
      return fail('I couldn’t read that timer command. Try “set a 5 minute timer” or “how much time is left?”.');
    }
    return fail('Unsupported command: “' + text + '”.');
  }

  return { parse, normalize };
})();
