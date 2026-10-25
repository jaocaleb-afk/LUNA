'use strict';
/* ScheduleUI: the Schedules screen: the list of rules (name, time, repeat, next run, last result,
   enable/disable, edit, delete) and the "Recent activity" log. The editor form is in schedule-editor.js. */
const ScheduleUI = (() => {
  const byTimeThenName = (a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name);

  /* ---------- time-zone note ---------- */
  function deviceZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; }
  }

  /* Schedules always use the DEVICE's zone. If the clock was switched to another zone in Settings the
     two will not match, so say so instead of letting a rule fire at a surprising hour. */
  function renderZoneNote() {
    const zone = deviceZone();
    setText($('#rtz'), zone ? '(' + zone + ')' : '');

    const chosen = Settings.get().timeZone;
    const note = $('#rzonewarn');
    let differs = false;
    if (chosen !== 'local') {
      try {
        const hhmm = (tz) => new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
        differs = hhmm(chosen) !== hhmm(undefined);
      } catch (e) { /* unknown zone: no note */ }
    }
    note.hidden = !differs;
    if (differs) {
      const name = (TZ.find((t) => t[0] === chosen) || [null, chosen])[1];
      setText(note, 'The clock is showing ' + name + ' time, but schedules use the device’s own time zone' + (zone ? ' (' + zone + ')' : '') +
        ', so they will not match what the clock shows. Set the device’s time zone correctly (on Raspberry Pi OS: raspi-config → Localisation → Timezone), or set the clock to “Device local time”.');
    }
  }

  /* ---------- Timer-screen summary: the soonest upcoming scheduled start ---------- */
  function renderNextSummary() {
    const now = new Date();
    let soonest = null;
    Rules.all().forEach((rule) => {
      const when = Schedule.nextRun(rule, now);
      if (when && (!soonest || when < soonest.when)) soonest = { rule, when };
    });
    setText($('#tnext'), soonest
      ? 'Next scheduled start: “' + soonest.rule.name + '” · ' + ScheduleFormat.dateTimeText(soonest.when) + ' · ' + Schedule.durText(soonest.rule.seconds)
      : 'No schedules are enabled. Schedules start timers automatically — open Schedules to add one.');
  }

  /* ---------- one rule card ---------- */
  function toggleRule(id) {
    const rule = Rules.get(id);
    if (!rule) return;
    rule.enabled = !rule.enabled;
    if (rule.enabled) rule.armedAt = Date.now(); // only future occurrences count from now on
    Rules.put(rule);
    renderList();
    renderNextSummary();
    Toast.show(rule.name + (rule.enabled ? ' enabled' : ' disabled'));
  }

  function deleteRule(rule) {
    confirmDlg('Delete the rule “' + rule.name + '”?', () => {
      Rules.remove(rule.id);
      ScheduleEditor.closeIfEditing(rule.id);
      renderList();
      renderNextSummary();
      Toast.show('Rule deleted');
    });
  }

  function buildCard(rule) {
    const card = H('div', { className: 'card rule' + (rule.enabled ? '' : ' off') }, { 'data-id': rule.id });
    card.append(
      H('h3', { textContent: rule.name }),
      H('div', { className: 'meta', textContent: ScheduleFormat.clockText(rule.time) + ' · Start timer · ' + Schedule.durText(rule.seconds) + ' · ' + Schedule.repeatText(rule) }),
      H('div', { className: 'next', textContent: ScheduleFormat.nextRunText(rule) }, { 'data-next': rule.id }),
    );
    if (rule.lastResult) {
      const last = rule.lastResult;
      card.append(H('div', { className: 'last ' + last.status, textContent: 'Last: ' + last.msg + ' (' + ScheduleFormat.shortTimeText(last.at) + ')' }));
    }

    const toggle = H('button', { className: 'btn sw', textContent: rule.enabled ? 'On' : 'Off', onclick: () => toggleRule(rule.id) },
      { role: 'switch', 'aria-checked': String(rule.enabled), 'aria-label': 'Enabled: ' + rule.name });
    const edit = H('button', { className: 'btn', textContent: 'Edit', onclick: () => ScheduleEditor.open(rule) }, { 'aria-label': 'Edit ' + rule.name });
    const del = H('button', { className: 'btn', textContent: 'Delete', onclick: () => deleteRule(rule) }, { 'aria-label': 'Delete ' + rule.name });
    card.append(H('div', { className: 'acts' }, null, toggle, edit, del));
    return card;
  }

  /* ---------- list + activity log ---------- */
  function renderList() {
    const list = $('#rlist');
    list.innerHTML = '';
    const rules = Rules.all().slice().sort(byTimeThenName);
    if (!rules.length) {
      list.append(H('div', { className: 'card empty', textContent: 'No schedules yet. Tap “New rule” to create one — for example “Morning timer” at 9:00 AM for 2 minutes, every day.' }));
    }
    rules.forEach((rule) => list.append(buildCard(rule)));

    const log = $('#rlog');
    log.innerHTML = '';
    const entries = Rules.log().slice(0, 8);
    if (!entries.length) log.append(H('li', { className: 'mut', textContent: 'Nothing has run yet.' }));
    entries.forEach((e) => log.append(H('li', {
      className: e.status === 'started' ? '' : 'err',
      textContent: ScheduleFormat.shortTimeText(e.at) + ' · ' + e.rule + ' · ' + e.msg,
    })));
  }

  /* "in 3 h" labels go stale; refresh just those text nodes (not the whole list) every 20 s. */
  function refreshNextLabels() {
    $$('#rlist [data-next]').forEach((node) => {
      const rule = Rules.get(node.dataset.next);
      if (rule) setText(node, ScheduleFormat.nextRunText(rule));
    });
    renderNextSummary();
  }

  return {
    init() {
      $('#rnew').onclick = () => ScheduleEditor.open(null);
      ScheduleEditor.init();
      addEventListener('storage', (e) => { if (e.key === Rules.KEY) { Rules.load(); ScheduleUI.refresh(); } }); // another tab changed rules
      setInterval(() => (Nav.cur === 'schedules' ? refreshNextLabels() : renderNextSummary()), 20000);
      renderNextSummary();
    },
    enter() { renderZoneNote(); renderList(); renderNextSummary(); },
    refresh() { renderNextSummary(); if (Nav.cur === 'schedules') { renderZoneNote(); renderList(); } },
    renderList,
    renderNextSummary,
  };
})();
