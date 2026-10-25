'use strict';
/* SettingsUI: the Settings screen: one card per setting (time format, time zone, animation, timer sound,
   idle timeout). The voice card is drawn by voice-view.js. Also reacts to setting changes elsewhere in the app. */
const SettingsUI = (() => {
  const IDLE_NOTE = 'Buttons fade away after this much inactivity, leaving only the clock. Tap or press any key to bring them back. ' +
    'Other screens return to the clock after at least 30 seconds.';
  const ZONE_NOTE = 'Changes the clock display only. Schedules always use the device’s own time zone.';

  /* A card with one button per choice. Clicking a button saves that value; the active one is highlighted by sync(). */
  function choiceCard(title, key, choices, note) {
    const card = H('div', { className: 'card' });
    const row = H('div', { className: 'row' });
    card.append(H('h3', { textContent: title }), row);

    choices.forEach(([value, text]) => {
      const button = H('button', { className: 'btn', textContent: text, onclick: () => Settings.set(key, value) });
      button.dataset.key = key;
      button.dataset.v = JSON.stringify(value);
      row.append(button);
    });
    if (note) card.append(H('div', { className: 'mut', style: 'margin-top:8px', textContent: note }));
    return card;
  }

  function timeZoneCard() {
    const select = H('select', { onchange: (e) => Settings.set('timeZone', e.target.value) }, { 'aria-label': 'Time zone' });
    TZ.forEach(([id, name]) => select.append(H('option', { value: id, textContent: id === 'local' ? name : name + ' — ' + id })));
    return H('div', { className: 'card' }, null,
      H('h3', { textContent: 'Time zone' }), select,
      H('div', { className: 'mut', style: 'margin-top:8px', textContent: ZONE_NOTE }));
  }

  function render() {
    $('#sets').replaceChildren(
      choiceCard('Time format', 'timeFormat', [['12', '12-hour'], ['24', '24-hour']]),
      timeZoneCard(),
      choiceCard('Animation', 'motion', [['auto', 'Follow device'], ['reduce', 'Reduce'], ['full', 'Full']]),
      choiceCard('Timer sound', 'sound', [[true, 'On'], [false, 'Off']]),
      choiceCard('Hide controls after', 'idleSec',
        [[5, '5 sec'], [10, '10 sec'], [30, '30 sec'], [60, '1 min'], [300, '5 min'], [0, 'Never']], IDLE_NOTE),
    );
    highlightCurrentChoices();
  }

  function highlightCurrentChoices() {
    const settings = Settings.get();
    $$('#sets .btn[data-key]').forEach((button) => {
      const isCurrent = JSON.stringify(settings[button.dataset.key]) === button.dataset.v;
      button.classList.toggle('sel', isCurrent);
    });
    $('#sets select').value = settings.timeZone;
  }

  /* Other parts of the app that depend on a setting are told here. '*' means "everything was reset". */
  function applyChange(key) {
    const all = key === '*';
    highlightCurrentChoices();
    if (all || key === 'timeFormat' || key === 'timeZone') { Clock.rebuild(); ScheduleUI.refresh(); }
    if (all || key === 'motion') Bg.showActive();
    if (all || key === 'idleSec') Idle.reconfigure();
    if (all || ['voiceOn', 'wakeOn', 'voiceLang'].includes(key)) VoiceUI.onSetting(key);
  }

  function restoreDefaults() {
    Settings.reset();
    Library.reset();
    Bg.showActive();
    BgUI.refresh();
    Toast.show('Defaults restored');
  }

  return {
    init() {
      render();
      Settings.on(applyChange);
      $('#reset').onclick = () => confirmDlg(
        'Restore all settings and backgrounds to their defaults? Your saved backgrounds will be deleted. Schedules are kept.',
        restoreDefaults);
    },
  };
})();
