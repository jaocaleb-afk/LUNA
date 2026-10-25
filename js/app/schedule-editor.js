'use strict';
/* ScheduleEditor: the "New rule / Edit rule" form on the Schedules screen.

   The form keeps its values in `draft`. Nothing is validated while the person is still typing; after the
   first failed Save, errors update live. Save runs Schedule.validate, so the rules for "what is a valid
   rule" live in one place (core/schedule.js), not in this form. */
const ScheduleEditor = (() => {
  const DURATION_PRESETS = [1, 2, 5, 10, 15, 30];
  const REPEAT_CHOICES = [['once', 'Once'], ['daily', 'Every day'], ['days', 'Selected days']];
  let draft = null;     // form values
  let editingId = null; // id of the rule being edited, or null for a new rule
  let triedSave = false;

  /* ---------- draft <-> rule ---------- */
  const newDraft = () => ({ name: '', time: '09:00', mins: 2, secs: 0, repeat: 'daily', days: [1, 2, 3, 4, 5], enabled: true });
  const draftFromRule = (r) => ({
    name: r.name, time: r.time, mins: Math.floor(r.seconds / 60), secs: r.seconds % 60,
    repeat: r.repeat, days: r.days.slice(), enabled: r.enabled,
  });

  /* Turn the form values into rule fields and validate them. */
  function readForm() {
    const mins = Number(draft.mins === '' ? 0 : draft.mins);
    const secs = Number(draft.secs === '' ? 0 : draft.secs);
    const wholeNumbers = Number.isInteger(mins) && Number.isInteger(secs) && mins >= 0 && secs >= 0 && secs < 60;
    const fields = {
      id: editingId || undefined,
      name: draft.name,
      time: draft.time,
      action: 'timer.start',
      seconds: wholeNumbers ? mins * 60 + secs : 0, // 0 fails validation with the duration message
      repeat: draft.repeat,
      days: draft.days,
      enabled: draft.enabled,
    };
    return { fields, check: Schedule.validate(fields, Rules.all()) };
  }

  /* ---------- messages ---------- */
  function showMessages(check) {
    const box = $('#rerr');
    box.innerHTML = '';
    if (check.errors.length) {
      box.append(H('ul', { className: 'errs' }, { role: 'alert' }, check.errors.map((t) => H('li', { textContent: t }))));
    }
    check.warnings.forEach((w) => box.append(H('div', { className: 'warn', textContent: '⚠ ' + w })));
  }
  /* Errors wait until the first Save attempt (so a half-typed form is not scolded);
     collision warnings appear as soon as the form is valid enough to compare. */
  function liveValidate() {
    const { check } = readForm();
    showMessages(triedSave ? check : { errors: [], warnings: check.warnings });
  }

  /* ---------- form pieces ---------- */
  function labelledRow(label, forId, ...nodes) {
    const row = H('div', { className: 'f' });
    row.append(H('label', { htmlFor: forId, textContent: label }), ...nodes);
    return row;
  }

  function nameField() {
    const input = H('input', { id: 'r-name', type: 'text', maxLength: 40, value: draft.name, placeholder: 'e.g. Morning timer' });
    input.oninput = () => { draft.name = input.value; liveValidate(); };
    return labelledRow('Name', 'r-name', input);
  }

  function timeField() {
    const input = H('input', { id: 'r-time', type: 'time', value: draft.time });
    input.oninput = input.onchange = () => { draft.time = input.value; liveValidate(); };
    return labelledRow('Start time', 'r-time', input);
  }

  function actionField() {
    const select = H('select', { id: 'r-act', disabled: true }, { 'aria-describedby': 'r-acth' });
    select.append(H('option', { value: 'timer.start', textContent: 'Start timer' }));
    return [labelledRow('Action', 'r-act', select),
      H('div', { className: 'rhelp', id: 'r-acth', textContent: 'Starts a countdown timer at the chosen time. More actions may be added later.' })];
  }

  function durationFields() {
    const mins = H('input', { id: 'r-min', type: 'number', min: 0, max: 1439, value: draft.mins }, { inputmode: 'numeric' });
    const secs = H('input', { id: 'r-sec', type: 'number', min: 0, max: 59, value: draft.secs }, { inputmode: 'numeric', 'aria-label': 'Seconds' });
    mins.oninput = () => { draft.mins = mins.value; liveValidate(); };
    secs.oninput = () => { draft.secs = secs.value; liveValidate(); };

    const presets = H('div', { className: 'row', style: 'margin:-2px 0 10px 110px' });
    DURATION_PRESETS.forEach((n) => presets.append(H('button', {
      className: 'btn', type: 'button', textContent: n + ' min',
      onclick: () => { draft.mins = n; draft.secs = 0; mins.value = n; secs.value = 0; liveValidate(); },
    }, { 'aria-label': 'Set duration to ' + n + ' minutes' })));

    return [labelledRow('Duration', 'r-min', mins, H('span', { className: 'unit', textContent: 'min' }), secs, H('span', { className: 'unit', textContent: 'sec' })), presets];
  }

  function repeatFields() {
    const choices = H('div', { className: 'row' });
    REPEAT_CHOICES.forEach(([value, text]) => choices.append(H('button', {
      className: 'btn' + (draft.repeat === value ? ' sel' : ''), type: 'button', textContent: text,
      onclick: () => { draft.repeat = value; render(); liveValidate(); },
    }, { 'aria-pressed': String(draft.repeat === value) })));
    const out = [labelledRow('Repeat', 'r-rep', choices)];

    if (draft.repeat === 'days') {
      const days = H('div', { className: 'days', style: 'margin:0 0 12px 110px' }, { role: 'group', 'aria-label': 'Days of the week' });
      Schedule.DAY.forEach((name, index) => {
        const on = draft.days.includes(index);
        days.append(H('button', {
          className: 'btn' + (on ? ' sel' : ''), type: 'button', textContent: name,
          onclick: () => { draft.days = on ? draft.days.filter((d) => d !== index) : [...draft.days, index]; render(); liveValidate(); },
        }, { 'aria-pressed': String(on) }));
      });
      out.push(days);
    } else {
      out.push(H('div', { className: 'rhelp', textContent: draft.repeat === 'once' ? 'Runs once at the next occurrence of this time, then turns itself off.' : 'Runs every day at this time.' }));
    }
    return out;
  }

  function enabledField() {
    const toggle = H('button', { className: 'btn sw', type: 'button', textContent: draft.enabled ? 'Enabled' : 'Disabled' }, { role: 'switch', 'aria-checked': String(draft.enabled) });
    toggle.onclick = () => {
      draft.enabled = !draft.enabled;
      toggle.textContent = draft.enabled ? 'Enabled' : 'Disabled';
      toggle.setAttribute('aria-checked', String(draft.enabled));
    };
    return labelledRow('Status', 'r-en', toggle);
  }

  function render() {
    const form = $('#redit');
    form.innerHTML = '';
    form.append(
      H('h3', { textContent: editingId ? 'Edit rule' : 'New rule' }),
      nameField(), timeField(), ...actionField(), ...durationFields(), ...repeatFields(), enabledField(),
      H('div', { id: 'rerr' }),
      H('div', { className: 'row', style: 'margin-top:12px' }, null,
        H('button', { className: 'btn pri', type: 'button', textContent: 'Save rule', onclick: save }),
        H('button', { className: 'btn', type: 'button', textContent: 'Cancel', onclick: close })),
    );
    liveValidate();
  }

  /* ---------- save / open / close ---------- */
  function save() {
    triedSave = true;
    const { fields, check } = readForm();
    showMessages(check);
    if (!check.ok) {
      Toast.show('Fix the problems listed first', 3000);
      $('#rerr').scrollIntoView({ block: 'nearest' });
      return;
    }

    const now = Date.now();
    if (editingId) {
      const rule = Rules.get(editingId);
      Object.assign(rule, Schedule.make({ ...fields, id: rule.id }, now), { lastKey: rule.lastKey, lastResult: rule.lastResult });
      Rules.put(rule);
    } else {
      if (Rules.all().length >= Schedule.MAX_RULES) {
        showMessages({ errors: ['You can have up to ' + Schedule.MAX_RULES + ' rules. Delete one first.'], warnings: [] });
        return;
      }
      Rules.put(Schedule.make(fields, now));
    }

    close();
    ScheduleUI.renderList();
    ScheduleUI.renderNextSummary();
    // Collision warnings do not block saving, but are worth reading.
    Toast.show(check.warnings.length ? check.warnings[0] : 'Rule saved', check.warnings.length ? 8000 : 1600);
  }

  function open(rule) {
    triedSave = false;
    editingId = rule ? rule.id : null;
    draft = rule ? draftFromRule(rule) : newDraft();
    render();
    const form = $('#redit');
    form.hidden = false;
    form.scrollIntoView({ block: 'nearest' });
  }

  function close() {
    draft = null;
    editingId = null;
    $('#redit').hidden = true;
    $('#redit').innerHTML = '';
  }

  return {
    init() { /* the form is built on demand by open() */ },
    open,
    close,
    closeIfEditing(id) { if (editingId === id) close(); },
  };
})();
