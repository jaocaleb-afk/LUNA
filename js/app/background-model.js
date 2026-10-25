'use strict';
/* BgModel: the background data model.
     clean(raw)  validate/sanitise one background (returns null if unusable)
     apply(el, background, reducedMotion)  paint it onto an element using CSS only
   Everything is validated on the way in, so no stored or typed text ever reaches CSS unchecked.

   A background is one of:
     solid     {type:'solid', color}
     gradient  {type:'gradient', kind:'linear'|'radial', angle, stops:[{c:'#rrggbb', p:0-100}, ...]}
     anim      a gradient plus {style:'flow'|'spin'|'drift', speed, intensity, dir} */
const BgModel = (() => {
  const HEX = /^#[0-9a-f]{6}$/i;
  const STYLES = ['flow', 'spin', 'drift'];
  const TYPES = ['solid', 'gradient', 'anim'];
  const MAX_STOPS = 8;

  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const randomId = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  function cleanStops(raw) {
    return (Array.isArray(raw) ? raw : [])
      .filter((stop) => stop && HEX.test(stop.c))
      .slice(0, MAX_STOPS)
      .map((stop) => ({ c: stop.c.toLowerCase(), p: clamp(stop.p, 0, 100, 0) }))
      .sort((a, b) => a.p - b.p);
  }

  function clean(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!TYPES.includes(raw.type)) return null;

    const stops = cleanStops(raw.stops);
    if (raw.type !== 'solid' && stops.length < 2) return null; // a gradient needs at least two colours

    return {
      id: String(raw.id || '').slice(0, 40) || randomId(),
      name: String(raw.name || 'Untitled').slice(0, 40),
      type: raw.type,
      color: HEX.test(raw.color) ? raw.color : '#0d1330',
      kind: raw.kind === 'radial' ? 'radial' : 'linear',
      angle: clamp(raw.angle, 0, 360, 160),
      style: STYLES.includes(raw.style) ? raw.style : 'flow',
      speed: clamp(raw.speed, 1, 100, 30),
      intensity: clamp(raw.intensity, 0, 100, 50),
      dir: raw.dir === 'reverse' ? 'reverse' : 'normal',
      stops,
    };
  }

  /* ---------- painting ---------- */
  const stopList = (stops) => stops.map((s) => s.c + ' ' + s.p + '%').join(',');

  function gradientCss(bg) {
    const stops = stopList(bg.stops);
    const radial = bg.kind === 'radial' && bg.style !== 'spin'; // note: the spin style is always linear
    return radial
      ? 'radial-gradient(circle at 50% 50%,' + stops + ')'
      : 'linear-gradient(' + bg.angle + 'deg,' + stops + ')';
  }

  /* CSS "animation" value, e.g. "flow 41.0s ease-in-out infinite alternate". Keyframes live in luna.css. */
  function animationCss(bg) {
    const seconds = (62 - bg.speed * 0.6).toFixed(1) + 's';
    const spin = bg.style === 'spin';
    const timing = spin ? ' linear' : ' ease-in-out';
    const reverse = bg.dir === 'reverse';
    const direction = spin ? (reverse ? 'reverse' : 'normal') : (reverse ? 'alternate-reverse' : 'alternate');
    return bg.style + ' ' + seconds + timing + ' infinite ' + direction;
  }

  function apply(el, bg, reducedMotion) {
    el.style.cssText = '';
    el.style.animation = 'none';

    if (bg.type === 'solid') { el.style.background = bg.color; return; }
    if (bg.type === 'gradient') { el.style.background = gradientCss(bg); return; }

    // animated
    if (bg.style === 'spin') {
      el.style.setProperty('--a', bg.angle + 'deg'); // --a is animated by the "spin" keyframes
      el.style.background = 'linear-gradient(var(--a),' + stopList(bg.stops) + ')';
    } else {
      const size = 120 + bg.intensity * 3 + '%';
      el.style.background = gradientCss(bg);
      el.style.backgroundSize = size + ' ' + size;
    }
    if (!reducedMotion) el.style.animation = animationCss(bg);
  }

  /* ---------- the built-in backgrounds ---------- */
  const stop = (c, p) => ({ c, p });
  const DEFAULTS = [
    { id: 'midnight', name: 'Midnight', type: 'gradient', kind: 'linear', angle: 160,
      stops: [stop('#0d1330', 0), stop('#05070f', 100)] },
    { id: 'dusk', name: 'Dusk', type: 'gradient', kind: 'linear', angle: 170,
      stops: [stop('#2a2152', 0), stop('#10152e', 60), stop('#0a0e1d', 100)] },
    { id: 'ink', name: 'Ink', type: 'solid', color: '#06070c' },
    { id: 'moonlight', name: 'Moonlight', type: 'gradient', kind: 'radial',
      stops: [stop('#2b3768', 0), stop('#0b1024', 70), stop('#05070f', 100)] },
    { id: 'aurora', name: 'Aurora', type: 'anim', style: 'flow', angle: 120, speed: 35, intensity: 55,
      stops: [stop('#0b1a3a', 0), stop('#12b886', 40), stop('#3b5bdb', 70), stop('#9c36b6', 100)] },
    { id: 'ember', name: 'Ember spin', type: 'anim', style: 'spin', angle: 0, speed: 25, intensity: 50,
      stops: [stop('#1a0b1f', 0), stop('#7a2a4a', 35), stop('#d9774a', 65), stop('#1a0b1f', 100)] },
    { id: 'nebula', name: 'Nebula drift', type: 'anim', style: 'drift', kind: 'radial', speed: 30, intensity: 60,
      stops: [stop('#6d4bd8', 0), stop('#1b1e5a', 45), stop('#05070f', 100)] },
  ];
  const defaults = () => DEFAULTS.map(clean);

  return { clean, apply, defaults, STYLES, HEX };
})();
