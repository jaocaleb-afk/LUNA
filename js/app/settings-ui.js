'use strict';
/* SettingsUI: the Settings screen: the Clock and Display-and-sound groups (time format, time zone, animation,
   idle timeout, timer sound) and the section jump bar. The voice card is drawn by voice-view.js, the spoken-replies card by speech.js, the kiosk and PIN cards by kiosk.js and pin-ui.js. Also reacts to setting changes elsewhere in the app. */
const SettingsUI = (() => {
  const IDLE_NOTE = 'Buttons fade away after this much inactivity, leaving only the clock. Tap or press any key to bring them back. ' +
    'Other screens return to the clock after at least 30 seconds.';
  const ZONE_NOTE = 'Changes the clock display only. Schedules always use the device’s own time zone.';

  /* Jump links at the top of the long Settings screen, so each section is one tap away on a small display. */
  const SECTIONS = [['#sets', 'Clock & display'], ['#vset', 'Voice'], ['#sset', 'Spoken replies'], ['#kset', 'Kiosk & PIN'], ['#cmdtest', 'Test a command']];

  function jumpBar() {
    return H('nav', { className: 'jump row' }, { 'aria-label': 'Settings sections' },
      SECTIONS.map(([target, text]) => H('button', {
        type: 'button', className: 'btn', textContent: text,
        onclick: () => { const el = $(target); if (el) el.scrollIntoView({ block: 'start' }); },
      })));
  }

  /* One setting on one line: its name, then a segmented control (one button per choice; the current one is
     highlighted by highlightCurrentChoices()). The row wraps under the name on narrow screens. */
  function choiceRow(title, key, choices) {
    const group = H('div', { className: 'seg' }, { role: 'group', 'aria-label': title });
    choices.forEach(([value, text]) => {
      const button = H('button', { className: 'btn', textContent: text, onclick: () => Settings.set(key, value) });
      button.dataset.key = key;
      button.dataset.v = JSON.stringify(value);
      group.append(button);
    });
    return H('div', { className: 'srow' }, null, H('span', { className: 'slab', textContent: title }), group);
  }

  function timeZoneRow() {
    const select = H('select', { id: 'tzsel', onchange: (e) => Settings.set('timeZone', e.target.value) }, { 'aria-label': 'Time zone' });
    TZ.forEach(([id, name]) => select.append(H('option', { value: id, textContent: id === 'local' ? name : name + ' — ' + id })));
    return H('div', { className: 'srow' }, null, H('label', { className: 'slab', htmlFor: 'tzsel', textContent: 'Time zone' }), select);
  }

  const group = (title, ...rows) => H('div', { className: 'card sgroup' }, null, H('h3', { textContent: title }), rows);
  const note = (text) => H('div', { className: 'mut snote', textContent: text });

  function render() {
    $('#sjump').replaceChildren(jumpBar());
    $('#sets').replaceChildren(
      group('Clock',
        choiceRow('Time format', 'timeFormat', [['12', '12-hour'], ['24', '24-hour']]),
        timeZoneRow(), note(ZONE_NOTE)),
      group('Display and sound',
        choiceRow('Animation', 'motion', [['auto', 'Follow device'], ['reduce', 'Reduce'], ['full', 'Full']]),
        choiceRow('Hide controls after', 'idleSec',
          [[5, '5 sec'], [10, '10 sec'], [30, '30 sec'], [60, '1 min'], [300, '5 min'], [0, 'Never']]),
        note(IDLE_NOTE),
        choiceRow('Timer sound', 'sound', [[true, 'On'], [false, 'Off']])),
    );
    highlightCurrentChoices();
  }

  function highlightCurrentChoices() {
    const settings = Settings.get();
    $$('#sets .btn[data-key]').forEach((button) => {
      const isCurrent = JSON.stringify(settings[button.dataset.key]) === button.dataset.v;
      button.classList.toggle('sel', isCurrent);
      button.setAttribute('aria-pressed', String(isCurrent));
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
    if (all || ['voiceOn', 'voiceLang'].includes(key)) VoiceUI.onSetting(key);
    if (all || ['speakOn', 'speakVoice', 'voiceLang'].includes(key)) Speech.onSetting(key);
    if (all || key === 'timeFormat') ScreenTimeUI.refresh();
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
        'Restore all settings and backgrounds to their defaults? Your saved backgrounds will be deleted. Schedules, Screen Time history and the exit PIN are kept.',
        restoreDefaults);
    },
  };
})();
