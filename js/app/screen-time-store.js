'use strict';
/* ScreenTimeStore: reads and writes the Screen Time record in localStorage ("luna.screentime.v1").
   It only moves text in and out; whether the data can be trusted is decided by ScreenTimeRecord.clean()
   (core/screen-time-storage.js). Kept apart from settings, so "Restore defaults" never touches it.

   load() -> {status:'missing'} | {status:'ok', value} | {status:'unreadable'}   (bad JSON, or storage blocked)
   save(record) -> true only if the browser really kept it (written, then read back) */
const ScreenTimeStore = (() => {
  const KEY = 'luna.screentime.v1';

  function load() {
    let text;
    try { text = localStorage.getItem(KEY); } catch (e) { return { status: 'unreadable' }; }
    if (text === null) return { status: 'missing' };
    try { return { status: 'ok', value: JSON.parse(text) }; } catch (e) { return { status: 'unreadable' }; }
  }

  function save(record) {
    const text = JSON.stringify(record);
    try {
      localStorage.setItem(KEY, text);
      return localStorage.getItem(KEY) === text;
    } catch (e) {
      return false;
    }
  }

  return { KEY, load, save };
})();
