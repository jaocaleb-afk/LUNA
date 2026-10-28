/* VoiceCore.createVoice: push-to-talk speech recognition as a small state machine.
   The recogniser class is INJECTED (env.ctor), so tests can use a fake and the app never assumes one exists.

   One tap = one command. listen() opens a single, non-continuous session; the first final transcript is
   run as a command (no wake phrase needed) and the session stops. There is no background listening.

   States
     idle       not listening
     starting   start() called, audio not confirmed yet   <- never reported as "listening"
     listening  audio is flowing; waiting for the command (only after the browser says audio really started)
     error      something failed; env.emit gets an explanation

   Not understood: the browser's "no-match" (it heard speech but could not turn it into words), or a final
   transcript whose confidence the browser reports as very low, is NOT run. It is reported as a command with
   kind 'unclear', so the person hears "I didn't catch that" instead of LUNA acting on a guess.
   (Many engines report confidence 0 or nothing at all; that means "unknown", not "low", and the text is used.)

   env = {ctor, secure, lang(), emit(evt), run(text)->{ok,msg,kind}, setTimeout?, clearTimeout?, listenMs?}
   Events emitted: {type:'state'|'heard'|'command'|'timeout'|'error', ...}
     command: {type:'command', id, text, ok, msg, kind}   id = which Talk session (one command per session) */
const VoiceCore = (() => {
  const LISTEN_WINDOW_MS = 8000;  // how long to wait for a command once audio has started
  const MIN_CONFIDENCE = 0.3;      // below this (and above 0), the browser itself is unsure what was said
  const NOTHING_HEARD = 'I didn’t hear anything.';

  function createVoice(env) {
    const later = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const cancelLater = env.clearTimeout || ((h) => clearTimeout(h));
    const listenWindow = env.listenMs || LISTEN_WINDOW_MS;

    let state = 'idle';
    let rec = null;            // the live recogniser, or null
    let windowTimer = null;
    let handled = false;       // has this session already run its command?
    let sessionId = 0;         // increases with every Talk; sent with the command so it is never counted twice
    let lastError = null;

    const emit = (evt) => { try { env.emit(evt); } catch (e) { console.error(e); } };
    const setState = (s) => { state = s; emit({ type: 'state', state: s }); };

    /* ---------- support checks (never touch the microphone) ---------- */
    function support() {
      if (!env.secure) {
        const msg = VoicePhrases.explain('insecure') + (env.ctor ? '' : ' ' + VoicePhrases.explain('unsupported'));
        return { ok: false, reason: 'insecure', msg };
      }
      if (!env.ctor) return { ok: false, reason: 'unsupported', msg: VoicePhrases.explain('unsupported') };
      return { ok: true };
    }

    function reportUnsupported(s) {
      lastError = { code: s.reason, msg: s.msg };
      setState('error');
      emit({ type: 'error', code: s.reason, msg: s.msg });
      return s;
    }

    /* ---------- teardown / endings ---------- */
    function teardown() {
      cancelLater(windowTimer);
      windowTimer = null;
      const old = rec;
      rec = null; // handlers of the old recogniser now ignore their events
      if (old) { try { old.abort(); } catch (e) { /* already stopped */ } }
    }

    function fail(code) {
      teardown();
      lastError = { code, msg: VoicePhrases.explain(code) };
      setState('error');
      emit({ type: 'error', code, msg: lastError.msg });
    }

    function nothingHeard() {
      teardown();
      emit({ type: 'timeout', msg: NOTHING_HEARD });
      setState('idle');
    }

    /* ---------- recogniser events ---------- */
    function onAudioConfirmed() {
      if (state !== 'starting') return;
      setState('listening');
      windowTimer = later(() => { windowTimer = null; if (!handled) nothingHeard(); }, listenWindow);
    }

    const unsure = (confidence) => typeof confidence === 'number' && confidence > 0 && confidence < MIN_CONFIDENCE;

    function finishCommand(text, confidence) {
      handled = true;
      cancelLater(windowTimer);
      windowTimer = null;
      let result;
      if (!text || unsure(confidence)) {
        result = { ok: false, msg: '', kind: 'unclear' };          // do not act on a guess
      } else {
        try { result = env.run(text); } catch (e) { result = { ok: false, msg: 'That action failed.', kind: 'invalid' }; }
      }
      emit({ type: 'command', id: sessionId, text, ok: !!result.ok, msg: result.msg, kind: result.kind || (result.ok ? 'done' : 'invalid') });
      if (rec) { try { rec.stop(); } catch (e) { teardown(); setState('idle'); } } // graceful: onend -> idle
    }

    function onError(code) {
      if (code === 'aborted') return;                  // we aborted it ourselves
      if (code === 'no-speech') { nothingHeard(); return; }
      if (code === 'no-match') { if (!handled) finishCommand('', null); return; }   // speech, but no words
      fail(code || 'unknown');
    }

    function onEnd() {
      const wasListening = state === 'starting' || state === 'listening';
      cancelLater(windowTimer);
      windowTimer = null;
      rec = null;
      if (!wasListening) return;
      if (!handled) emit({ type: 'timeout', msg: NOTHING_HEARD });
      setState('idle');
    }

    function wire(r) {
      r.onaudiostart = () => { if (r === rec) onAudioConfirmed(); };
      r.onresult = (e) => {
        if (r !== rec || handled) return;
        onAudioConfirmed(); // some engines skip audiostart
        for (let i = e.resultIndex || 0; i < e.results.length; i++) {
          const result = e.results[i];
          const text = ((result[0] && result[0].transcript) || '').trim();
          if (!text) continue;
          emit({ type: 'heard', text, final: !!result.isFinal });
          if (result.isFinal) { finishCommand(text, result[0].confidence); return; }
        }
      };
      r.onerror = (e) => { if (r === rec) onError(e && e.error); };
      r.onend = () => { if (r === rec) onEnd(); };
      return r;
    }

    /* ---------- public API ---------- */
    return {
      support,
      getState: () => state,
      getError: () => lastError,

      /* Push-to-talk: open the microphone for one command. */
      listen() {
        const s = support();
        if (!s.ok) return reportUnsupported(s);
        if (rec) return { ok: true };                  // already starting or listening
        lastError = null;
        handled = false;
        sessionId += 1;
        const r = new env.ctor();
        r.lang = env.lang ? env.lang() : 'en-US';
        r.continuous = false;
        r.interimResults = true;
        r.maxAlternatives = 1;
        rec = wire(r);
        setState('starting');
        try { r.start(); } catch (e) { fail('start-failed'); return { ok: false, reason: 'start-failed' }; }
        return { ok: true };
      },

      /* Stop listening now (Stop/Cancel button, voice turned off, settings reset). */
      stop() {
        teardown();
        lastError = null;
        setState('idle');
      },
    };
  }

  return { createVoice };
})();
