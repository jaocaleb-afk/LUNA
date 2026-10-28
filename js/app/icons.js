'use strict';
/* Icons: small line icons for buttons, drawn as inline SVG.
   Inline SVG instead of emoji, because Raspberry Pi OS often has no colour-emoji font (emoji show as empty boxes),
   and instead of an icon font, to keep LUNA free of downloads and dependencies.

   In HTML:   <span class="ico" data-icon="timer"></span>   (filled in by Icons.decorate() at start-up)
   In code:   Icons.make('mic')                              -> a <span class="ico"> holding the SVG
   Icons are decoration only (aria-hidden); every button keeps a visible text label. */
const Icons = (() => {
  /* 24×24 outline paths, drawn with the button's text colour. */
  const PATHS = {
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5M12 2.5V5"/>',
    hourglass: '<path d="M6.5 3h11M6.5 21h11M7.5 3c0 5 4.5 6 4.5 9s-4.5 4-4.5 9M16.5 3c0 5-4.5 6-4.5 9s4.5 4 4.5 9"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
    chat: '<path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    expand: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    home: '<path d="M4 11l8-7 8 7M6.5 9.5V20h11V9.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };

  function svg(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(ns, 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '1.8');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('focusable', 'false');
    el.innerHTML = PATHS[name] || '';
    return el;
  }

  /* Put icon `name` into the span (replacing any icon already there). */
  function set(span, name) {
    if (span.dataset.drawn === name) return;
    span.dataset.icon = name;
    span.dataset.drawn = name;
    span.setAttribute('aria-hidden', 'true');
    span.replaceChildren(svg(name));
  }

  function make(name) {
    const span = document.createElement('span');
    span.className = 'ico';
    set(span, name);
    return span;
  }

  return {
    make,
    set,
    decorate(root = document) { $$('[data-icon]', root).forEach((span) => set(span, span.dataset.icon)); },
  };
})();
