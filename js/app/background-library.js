'use strict';
/* Library + Bg: the saved list of backgrounds (persisted, corruption-safe) and the code that paints the active one. */
const Library = (() => {
  const KEY = 'luna.bg.v2';
  let st = { list: [], active: 'midnight' };
  const save = () => store.set(KEY, st);
  function load() {
    const raw = store.get(KEY, null);
    let l = [];
    if (raw && Array.isArray(raw.list))
      l = raw.list.map(BgModel.clean).filter(Boolean);
    st = l.length ? { list: l, active: raw.active } : { list: BgModel.defaults(), active: 'midnight' };
    if (!st.list.some(x => x.id === st.active))
      st.active = st.list[0].id;
  }
  return {
    load, all: () => st.list, active: () => st.list.find(x => x.id === st.active), get: id => st.list.find(x => x.id === id),
    put(d) {
      const i = st.list.findIndex(x => x.id === d.id);
      i < 0 ? st.list.push(d) : st.list[i] = d;
      save();
    },
    del(id) {
      if (st.list.length < 2)
        return false;
      st.list = st.list.filter(x => x.id !== id);
      if (st.active === id)
        st.active = st.list[0].id;
      save();
      return true;
    },
    use(id) {
      if (this.get(id)) {
        st.active = id;
        save();
      }
    }, reset() {
      st = { list: BgModel.defaults(), active: 'midnight' };
      save();
    }
  };
})();
const Bg = (() => {
  const el = () => $('#bgl');
  const reduced = () => {
    const m = Settings.get().motion;
    return m === 'reduce' || (m === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  function show(d) {
    document.body.classList.toggle('reduced', reduced());
    BgModel.apply(el(), d, reduced());
  }
  return { show, showActive: () => show(Library.active()) };
})();
