'use strict';
/* Clock: renders the time, date and zone name once per second, aligned to the second boundary. Only touches the DOM when the text changed. */
const Clock = (() => {
  let f;
  let h = 0;
  let lhm = '';
  let ldt = '';
  let ltz = '';
  const part = (p, t) => (p.find(x => x.type === t) || {}).value || '';
  function build() {
    const s = Settings.get();
    const h12 = s.timeFormat === '12';
    const tz = s.timeZone === 'local' ? undefined : s.timeZone;
    try {
      f = {
        t: new Intl.DateTimeFormat('en-US', {
          timeZone: tz, hour: h12 ? 'numeric' : '2-digit', minute: '2-digit', second: '2-digit', hourCycle: h12 ? 'h12' : 'h23'
        }),
        d: new Intl.DateTimeFormat('en-US', {
          timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        }), z: new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'long' })
      };
    }
    catch (e) {
      f = null;
    }
  }
  function say(d = new Date()) {
    if (!f)
      return d.toLocaleTimeString();
    const p = f.t.formatToParts(d);
    return part(p, 'hour') + ':' + part(p, 'minute') + (part(p, 'dayPeriod') ? ' ' + part(p, 'dayPeriod') : '');
  }
  function render() {
    clearTimeout(h);
    const d = new Date();
    if (f) {
      const p = f.t.formatToParts(d);
      const ap = part(p, 'dayPeriod');
      const hmH = part(p, 'hour') + ':' + part(p, 'minute') + (ap ? '<small>' + ap + '</small>' : '');
      if (hmH !== lhm) {
        $('#hm').innerHTML = hmH;
        lhm = hmH;
      }
      const dt = f.d.format(d);
      const tzn = part(f.z.formatToParts(d), 'timeZoneName');
      if (dt !== ldt) {
        $('#date').textContent = dt;
        ldt = dt;
      }
      if (tzn !== ltz) {
        $('#tzl').textContent = tzn;
        ltz = tzn;
      }
      $('#sec i').style.width = (+part(p, 'second') / 59 * 100) + '%';
    }
    else {
      $('#hm').textContent = d.toLocaleTimeString();
      $('#date').textContent = d.toDateString();
    }
    h = setTimeout(render, 1005 - (Date.now() % 1000));
  }
  return {
    start() {
      build();
      render();
    }, rebuild() {
      lhm = ldt = ltz = '';
      build();
      render();
    }, render, say
  };
})();
