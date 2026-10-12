(() => {
  'use strict';

  const DATA_URL = 'data/techniques.json';
  const BASE_TITLE = document.title;
  const START_DEPTH = 2; // open the tree to families on first load

  const KINDS = { root: 'Overview', pillar: 'Pillar', family: 'Family', group: 'Group', technique: 'Technique' };
  const LIST_TITLES = { root: 'Pillars', pillar: 'Families', family: 'Groups', group: 'Techniques' };

  // Per depth (root, pillar, family, group, technique): column width, box height, row slot.
  const COLW = [176, 210, 232, 236, 312];
  const BOXH = [46, 40, 38, 32, 26];
  const SLOT = [62, 56, 50, 40, 32];
  const GAP = 52;
  const X = [];
  for (let d = 0, x = 24; d < COLW.length; d++) { X.push(x); x += COLW[d] + GAP; }

  const $ = (id) => document.getElementById(id);
  const el = {
    summary: $('summary'), search: $('search'), matchText: $('match-text'), clear: $('clear'),
    legend: $('legend'), pane: $('tree'), status: $('tree-status'), canvas: $('canvas'),
    details: $('details'), dDot: $('d-dot'), dKind: $('d-kind'), dCrumbs: $('d-crumbs'), dTitle: $('d-title'),
    dFlag: $('d-flag'), dDesc: $('d-desc'), dOrigin: $('d-origin'), dOriginText: $('d-origin-text'),
    dStats: $('d-stats'), dListWrap: $('d-list-wrap'), dListTitle: $('d-list-title'), dList: $('d-list'),
    announcer: $('announcer')
  };
  const narrow = matchMedia('(max-width: 899px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const nodes = {};
  const order = [];
  const totals = { pillar: 0, family: 0, group: 0, technique: 0 };
  const state = { expanded: {}, selected: 'root', query: '', searchOpen: {} };
  let pos = {};
  let pendingScroll = null;
  let anchor = null;
  let announceTimer = 0;

  // ---------- Data ----------

  function index(tree) {
    const walk = (n, parent, depth, color) => {
      n.parent = parent;
      n.depth = depth;
      n.color = n.color || color || '#1B1F27';
      n.count = 0;
      n.hay = fold(n.name + ' ' + (n.full || '') + (n.kind === 'technique' ? ' ' + (n.desc || '') + ' ' + (n.origin || '') : ''));
      nodes[n.id] = n;
      order.push(n.id);
      if (totals[n.kind] !== undefined) totals[n.kind] += 1;
      if (n.children && n.children.length) {
        n.children.forEach((c) => walk(c, n, depth + 1, n.kind === 'root' ? null : n.color));
        n.children.forEach((c) => { n.count += c.kind === 'technique' ? 1 : c.count; });
      }
    };
    walk(tree, null, 0, null);
  }

  function expandTo(k) {
    const e = {};
    order.forEach((id) => { const n = nodes[id]; if (n.children && n.depth < k) e[id] = true; });
    return e;
  }

  // ---------- Search ----------

  let mKey = null;
  let mList = [];
  let mAnc = null;

  // Lower-case and treat hyphens, dashes and runs of spaces alike, so "chain of thought" finds "Chain-of-thought".
  function fold(s) {
    return s.toLowerCase().replace(/[\s\-‐-―_]+/g, ' ');
  }

  const isSearching = (q) => !!q && q.trim().length >= 2;

  function matches(q) {
    const key = fold(q || '').trim();
    if (key === mKey) return mList;
    mKey = key;
    mList = [];
    mAnc = null;
    if (key.length < 2) return mList;
    order.forEach((id) => {
      const n = nodes[id];
      if (n.kind !== 'root' && n.hay.includes(key)) mList.push(id);
    });
    return mList;
  }

  function searchAncestors(q) {
    const m = matches(q);
    if (mAnc) return mAnc;
    mAnc = {};
    m.forEach((id) => { for (let p = nodes[id].parent; p; p = p.parent) mAnc[p.id] = true; });
    return mAnc;
  }

  // ---------- Actions ----------

  function update(patch) {
    Object.assign(state, patch);
    render();
  }

  // A click in the tree: open a closed node, select an open one, close the selected one.
  function pick(id) {
    const n = nodes[id];
    if (!n) return;
    anchor = pos[id] ? { id, y: pos[id].y, scroll: el.pane.scrollTop } : null;
    if (isSearching(state.query)) {
      const so = Object.assign({}, state.searchOpen);
      if (n.children && !searchAncestors(state.query)[id]) {
        if (so[id] && state.selected === id) delete so[id]; else so[id] = true;
      }
      update({ selected: id, searchOpen: so });
    } else {
      const ex = Object.assign({}, state.expanded);
      if (n.children) { if (!ex[id]) ex[id] = true; else if (state.selected === id) delete ex[id]; }
      update({ selected: id, expanded: ex });
    }
    if (narrow.matches && n.kind === 'technique') {
      el.details.scrollIntoView({ behavior: motion(), block: 'start' });
    }
  }

  // Jump to any node: open its ancestors, select it and scroll it into view.
  function goTo(id) {
    const n = nodes[id];
    if (!n) return;
    const ex = Object.assign({}, state.expanded);
    for (let p = n.parent; p; p = p.parent) ex[p.id] = true;
    pendingScroll = id;
    el.search.value = '';
    update({ selected: id, expanded: ex, query: '', searchOpen: {} });
  }

  function setQuery(q) {
    const m = matches(q);
    pendingScroll = m.length ? m[0] : null;
    update({ query: q, searchOpen: {} });
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { el.announcer.textContent = el.matchText.hidden ? '' : el.matchText.textContent; }, 600);
  }

  const motion = () => (reducedMotion.matches ? 'auto' : 'smooth');

  // ---------- Layout ----------

  function layout(exp) {
    let cursor = 20;
    let maxD = 0;
    const vis = [];
    const segs = [];
    const place = (n) => {
      const d = n.depth;
      const open = !!(n.children && exp[n.id]);
      vis.push(n);
      if (open) {
        const ys = n.children.map(place);
        n._cy = (ys[0] + ys[ys.length - 1]) / 2;
        cursor += d <= 1 ? 14 : 6;
      } else {
        n._cy = cursor + SLOT[d] / 2;
        cursor += SLOT[d];
      }
      n._open = open;
      if (d > maxD) maxD = d;
      if (open) {
        const px = X[d] + COLW[d];
        const mid = px + GAP / 2;
        const t = d <= 1 ? 2 : 1.5;
        const first = n.children[0]._cy;
        const last = n.children[n.children.length - 1]._cy;
        const top = Math.min(n._cy, first);
        const bot = Math.max(n._cy, last);
        const seg = (x, y, w, h) => segs.push({ x, y, w, h, c: n.color, root: d === 0 });
        seg(px, n._cy - t / 2, mid - px, t);
        seg(mid - t / 2, top - t / 2, t, bot - top + t);
        n.children.forEach((ch) => seg(mid, ch._cy - t / 2, X[d + 1] - mid, t));
      }
      return n._cy;
    };
    place(nodes.root);
    return { vis, segs, w: X[maxD] + COLW[maxD] + 32, h: cursor + 24 };
  }

  // ---------- Rendering ----------

  function span(cls, text) {
    const s = document.createElement('span');
    s.className = cls;
    if (text !== undefined) s.textContent = text;
    return s;
  }

  function nodeButton(n, isSel, isMatch, isDim) {
    const d = n.depth;
    const top = n._cy - BOXH[d] / 2;
    const hasKids = !!(n.children && n.children.length);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'node k-' + n.kind + (isSel ? ' is-selected' : '') + (isMatch ? ' is-match' : '') + (isDim ? ' is-dim' : '');
    b.dataset.id = n.id;
    b.style.cssText = `left:${X[d]}px;top:${top}px;width:${COLW[d]}px;height:${BOXH[d]}px;--c:${n.color}`;
    b.title = n.full || n.name;
    b.setAttribute('aria-label', n.name + (hasKids ? ', ' + n.count + ' techniques' : '') + (n.flag ? ', unproven' : ''));
    if (hasKids) b.setAttribute('aria-expanded', String(n._open));
    if (isSel) b.setAttribute('aria-current', 'true');
    if (!hasKids) b.append(span('dot'));
    b.append(span('lbl', n.name));
    if (n.flag) b.append(span('badge unproven', 'unproven'));
    if (hasKids) {
      const tog = span('tog', n._open ? '−' : '+');
      tog.setAttribute('aria-hidden', 'true');
      b.append(span('badge', String(n.count)), tog);
    }
    pos[n.id] = { x: X[d], y: top, h: BOXH[d] };
    return b;
  }

  function renderTree() {
    const q = state.query;
    const searching = isSearching(q);
    const mSet = new Set(searching ? matches(q) : []);
    const anc = searching ? searchAncestors(q) : {};
    const exp = searching ? Object.assign({}, anc, state.searchOpen) : state.expanded;
    const L = layout(exp);

    const active = document.activeElement;
    const focusId = active && el.canvas.contains(active) ? active.dataset.id : null;

    const frag = document.createDocumentFragment();
    L.segs.forEach((g) => {
      const ln = document.createElement('div');
      ln.className = g.root ? 'ln from-root' : 'ln';
      ln.setAttribute('aria-hidden', 'true');
      ln.style.cssText = `left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px;--c:${g.c}`;
      frag.append(ln);
    });
    pos = {};
    L.vis.forEach((n) => {
      const isMatch = mSet.has(n.id);
      frag.append(nodeButton(n, n.id === state.selected, isMatch, searching && !isMatch && !anc[n.id]));
    });
    el.canvas.replaceChildren(frag);
    el.canvas.style.width = L.w + 'px';
    el.canvas.style.height = L.h + 'px';
    el.canvas.classList.toggle('is-searching', searching);

    if (focusId) {
      const b = el.canvas.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
      if (b) b.focus({ preventScroll: true });
    }
  }

  function crumbButton(n) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'crumb';
    b.dataset.goto = n.id;
    b.textContent = n.kind === 'root' ? 'All techniques' : n.name;
    return b;
  }

  function listItem(c) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item';
    b.dataset.goto = c.id;
    const dot = span('dot');
    dot.style.setProperty('--c', c.color);
    b.append(dot, span('name', c.name));
    if (c.flag) b.append(span('badge unproven', 'unproven'));
    if (c.kind !== 'technique') b.append(span('badge', String(c.count)));
    li.append(b);
    return li;
  }

  function renderDetails() {
    const n = nodes[state.selected] || nodes.root;

    el.dDot.style.setProperty('--c', n.color);
    el.dKind.textContent = KINDS[n.kind];

    const crumbs = [];
    for (let p = n.parent; p; p = p.parent) crumbs.unshift(p);
    el.dCrumbs.replaceChildren(...crumbs.flatMap((p) => {
      const sep = span('crumb-sep', '›');
      sep.setAttribute('aria-hidden', 'true');
      return [crumbButton(p), sep];
    }));
    el.dCrumbs.hidden = crumbs.length === 0;

    el.dTitle.textContent = n.full || n.name;
    el.dFlag.hidden = !n.flag;
    el.dDesc.textContent = n.desc || '';
    el.dDesc.hidden = !n.desc;
    el.dOriginText.textContent = n.origin || '';
    el.dOrigin.hidden = !n.origin;

    let stats = '';
    if (n.kind === 'root') stats = `${totals.technique} techniques · ${totals.pillar} pillars · ${totals.family} families · ${totals.group} groups`;
    else if (n.kind === 'pillar') stats = `${n.count} techniques in ${n.children.length} families`;
    else if (n.kind === 'family') stats = `${n.count} techniques in ${n.children.length} groups`;
    else if (n.kind === 'group') stats = `${n.count} techniques`;
    el.dStats.textContent = stats;
    el.dStats.hidden = !stats;

    let list, listTitle;
    if (n.kind === 'technique') {
      list = n.parent.children.filter((c) => c.id !== n.id);
      listTitle = 'Also in ' + n.parent.name;
    } else {
      list = n.children || [];
      listTitle = LIST_TITLES[n.kind];
    }
    el.dListTitle.textContent = listTitle;
    el.dList.replaceChildren(...list.map(listItem));
    el.dListWrap.hidden = list.length === 0;
  }

  function renderSearchMeta() {
    const q = state.query;
    const has = q.length > 0;
    el.matchText.hidden = !has;
    el.clear.hidden = !has;
    if (!has) return;
    if (!isSearching(q)) { el.matchText.textContent = 'Type 2+ letters'; return; }
    const m = matches(q);
    const techs = m.filter((id) => nodes[id].kind === 'technique').length;
    const grp = m.length - techs;
    el.matchText.textContent = m.length === 0
      ? 'No matches'
      : techs + ' technique' + (techs === 1 ? '' : 's') + (grp ? ' + ' + grp + ' group' + (grp === 1 ? '' : 's') : '');
  }

  function syncLocation() {
    const n = nodes[state.selected] || nodes.root;
    const hash = n.kind === 'root' ? '' : '#' + n.id;
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
    document.title = n.kind === 'root' ? BASE_TITLE : (n.full || n.name) + ' · ' + BASE_TITLE;
  }

  function settleScroll() {
    const pane = el.pane;
    if (pendingScroll && pos[pendingScroll]) {
      const p = pos[pendingScroll];
      pane.scrollTo({ left: Math.max(0, p.x - 120), top: Math.max(0, p.y - pane.clientHeight / 2), behavior: motion() });
    } else if (anchor && pos[anchor.id]) {
      // Keep the clicked node where it was, but pull up an opened node's first child if room allows.
      const p = pos[anchor.id];
      let top = anchor.scroll + (p.y - anchor.y);
      const n = nodes[anchor.id];
      if (n._open && pos[n.children[0].id]) {
        const firstTop = pos[n.children[0].id].y - 16;
        if (firstTop < top) top = Math.max(firstTop, p.y + p.h + 16 - pane.clientHeight);
      }
      pane.scrollTop = Math.max(0, top);
      // Bring the opened node's child column into view when it sits past the right edge.
      if (n._open) {
        const right = X[n.depth + 1] + COLW[n.depth + 1] + 24;
        if (right > pane.scrollLeft + pane.clientWidth) {
          pane.scrollTo({ left: Math.max(0, Math.min(p.x - 24, right - pane.clientWidth)), behavior: motion() });
        }
      }
    }
    pendingScroll = null;
    anchor = null;
  }

  function render() {
    renderTree();
    renderDetails();
    renderSearchMeta();
    settleScroll();
    syncLocation();
  }

  function renderLegend() {
    el.legend.replaceChildren(...nodes.root.children.map((pl) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.goto = pl.id;
      const dot = span('dot dot-lg');
      dot.style.setProperty('--c', pl.color);
      b.append(dot, document.createTextNode(pl.name));
      return b;
    }));
  }

  // ---------- Wiring ----------

  el.canvas.addEventListener('click', (e) => {
    const b = e.target.closest('.node');
    if (b) pick(b.dataset.id);
  });

  el.details.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    goTo(b.dataset.goto);
    el.dTitle.focus();
  });

  el.legend.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b) goTo(b.dataset.goto);
  });

  document.querySelectorAll('[data-depth]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!order.length) return;
      el.search.value = '';
      update({ expanded: expandTo(Number(b.dataset.depth)), query: '', searchOpen: {} });
    });
  });

  el.search.addEventListener('input', () => { if (order.length) setQuery(el.search.value); });
  el.search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.search.value) { e.preventDefault(); el.search.value = ''; setQuery(''); }
  });
  el.clear.addEventListener('click', () => { el.search.value = ''; setQuery(''); el.search.focus(); });

  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (nodes[id] && id !== state.selected) goTo(id);
  });

  // ---------- Boot ----------

  function start(tree) {
    index(tree);
    el.summary.textContent = `${totals.technique} techniques · ${totals.pillar} pillars · ${totals.family} families · ${totals.group} groups. Click a node to open it and read about it.`;
    renderLegend();
    el.status.hidden = true;
    el.canvas.hidden = false;
    state.expanded = expandTo(START_DEPTH);
    const id = decodeURIComponent(location.hash.slice(1));
    if (nodes[id] && id !== 'root') goTo(id);
    else render();
  }

  function fail(err) {
    let msg = `The technique data could not be loaded (${(err && err.message) || err}). Reload the page to try again.`;
    if (location.protocol === 'file:') {
      msg += ' Browsers block data loading on pages opened straight from disk: serve this folder with a local web server instead, for example "python -m http.server".';
    }
    el.status.textContent = msg;
    el.status.classList.add('is-error');
  }

  fetch(DATA_URL)
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(start)
    .catch(fail);
})();
