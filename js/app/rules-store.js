'use strict';
/* Rules: the saved schedule rules and a short activity log, persisted in localStorage.
   Everything read back is sanitised (Schedule.clean), so corrupt or hand-edited storage cannot break the app. */
const Rules = (() => {
  const KEY = 'luna.rules.v1';
  const MAX_LOG = 20;
  let rules = [];
  let log = [];

  function load() {
    const raw = store.get(KEY, null);
    rules = [];
    log = [];
    if (raw && Array.isArray(raw.rules)) {
      rules = raw.rules.map(Schedule.clean).filter(Boolean).slice(0, Schedule.MAX_RULES);
    }
    if (raw && Array.isArray(raw.log)) {
      log = raw.log
        .filter((e) => e && typeof e === 'object')
        .slice(0, MAX_LOG)
        .map((e) => ({
          at: +e.at || 0,
          rule: String(e.rule || '').slice(0, 40),
          status: String(e.status || '').slice(0, 12),
          msg: String(e.msg || '').slice(0, 200),
        }));
    }
  }

  const save = () => store.set(KEY, { rules, log });

  return {
    KEY,
    load,
    save,
    all: () => rules,
    log: () => log,
    get: (id) => rules.find((r) => r.id === id),
    put(rule) {
      const i = rules.findIndex((r) => r.id === rule.id);
      if (i < 0) rules.push(rule); else rules[i] = rule;
      save();
    },
    remove(id) {
      rules = rules.filter((r) => r.id !== id);
      save();
    },
    addLog(entry) {
      log.unshift(entry);
      log.length = Math.min(log.length, MAX_LOG);
      save();
    },
  };
})();
