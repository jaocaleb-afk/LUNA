'use strict';
/* Nav: switches between screens (home, timer, schedules, settings, ...).

   Nav.go(name)                 normal navigation: counts as user activity (resets the idle countdown)
   Nav.go(name, {silent:true})  used by the idle timer itself when it sends the display back to the clock */
const Nav = {
  cur: 'home',

  go(name, options) {
    const target = $('[data-screen="' + name + '"]');
    if (!target) return false;

    $$('.screen').forEach((screen) => screen.classList.toggle('on', screen === target));
    this.cur = name;

    if (name !== 'backgrounds') BgUI.revert();   // leaving the editor discards an unsaved preview
    if (name === 'schedules') ScheduleUI.enter();
    if (!(options && options.silent)) Idle.touch();
    return true;
  },
};
