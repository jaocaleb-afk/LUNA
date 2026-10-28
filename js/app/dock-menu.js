'use strict';
/* DockMenu: the "More" menu on the home-screen toolbar.

   The toolbar keeps the everyday controls one tap away (Timer, Screen Time, Schedules, Talk). The rest
   (Assistant, Backgrounds, Settings, Fullscreen) sit in a small menu that opens above the More button.
   It is a plain disclosure: a button with aria-expanded that shows or hides a group of ordinary buttons,
   so it works the same with touch, mouse, keyboard and screen readers.

   It closes when: an item is chosen, the person taps elsewhere, Escape is pressed, or the controls hide (idle). */
const DockMenu = (() => {
  const isOpen = () => !$('#moremenu').hidden;

  function setOpen(open, { focusFirst = false, returnFocus = false } = {}) {
    const menu = $('#moremenu');
    const button = $('#more');
    if (!menu || !button || isOpen() === open) return;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open && focusFirst) {
      const first = $('.btn:not([hidden])', menu);
      if (first) first.focus();
    }
    if (!open && returnFocus) button.focus();
  }

  const close = (options) => setOpen(false, options);

  return {
    isOpen,
    close,

    init() {
      const button = $('#more');
      const menu = $('#moremenu');
      // A keyboard "click" (Enter/Space) has no pointer position: move focus into the menu for keyboard users.
      button.addEventListener('click', (e) => setOpen(!isOpen(), { focusFirst: e.detail === 0 }));
      menu.addEventListener('click', (e) => { if (e.target.closest('.btn')) close(); });
      document.addEventListener('pointerdown', (e) => {
        if (isOpen() && !e.target.closest('#moremenu, #more')) close();
      }, true);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) close({ returnFocus: true });
      });
    },
  };
})();
