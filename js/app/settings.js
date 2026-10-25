'use strict';
/* Settings: a validated key/value store persisted in localStorage.

   Every setting is registered once with a default value and a validator. Values read back from storage
   that fail their validator fall back to the default, so corrupt storage can never break the app.
   Settings.on(fn) is called with the changed key, or '*' after a reset. */

/* Time zones offered for the CLOCK DISPLAY. ('local' = whatever the device is set to.)
   Schedules always use the device's own time zone regardless of this choice. */
const TZ = [
  ['local', 'Device local time'],
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona (no DST)'],
  ['America/Los_Angeles', 'Pacific'],
  ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
];

/* Speech recognition languages offered for voice commands. */
const VLANGS = [
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['en-AU', 'English (Australia)'],
  ['en-CA', 'English (Canada)'],
  ['en-IN', 'English (India)'],
];

const Settings = (() => {
  const STORAGE_KEY = 'luna.settings.v1';
  const defaults = {};
  const validators = {};
  const current = {};
  const listeners = new Set();

  const notify = (key) => listeners.forEach((fn) => fn(key));

  return {
    register(key, defaultValue, isValid) {
      defaults[key] = defaultValue;
      validators[key] = isValid;
      current[key] = defaultValue;
    },

    load() {
      const saved = store.get(STORAGE_KEY, {});
      for (const key in defaults) {
        const usable = saved && key in saved && validators[key](saved[key]);
        current[key] = usable ? saved[key] : defaults[key];
      }
    },

    get: () => current,

    set(key, value) {
      if (!(key in validators) || !validators[key](value)) return false;
      current[key] = value;
      store.set(STORAGE_KEY, current);
      notify(key);
      Toast.show('Saved');
      return true;
    },

    reset() {
      for (const key in defaults) current[key] = defaults[key];
      store.set(STORAGE_KEY, current);
      notify('*');
    },

    on: (fn) => listeners.add(fn),
  };
})();

const isBoolean = (v) => typeof v === 'boolean';
const IDLE_CHOICES_SECONDS = [0, 5, 10, 30, 60, 300]; // 0 = never hide the controls

Settings.register('timeFormat', '12', (v) => v === '12' || v === '24');
Settings.register('timeZone', 'local', (v) => TZ.some((t) => t[0] === v));
Settings.register('motion', 'auto', (v) => ['auto', 'reduce', 'full'].includes(v));
Settings.register('sound', true, isBoolean);
Settings.register('idleSec', 10, (v) => IDLE_CHOICES_SECONDS.includes(v));
Settings.register('voiceOn', false, isBoolean);
Settings.register('wakeOn', false, isBoolean);
Settings.register('voiceLang', 'en-US', (v) => VLANGS.some((l) => l[0] === v));
Settings.load();
