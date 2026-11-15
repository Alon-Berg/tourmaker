/* Tourmaker - application state, storage (browser storage + files), undo, navigation. */
(function () {
  'use strict';
  const { h, clear, toast } = UI;
  const S = { T: null, view: 'home', round: 1, stRound: null, undo: [], redo: [], index: [], savedAt: null, focusSel: null, lastView: null };
  const App = window.App = { S };
  App.confirm = UI.confirm;

  // ---------------------------------------------------------------------------------------------- storage
  function loadIndex() { try { const a = JSON.parse(UI.store.get('htm.index') || '[]'); S.index = Array.isArray(a) ? a.filter((x) => x && x.id) : []; } catch (e) { S.index = []; } }
  function entryOf(T) { return { id: T.id, name: T.name, format: T.format, players: T.players.length, rounds: T.format === 'knockout' ? (T.ko ? T.ko.rounds.length : 0) : T.rounds.length, planned: HTM.plannedRounds(T), modified: T.modified }; }
  let warned = false;
  function writeEntry(T) {
    const ok1 = UI.store.set('htm.t.' + T.id, JSON.stringify(T));
    const e = entryOf(T), i = S.index.findIndex((x) => x.id === T.id);
    if (i >= 0) S.index[i] = e; else S.index.push(e);
    const ok2 = UI.store.set('htm.index', JSON.stringify(S.index));
    if (!(ok1 && ok2) && !warned) { warned = true; toast('The browser did not allow saving here. Use "Save file" to keep your tournament.', 'err'); }
    return ok1 && ok2;
  }
  function persist() {
    if (!S.T) return;
    writeEntry(S.T);
    UI.store.set('htm.cur', S.T.id);
    S.savedAt = new Date();
    updateStatus();
  }
  App.persist = persist;

  // ---------------------------------------------------------------------------------------------- changing the tournament (with undo)
  App.mutate = function (fn, opts) {
    opts = opts || {};
    const T = S.T, before = JSON.stringify(T);
    try { fn(T); } catch (e) { S.T = JSON.parse(before); toast(e.message || String(e), 'err'); App.render(); return false; }
    S.undo.push(before);
    if (S.undo.length > 150) S.undo.shift();
    S.redo = [];
    HTM.touch(S.T);
    persist();
    if (opts.quiet) renderTop(); else App.render();
    return true;
  };
  App.undo = function () { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.T)); S.T = JSON.parse(S.undo.pop()); persist(); App.render(); };
  App.redo = function () { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.T)); S.T = JSON.parse(S.redo.pop()); persist(); App.render(); };

  App.addTournament = function (T) { S.T = T; S.undo = []; S.redo = []; S.round = 1; S.stRound = null; S.view = 'players'; persist(); App.render(); };
  App.addPlayers = function (list) {
    const swissLate = S.T.started && S.T.format === 'swiss';
    App.mutate((t) => { for (const f of list) { if (swissLate) HTM.addLatePlayer(t, f, 'zero'); else HTM.addPlayer(t, f); } });
    if (swissLate) toast('Late entries get zero points for the rounds already paired. Change a bye in the player list if needed.');
  };
  App.addLatePlayer = function (f, kind) { App.mutate((t) => { HTM.addLatePlayer(t, f, kind); }); S.focusSel = '#add-name'; App.render(); };

  // ---------------------------------------------------------------------------------------------- navigation
  App.go = function (view) { S.view = view; S.lastView = null; App.render(); };
  App.home = function () { S.T = null; S.view = 'home'; S.undo = []; S.redo = []; S.lastView = null; UI.store.del('htm.cur'); App.render(); };
  App.openTournament = function (id) {
    const raw = UI.store.get('htm.t.' + id);
    if (!raw) { toast('This tournament is no longer in the browser storage.', 'err'); S.index = S.index.filter((x) => x.id !== id); UI.store.set('htm.index', JSON.stringify(S.index)); App.render(); return; }
    let T;
    try { T = HTM.validate(JSON.parse(raw)); } catch (e) { toast('This tournament could not be opened: ' + e.message, 'err'); return; }
    S.T = T; S.undo = []; S.redo = []; S.stRound = null;
    S.round = Math.max(1, T.rounds.length);
    S.view = T.started ? 'pairings' : 'players'; S.lastView = null;
    UI.store.set('htm.cur', id);
    App.render();
  };
  function loadAny(id) {
    if (S.T && S.T.id === id) return S.T;
    try { return HTM.validate(JSON.parse(UI.store.get('htm.t.' + id))); } catch (e) { return null; }
  }
  App.exportFile = function (id) {
    const T = loadAny(id);
    if (!T) { toast('This tournament could not be read.', 'err'); return; }
    UI.download(UI.slug(T.name) + '.tournament.json', HTM.exportJSON(T), 'application/json');
    toast('Saved a copy of "' + T.name + '" to your downloads.');
  };
  App.duplicate = function (id) {
    const T = loadAny(id);
    if (!T) { toast('This tournament could not be read.', 'err'); return; }
    const c = HTM.clone(T); c.id = HTM.uid('t'); c.name = T.name + ' (copy)'; c.created = c.modified = new Date().toISOString();
    writeEntry(c);
    toast('Duplicated as "' + c.name + '".');
    App.render();
  };
  App.remove = function (id) {
    const e = S.index.find((x) => x.id === id);
    App.confirm(['Delete the tournament "' + (e ? e.name : '') + '"?', 'It is removed from this browser and cannot be brought back. Use "Save file" first if you want to keep a copy.'], 'Delete', true).then((yes) => {
      if (!yes) return;
      UI.store.del('htm.t.' + id);
      S.index = S.index.filter((x) => x.id !== id);
      UI.store.set('htm.index', JSON.stringify(S.index));
      if (S.T && S.T.id === id) { S.T = null; S.view = 'home'; S.undo = []; S.redo = []; UI.store.del('htm.cur'); }
      App.render();
    });
  };
  App.importText = function (text) {
    try {
      const T = HTM.importJSON(text);
      if (S.index.some((x) => x.id === T.id)) { T.id = HTM.uid('t'); T.name += ' (opened file)'; }
      S.T = T; S.undo = []; S.redo = []; S.stRound = null; S.round = Math.max(1, T.rounds.length); S.view = T.started ? 'pairings' : 'players'; S.lastView = null;
      persist(); App.render(); toast('Opened "' + T.name + '".');
    } catch (e) { toast(e.message, 'err'); }
  };
  App.openFile = function () {
    const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    inp.addEventListener('change', async () => { if (inp.files[0]) { try { App.importText(await UI.readFile(inp.files[0])); } catch (e) { toast(e.message, 'err'); } } inp.remove(); });
    document.body.appendChild(inp); inp.click();
  };

  // a small demo: 12 players, three rounds played, the fourth paired
  App.demo = function () {
    const names = ['Alma Stone', 'Boaz Reed', 'Chloe Banks', 'Dov Marsh', 'Eden Cole', 'Fay Holt', 'Gil Moore', 'Hana Wells', 'Ivan Brooks', 'Jade Finch', 'Kobi Hart', 'Lena Frost'];
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const T = HTM.newTournament({ name: 'Demo club championship', format: 'swiss', rounds: 5, city: 'Chess club', timeControl: '15 minutes + 10 seconds per move' });
    names.forEach((n, i) => HTM.addPlayer(T, { name: n, rating: 2150 - i * 62 + Math.floor(rnd() * 30), title: i === 0 ? 'FM' : '', fed: '', club: i % 3 === 0 ? 'Rooks' : i % 3 === 1 ? 'Knights' : 'Bishops' }));
    HTM.sortByRating(T);
    const pm = HTM.playerMap(T);
    for (let r = 1; r <= 4; r++) {
      const res = HTM.pairSwiss(T, r); HTM.applySwissRound(T, r, res);
      if (r === 4) break;
      for (const g of T.rounds[r - 1].games) { const x = rnd(), pw = 1 / (1 + Math.pow(10, -(pm.get(g.w).rating - pm.get(g.b).rating) / 400)); g.res = x < 0.2 ? '1/2' : (x - 0.2) / 0.8 < pw ? '1-0' : '0-1'; }
    }
    S.T = T; S.undo = []; S.redo = []; S.round = 4; S.stRound = null; S.view = 'pairings'; S.lastView = null;
    persist(); App.render(); toast('A demo tournament was created. Enter the results of round 4 to continue.');
  };

  // ---------------------------------------------------------------------------------------------- drawing
  function logo() {
    const s = h('span', { style: { display: 'inline-flex' } });
    s.innerHTML = '<svg width="20" height="20" viewBox="0 0 16 16"><rect width="16" height="16" fill="#222"/><rect width="8" height="8" fill="#484848"/><rect x="8" y="8" width="8" height="8" fill="#484848"/><path d="M4 3h2v4l3-4h2.2L7.6 7.6 11.4 13H9L6 8.8V13H4z" fill="#fff"/></svg>';
    return s;
  }
  function updateStatus() {
    const el = UI.$('#top-status');
    if (!el || !S.T) return;
    const T = S.T, planned = HTM.plannedRounds(T);
    const parts = [HTM.FORMATS[T.format], T.players.length + ' players'];
    if (T.format === 'swiss') parts.push(T.rounds.length + ' of ' + planned + ' rounds paired');
    else if (T.format === 'roundrobin' && T.started) parts.push(T.rounds.filter((r, i) => HTM.roundComplete(T, i + 1)).length + ' of ' + planned + ' rounds played');
    el.textContent = parts.join(' - ') + (S.savedAt ? ' - saved ' + UI.fmtTime(S.savedAt) : '');
  }
  function renderTop() {
    const top = UI.$('#topbar');
    clear(top);
    top.append(h('div', { class: 'brand', title: 'All tournaments', style: { cursor: 'pointer' }, onclick: () => App.home() }, logo(), 'Tourmaker'));
    if (!S.T) return;
    const T = S.T;
    const tabs = [['players', 'Players'], ['pairings', T.format === 'knockout' ? 'Bracket' : 'Pairings'], ['standings', 'Standings']];
    if (T.format === 'roundrobin') tabs.push(['cross', 'Cross table']);
    tabs.push(['settings', 'Settings']);
    top.append(h('nav', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: 'tab-btn' + (S.view === k ? ' active' : ''), onclick: () => App.go(k) }, l))));
    top.append(h('div', { class: 'spacer' }), h('div', { id: 'top-status', title: T.name }),
      h('div', { class: 'top-tools' },
        h('button', { class: 'btn sm', disabled: !S.undo.length, title: 'Undo (Ctrl+Z)', onclick: () => App.undo() }, 'Undo'),
        h('button', { class: 'btn sm', disabled: !S.redo.length, title: 'Redo (Ctrl+Y)', onclick: () => App.redo() }, 'Redo'),
        h('button', { class: 'btn sm', onclick: () => App.exportFile(T.id) }, 'Save file'),
        h('button', { class: 'btn sm', onclick: () => App.home() }, 'Tournaments')));
    updateStatus();
  }
  App.refreshTop = renderTop;
  App.refreshTabs = function () {                                  // after a result was typed: refresh the round marks without redrawing the table
    const T = S.T;
    if (!T || S.view !== 'pairings') return;
    UI.$$('.toolbar .chip').forEach((c, i) => { const r = i + 1, done = r <= T.rounds.length && HTM.roundComplete(T, r); c.classList.toggle('done', done); c.textContent = r + (done ? ' ✓' : ''); });
  };
  App.render = function () {
    const main = UI.$('#main');
    const keep = S.lastView === S.view && S.T ? main.scrollTop : 0;
    renderTop();
    clear(main);
    try { main.append(S.T ? (window.Views[S.view] || window.Views.players)() : window.Views.home()); } catch (e) { console.error(e); main.append(h('div', { class: 'msg err' }, 'Something went wrong while drawing this screen: ' + e.message)); }
    S.lastView = S.view;
    main.scrollTop = keep;
    document.title = (S.T ? S.T.name + ' - ' : '') + 'Tourmaker';
    if (S.focusSel) { const el = UI.$(S.focusSel); if (el) el.focus(); S.focusSel = null; }
  };

  // ---------------------------------------------------------------------------------------------- keyboard, drag and drop, start
  document.addEventListener('keydown', (e) => {
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.querySelector('.modal-back')) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); App.undo(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); App.redo(); }
  });
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
  window.addEventListener('dragover', (e) => { if (document.body.classList.contains('dragging')) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    dragDepth = 0; document.body.classList.remove('dragging');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    try { App.importText(await UI.readFile(f)); } catch (err) { toast(err.message, 'err'); }
  });

  loadIndex();
  const cur = UI.store.get('htm.cur');
  if (cur && S.index.some((x) => x.id === cur)) App.openTournament(cur); else App.render();
})();
