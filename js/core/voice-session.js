/* VoiceCore.createVoice: drives a browser SpeechRecognition object through a small state machine.
   The recogniser class is INJECTED (env.ctor), so tests can use a fake and the app never assumes one exists.

   States
     idle      not listening
     starting  start() called, audio not confirmed yet   <- never reported as "listening"
     wake      audio is flowing; waiting for "Hey LUNA"  (only after the browser says audio really started)
     command   audio is flowing; waiting for the command (after the wake phrase, or push-to-talk)
     error     something failed; env.emit gets an explanation

   Two ways to listen
     startWake()   continuous session that looks for the wake phrase in the transcript
     listenOnce()  push-to-talk: one command, then stop (no wake phrase needed)

   env = {ctor, secure, lang(), emit(evt), run(text)->{ok,msg}, setTimeout?, clearTimeout?, now?, cmdTimeoutMs?}
   Events emitted: {type:'state'|'heard'|'command'|'timeout'|'error', ...}

   Privacy: in wake mode, speech that does not contain the wake phrase is dropped here:
   it is never emitted, displayed or stored. (The browser's speech service still received the audio;
   the UI says so.) */
const VoiceCore = (() => {
  const COMMAND_WINDOW_MS = 8000;  // how long to wait for a command after the wake phrase
  const MAX_FAILURES = 6;          // consecutive failed restarts before giving up

  function createVoice(env) {
    const later = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const cancelLater = env.clearTimeout || ((h) => clearTimeout(h));
    const now = env.now || (() => Date.now());
    const commandWindow = env.cmdTimeoutMs || COMMAND_WINDOW_MS;

    let state = 'idle';
    let rec = null;            // the live recogniser, or null
    let mode = null;           // 'wake' | 'once'
    let wantWake = false;      // should wake listening keep running (restart after the browser ends a session)
    let verified = false;      // has the wake phrase actually been heard this session?
    let commandTimer = null;
    let restartTimer = null;
    let failures = 0;
    let startedAt = 0;
    let wakeIndex = -1;        // which result held the wake phrase (-2: wake phrase alone, command is next result)
    let gotAudio = false;
    let lastError = null;
    let lastCode = '';
    let forceCommand = false;  // push-to-talk requested while wake session was still starting

    const emit = (evt) => { try { env.emit(evt); } catch (e) { console.error(e); } };
    const setState = (s, detail) => {
      state = s;
      emit({ type: 'state', state: s, detail: detail || null, wantWake, verified });
    };

    /* ---------- support checks ---------- */
    function support() {
      if (!env.ctor) return { ok: false, reason: 'unsupported', msg: VoicePhrases.explain('unsupported') };
      if (!env.secure) return { ok: false, reason: 'insecure', msg: VoicePhrases.explain('insecure') };
      return { ok: true };
    }

    function reportUnsupported(s) {
      wantWake = false;
      lastError = { code: s.reason, msg: s.msg };
      setState('error', lastError);
      emit({ type: 'error', code: s.reason, msg: s.msg });
      return s;
    }

    /* ---------- teardown / failure ---------- */
    function teardown() {
      cancelLater(commandTimer);
      cancelLater(restartTimer);
      commandTimer = restartTimer = null;
      const old = rec;
      rec = null; // handlers of the old recogniser now ignore their events
      if (old) { try { old.abort(); } catch (e) { /* already stopped */ } }
    }

    function fail(code, prefix) {
      wantWake = false;
      forceCommand = false;
      teardown();
      lastError = { code, msg: (prefix ? prefix + ' ' : '') + VoicePhrases.explain(code) };
      setState('error', lastError);
      emit({ type: 'error', code, msg: lastError.msg });
    }

    /* ---------- command window ---------- */
    function enterCommandState() {
      setState('command');
      cancelLater(commandTimer);
      commandTimer = later(onCommandWindowExpired, commandWindow);
    }

    function onCommandWindowExpired() {
      commandTimer = null;
      if (state !== 'command') return;
      emit({ type: 'timeout', msg: 'I didn’t catch a command.' });
      if (mode === 'wake' && rec) { wakeIndex = -1; setState('wake'); }
      else { teardown(); setState('idle'); }
    }

    function finishCommand(text) {
      cancelLater(commandTimer);
      commandTimer = null;
      let result;
      try { result = env.run(text); } catch (e) { result = { ok: false, msg: 'That action failed.' }; }
      emit({ type: 'command', text, ok: !!result.ok, msg: result.msg });
      if (mode === 'wake' && rec) { wakeIndex = -1; setState('wake'); }
      else if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } } // graceful: onend -> idle
    }

    /* ---------- interpreting transcripts ---------- */
    function heard(text, isFinal) {
      emit({ type: 'heard', text, final: isFinal });
      if (isFinal) finishCommand(text);
    }

    function onTranscript(index, text, isFinal) {
      if (mode === 'once') {                       // push-to-talk
        const command = VoicePhrases.stripWake(text);
        if (command) heard(command, isFinal);
        return;
      }
      if (state === 'wake') {                      // wake mode, waiting for the phrase
        const m = VoicePhrases.matchWake(text);
        if (!m.woke) return;                       // unrelated speech: dropped
        verified = true;
        wakeIndex = index;
        enterCommandState();
        if (m.command) heard(m.command, isFinal);
        return;
      }
      if (state === 'command') {                   // wake mode, waiting for the command
        if (index === wakeIndex) {                 // same utterance as the wake phrase
          const m = VoicePhrases.matchWake(text);
          const command = m.woke ? m.command : text;
          if (command) heard(command, isFinal);
          else if (isFinal) wakeIndex = -2;        // "hey luna" finalised alone: command comes in the next result
          return;
        }
        const command = VoicePhrases.stripWake(text);
        if (command) heard(command, isFinal);
      }
    }

    /* ---------- recogniser events ---------- */
    function onAudioConfirmed() {
      gotAudio = true;
      if (mode === 'wake' && !forceCommand) { setState('wake'); return; }
      forceCommand = false;
      enterCommandState();
    }

    function onEnd() {
      cancelLater(commandTimer);
      rec = null;
      if (state === 'error') return;
      if (wantWake && mode === 'wake') { scheduleRestart(); return; }
      setState('idle');
    }

    /* Chromium ends continuous sessions every so often; restart quickly. If it keeps failing
       before audio starts (offline, no speech service), back off and finally give up and say so. */
    function scheduleRestart() {
      const ranMs = now() - startedAt;
      failures = (!gotAudio || ranMs < 3000) ? failures + 1 : 0;
      if (failures >= MAX_FAILURES) {
        if (lastCode === 'network') fail('network', 'Wake-phrase listening stopped after repeated failures.');
        else fail('restart-failed');
        return;
      }
      const delay = failures ? Math.min(30000, 500 * Math.pow(2, failures)) : 250;
      if (failures) setState('starting'); // honest: not listening during the back-off
      restartTimer = later(() => {
        restartTimer = null;
        if (wantWake && !rec) begin('wake');
      }, delay);
    }

    function onError(code) {
      lastCode = code || '';
      if (code === 'no-speech' || code === 'aborted') return;   // normal
      if (code === 'network' && mode === 'wake') return;        // onEnd will retry with back-off, then give up
      fail(code || 'unknown');
    }

    function wire(r) {
      r.onaudiostart = () => { if (r !== rec) return; failures = 0; onAudioConfirmed(); };
      r.onresult = (e) => {
        if (r !== rec) return;
        if (!gotAudio && state === 'starting') onAudioConfirmed(); // some engines skip audiostart
        for (let i = e.resultIndex || 0; i < e.results.length; i++) {
          const result = e.results[i];
          const text = ((result[0] && result[0].transcript) || '').trim();
          if (text) onTranscript(i, text, !!result.isFinal);
        }
      };
      r.onerror = (e) => { if (r === rec) onError(e && e.error); };
      r.onend = () => { if (r === rec) onEnd(); };
      return r;
    }

    function begin(newMode) {
      teardown();
      mode = newMode;
      gotAudio = false;
      wakeIndex = -1;
      startedAt = now();
      const r = new env.ctor();
      r.lang = env.lang ? env.lang() : 'en-US';
      r.continuous = newMode === 'wake';
      r.interimResults = true;
      r.maxAlternatives = 1;
      rec = wire(r);
      setState('starting');
      try { r.start(); } catch (e) { fail('start-failed'); }
    }

    /* ---------- public API ---------- */
    return {
      support,
      getState: () => state,
      getError: () => lastError,
      isVerified: () => verified,
      wantsWake: () => wantWake,

      startWake() {
        const s = support();
        if (!s.ok) return reportUnsupported(s);
        wantWake = true;
        failures = 0;
        lastError = null;
        forceCommand = false;
        begin('wake');
        return { ok: true };
      },

      listenOnce() {
        const s = support();
        if (!s.ok) return reportUnsupported(s);
        lastError = null;
        if (rec && mode === 'wake') {              // reuse the open wake session
          if (state === 'wake') { wakeIndex = -1; enterCommandState(); } else { forceCommand = true; }
          return { ok: true };
        }
        if (wantWake && !rec) {                    // wake session is between restarts
          forceCommand = true;
          cancelLater(restartTimer);
          restartTimer = null;
          begin('wake');
          return { ok: true };
        }
        if (rec && mode === 'once') return { ok: true };
        begin('once');
        return { ok: true };
      },

      stop() {
        wantWake = false;
        forceCommand = false;
        teardown();
        lastError = null;
        setState('idle');
      },
    };
  }

  return { ...VoicePhrases, createVoice };
})();
