/* MissCounter: how LUNA answers voice commands it did not understand, or understood but does not support.

     1st miss in a row  -> "I didn’t catch that."
     2nd miss in a row  -> "Sorry, that command isn’t supported."   and the count starts again from zero,
                           so the next, unrelated miss gets the first reply again.
     any command that is understood (it ran, or LUNA asked a specific question about it) -> count back to zero.

   Heard text alone is not success: only the outcome of running it counts.
   Each voice command carries an id (one per Talk session). Reporting the same id twice (a browser that fires
   duplicate result callbacks) changes nothing and returns the same reply, so one utterance is never counted twice.

   const misses = MissCounter.create();
   misses.record(id, understood) -> {reply, count}   reply = null when understood (use the command's own reply) */
const MissCounter = (() => {
  const FIRST = 'I didn’t catch that.';
  const SECOND = 'Sorry, that command isn’t supported.';

  function create() {
    let count = 0;
    let lastId = null;
    let lastResult = null;

    function record(id, understood) {
      if (id !== undefined && id !== null && id === lastId) return lastResult;
      let reply = null;
      if (understood) {
        count = 0;
      } else {
        count += 1;
        reply = count === 1 ? FIRST : SECOND;
        if (count >= 2) count = 0;
      }
      lastId = id;
      lastResult = { reply, count };
      return lastResult;
    }

    return { record, count: () => count };
  }

  return { create, FIRST, SECOND };
})();
