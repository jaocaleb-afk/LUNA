'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const safe = (n, f) => {
  try {
    f();
  }
  catch (e) {
    console.error('LUNA module failed:', n, e);
  }
};
const Toast = {
  t: 0, show(m, ms = 1400) {
    const e = $('#toast');
    e.textContent = m;
    e.classList.add('on');
    clearTimeout(this.t);
    this.t = setTimeout(() => e.classList.remove('on'), ms);
  }
};
const store = {
  get(k, d) {
    try {
      const v = JSON.parse(localStorage.getItem(k));
      return v == null ? d : v;
    }
    catch (e) {
      return d;
    }
  }, set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    }
    catch (e) {
    }
  }
};
const confirmDlg = (msg, ok) => {
  const d = $('#dlg');
  $('#dlgt').textContent = msg;
  $('#yes').onclick = () => {
    d.close();
    ok();
  };
  $('#no').onclick = () => d.close();
  if (d.showModal) {
    d.showModal();
    Idle.hold('dlg', true);
    d.addEventListener('close', () => Idle.hold('dlg', false), { once: true });
  }
  else if (confirm(msg))
    ok();
};
const fmt = ms => {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
};
const H = (t, props, attrs, ...kids) => {
  const e = document.createElement(t);
  if (props)
    Object.assign(e, props);
  if (attrs)
    for (const k in attrs)
      e.setAttribute(k, attrs[k]);
  kids.flat().forEach(k => e.append(k));
  return e;
};
const setText = (e, t) => {
  if (e.textContent !== t)
    e.textContent = t;
};
