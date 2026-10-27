'use strict';
/* main: wires everything together once all modules have loaded. Keep this file small.
   Each module is started inside safe(), so one failing module is logged and the rest still work. */

// Screen buttons: anything with data-go="screen" navigates there.
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-go]');
  if (!button) return;
  Nav.go(button.dataset.go);
  TimerUI.render();
});
document.querySelector('[data-go="backgrounds"]').addEventListener('click', () => BgUI.enter());

// Ways into a screen while the controls are hidden: open /#settings (or #timer, #schedules, ...).
function routeFromHash() {
  const name = location.hash.slice(1);
  if (!name || !Nav.go(name)) return;
  if (name === 'backgrounds') BgUI.enter();
  TimerUI.render();
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* e.g. file:// */ }
}
addEventListener('hashchange', routeFromHash);

addEventListener('error', (e) => console.error('LUNA:', e.message));

// When the page becomes visible again (e.g. the device woke up) refresh the clock and check schedules immediately.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  Clock.render();
  safe('schedule-resume', ScheduleRunner.runTick);
});

Library.load();
Rules.load();
PinStore.load();

safe('settings', SettingsUI.init);
safe('clock', () => Clock.start());
safe('backgrounds', () => { Bg.showActive(); BgUI.init(); });
safe('timer', TimerUI.init);
safe('assistant', () => $$('[data-cmd]').forEach(Assistant.mount));
safe('schedules', ScheduleUI.init);
safe('idle', Idle.init);
safe('speech', Speech.init);
safe('voice', VoiceUI.init);
safe('screen-time', ScreenTimeUI.init);
safe('pin', PinUI.init);
safe('kiosk', Kiosk.init);
safe('schedule-runner', ScheduleRunner.start);
safe('route', routeFromHash);
