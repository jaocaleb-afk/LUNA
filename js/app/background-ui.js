'use strict';
/* BgUI: the Backgrounds screen: library strip and the editor (solid / gradient / animated). */
const BgUI = (() => {
  let draft = null;
  let dirty = false;
  const E = (t, a = {}, h = '') => {
    const e = document.createElement(t);
    Object.assign(e, a);
    if (h)
      e.innerHTML = h;
    return e;
  };
  function lib() {
    const L = $('#lib');
    L.innerHTML = '';
    Library.all().forEach(d => {
      const t = E('button', { className: 'btn' + (draft && draft.id === d.id ? ' sel' : '') });
      const p = E('div');
      BgModel.apply(p, d, true);
      p.style.flex = '1';
      t.append(p, E('span', { textContent: d.name + (Library.active().id === d.id ? ' ✓' : '') }));
      t.onclick = () => {
        draft = JSON.parse(JSON.stringify(d));
        dirty = false;
        Bg.show(draft);
        lib();
        ed();
      };
      L.append(t);
    });
  }
  const upd = () => {
    dirty = true;
    Bg.show(draft);
  };
  function field(lbl, node) {
    const f = E('div', { className: 'f' });
    f.append(E('label', { textContent: lbl }), node);
    return f;
  }
  function range(k, min, max) {
    const r = E('input', { type: 'range', min, max, value: draft[k] });
    r.oninput = () => {
      draft[k] = +r.value;
      upd();
    };
    return r;
  }
  function seg(k, opts, after) {
    const w = E('div', { className: 'row' });
    opts.forEach(([v, t]) => {
      const b = E('button', { className: 'btn' + (draft[k] === v ? ' sel' : ''), textContent: t });
      b.onclick = () => {
        draft[k] = v;
        if (after)
          after();
        upd();
        ed();
      };
      w.append(b);
    });
    return w;
  }
  function stopRow(s, i) {
    const r = E('div', { className: 'stop' });
    const c = E('input', { type: 'color', value: s.c });
    const h = E('input', { type: 'text', value: s.c, maxLength: 7 });
    const p = E('input', { type: 'range', min: 0, max: 100, value: s.p });
    const x = E('button', {
      className: 'btn', textContent: '✕', disabled: draft.stops.length <= 2
    });
    c.oninput = () => {
      s.c = c.value;
      h.value = c.value;
      h.classList.remove('bad');
      upd();
    };
    h.oninput = () => {
      let v = h.value.trim();
      if (v[0] !== '#')
        v = '#' + v;
      if (BgModel.HEX.test(v)) {
        s.c = v.toLowerCase();
        c.value = s.c;
        h.classList.remove('bad');
        upd();
      }
      else
        h.classList.add('bad');
    };
    p.oninput = () => {
      s.p = +p.value;
      upd();
    };
    x.onclick = () => {
      draft.stops.splice(i, 1);
      upd();
      ed();
    };
    r.append(c, h, p, x);
    return r;
  }
  function ed() {
    const D = $('#ed');
    D.innerHTML = '';
    if (!draft)
      return D.append(E('div', {
        className: 'card mut', textContent: 'Pick a background above, or choose New.'
      }));
    const a = E('div', { className: 'card' });
    const b = E('div', { className: 'card' });
    const nm = E('input', { type: 'text', value: draft.name, maxLength: 40 });
    nm.oninput = () => {
      draft.name = nm.value;
      dirty = true;
    };
    a.append(field('Name', nm), seg('type', [['solid', 'Solid'], ['gradient', 'Gradient'], ['anim', 'Animated']], () => {
      if (draft.type !== 'solid' && draft.stops.length < 2)
        draft.stops = [{ c: '#0d1330', p: 0 }, { c: '#05070f', p: 100 }];
    }));
    if (draft.type === 'solid') {
      const c = E('input', { type: 'color', value: draft.color });
      const h = E('input', { type: 'text', value: draft.color, maxLength: 7 });
      c.oninput = () => {
        draft.color = c.value;
        h.value = c.value;
        h.classList.remove('bad');
        upd();
      };
      h.oninput = () => {
        let v = h.value.trim();
        if (v[0] !== '#')
          v = '#' + v;
        if (BgModel.HEX.test(v)) {
          draft.color = v.toLowerCase();
          c.value = draft.color;
          h.classList.remove('bad');
          upd();
        }
        else
          h.classList.add('bad');
      };
      b.append(field('Color', c), field('HEX', h));
    }
    else {
      if (draft.type === 'gradient' || draft.style !== 'spin')
        b.append(field('Shape', seg('kind', [['linear', 'Linear'], ['radial', 'Radial']])));
      b.append(field('Angle', range('angle', 0, 360)));
      draft.stops.forEach((s, i) => b.append(stopRow(s, i)));
      const add = E('button', {
        className: 'btn', textContent: 'Add color stop', disabled: draft.stops.length >= 8
      });
      add.onclick = () => {
        draft.stops.push({ c: '#9aa3ff', p: 100 });
        upd();
        ed();
      };
      b.append(add);
      if (draft.type === 'anim') {
        const styleChoices = BgModel.STYLES.map(s => [s, s[0].toUpperCase() + s.slice(1)]);
        a.append(
          field('Style', seg('style', styleChoices)),
          field('Speed', range('speed', 1, 100)),
          field('Intensity', range('intensity', 0, 100)),
          field('Direction', seg('dir', [['normal', 'Forward'], ['reverse', 'Reverse']])));
      }
    }
    const act = E('div', { className: 'row' });
    const btn = (t, f, c = '') => {
      const x = E('button', { className: 'btn ' + c, textContent: t });
      x.onclick = f;
      act.append(x);
    };
    btn('Save', () => {
      const c = BgModel.clean(draft);
      if (!c)
        return Toast.show('Needs at least 2 valid colors');
      draft = c;
      Library.put(c);
      dirty = false;
      lib();
      Toast.show('Saved');
    }, 'pri');
    btn('Use as background', () => {
      const c = BgModel.clean(draft);
      if (!c)
        return;
      draft = c;
      Library.put(c);
      Library.use(c.id);
      dirty = false;
      lib();
      Toast.show('Background set');
    });
    btn('Duplicate', () => {
      const c = BgModel.clean(Object.assign({}, JSON.parse(JSON.stringify(draft)), { id: '', name: draft.name + ' copy' }));
      Library.put(c);
      draft = c;
      lib();
      ed();
      Toast.show('Duplicated');
    });
    btn('Delete', () => confirmDlg('Delete “' + draft.name + '”?', () => {
      if (!Library.get(draft.id))
        draft = null;
      else if (!Library.del(draft.id))
        return Toast.show('Keep at least one background');
      else
        draft = null;
      dirty = false;
      Bg.showActive();
      lib();
      ed();
    }));
    b.append(act);
    D.append(a, b);
  }
  return {
    init() {
      $('#bgnew').onclick = () => {
        draft = BgModel.clean({
          type: 'gradient', name: 'New background', stops: [{ c: '#2a2152', p: 0 }, { c: '#0a0e1d', p: 100 }]
        });
        dirty = true;
        Bg.show(draft);
        lib();
        ed();
      };
      $('#bgback').onclick = () => Nav.go('home');
      lib();
      ed();
    },
    enter() {
      draft = JSON.parse(JSON.stringify(Library.active()));
      dirty = false;
      lib();
      ed();
    },
    revert() {
      if (draft) {
        draft = null;
        Bg.showActive();
      }
    }, refresh() {
      lib();
    }
  };
})();
