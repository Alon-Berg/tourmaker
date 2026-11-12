/* Human Tournament Maker - the screens: tournaments list, players, pairings and results, bracket, standings, cross table, settings. */
(function () {
  'use strict';
  const { h, clear, toast } = UI;
  const V = window.Views = {};
  const S = () => window.App.S;
  const nameOf = (p) => Dialogs.nameOf(p);
  const P = (t, id) => t.players.find((x) => x.id === id);
  const field = (label, ...ctl) => h('div', { class: 'field' }, h('label', {}, label), h('div', { class: 'inline' }, ...ctl));
  const fmtDay = (d) => { try { return d ? new Date(d + 'T00:00:00').toLocaleDateString([], { dateStyle: 'medium' }) : ''; } catch (e) { return d; } };

  function empty(title, text, ...actions) {
    return h('div', { class: 'card', style: { maxWidth: '760px', margin: '24px auto' } }, h('div', { class: 'empty' }, h('b', {}, title), text,
      actions.length ? h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } }, actions) : null));
  }
  function printHeader(T, subtitle) {
    return h('div', { class: 'print-only' }, h('h1', { dir: 'auto' }, T.name), h('p', {}, [T.city, fmtDay(T.startDate) + (T.endDate && T.endDate !== T.startDate ? ' - ' + fmtDay(T.endDate) : ''), T.timeControl].filter((x) => x && x.trim()).join('   |   ')),
      T.arbiter ? h('p', {}, 'Arbiter: ' + T.arbiter) : null, h('p', { style: { fontWeight: 600 } }, subtitle));
  }
  function who(T, p, withRating) {
    const o = T.opts;
    return h('span', { dir: 'auto' }, (o.showTitle && p.title ? p.title + ' ' : '') + (p.name || '(no name)'));
  }
  const symOf = (e) => (e.out === 'W' ? '1' : e.out === 'D' ? '½' : '0');

  // ---------------------------------------------------------------------------------------------- tournaments list
  V.home = function () {
    const idx = S().index.slice().sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
    const wrap = h('div', { style: { maxWidth: '1000px', margin: '0 auto' } });
    wrap.append(h('div', { class: 'toolbar' }, h('button', { class: 'btn primary lg', onclick: () => Dialogs.newTournament() }, 'New tournament'), h('button', { class: 'btn lg', onclick: () => App.openFile() }, 'Open file...'), h('button', { class: 'btn lg', onclick: () => App.demo() }, 'Try a demo')));
    if (!idx.length) {
      wrap.append(h('div', { class: 'card' }, h('div', { class: 'empty' }, h('b', {}, 'No tournaments yet'),
        'Run a chess tournament between people: enter the players, let the program pair every round, type the results and print the pairings and standings. Swiss system, round robin and knockout are included. Everything stays on this computer.')));
      return wrap;
    }
    const tb = h('table', { class: 'tbl full click' }, h('thead', {}, h('tr', {}, ['Tournament', 'Format', 'Players', 'Rounds', 'Last change', ''].map((x) => h('th', {}, x)))));
    const body = h('tbody', {});
    for (const e of idx) {
      const rounds = e.format === 'knockout' ? '' : e.rounds + ' of ' + e.planned;
      body.append(h('tr', { onclick: () => App.openTournament(e.id) }, h('td', { dir: 'auto' }, e.name), h('td', {}, HTM.FORMATS[e.format] || e.format), h('td', { class: 'r' }, e.players), h('td', { class: 'c' }, rounds), h('td', {}, UI.fmtDate(e.modified)),
        h('td', { class: 'c nowrap', onclick: (ev) => ev.stopPropagation() },
          h('button', { class: 'btn sm', onclick: () => App.openTournament(e.id) }, 'Open'), ' ',
          h('button', { class: 'btn sm', onclick: () => App.exportFile(e.id) }, 'Save file'), ' ',
          h('button', { class: 'btn sm', onclick: () => App.duplicate(e.id) }, 'Duplicate'), ' ',
          h('button', { class: 'btn sm', onclick: () => App.remove(e.id) }, 'Delete'))));
    }
    tb.append(body);
    wrap.append(h('div', { class: 'card' }, tb), h('p', { class: 'help' }, 'Tournaments are saved in this browser after every change. Use "Save file" to keep a copy or to move a tournament to another computer.'));
    return wrap;
  };

  // ---------------------------------------------------------------------------------------------- players
  V.players = function () {
    const T = S().T, started = T.started;
    const wrap = h('div', {});
    const canAdd = !(started && T.format !== 'swiss');
    const nm = h('input', { class: 'input', id: 'add-name', dir: 'auto', placeholder: 'Name', style: { minWidth: '190px', width: '240px' } });
    const ti = h('select', { class: 'select auto', title: 'Title' }, HTM.TITLES.map((t) => h('option', { value: t }, t || '-')));
    const rt = h('input', { class: 'input num', placeholder: 'Rating', inputmode: 'numeric' });
    const fd = h('input', { class: 'input', placeholder: 'Fed', style: { width: '58px' }, maxlength: 3 });
    const cl = h('input', { class: 'input', placeholder: 'Club', style: { width: '160px' } });
    const add = () => {
      if (!nm.value.trim()) { toast('Enter a name.', 'err'); nm.focus(); return; }
      const f = { name: nm.value.trim(), title: ti.value, rating: parseInt(rt.value, 10) || 0, fed: fd.value.trim().toUpperCase(), club: cl.value.trim() };
      S().focusSel = '#add-name';
      if (started && T.format === 'swiss') Dialogs.latePlayer(f); else App.addPlayers([f]);
    };
    for (const el of [nm, rt, fd, cl]) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    const tools = h('div', { class: 'toolbar' }, nm, ti, rt, fd, cl, h('button', { class: 'btn primary', disabled: !canAdd, onclick: add }, started && T.format === 'swiss' ? 'Add late entry' : 'Add player'),
      h('button', { class: 'btn', disabled: !canAdd, onclick: () => Dialogs.pasteList() }, 'Paste a list...'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', disabled: started, title: 'Number the players by rating (strongest first)', onclick: () => App.mutate((t) => HTM.sortByRating(t)) }, 'Sort by rating'));
    wrap.append(tools);
    if (started && T.format !== 'swiss') wrap.append(h('div', { class: 'msg' }, 'The ' + (T.format === 'knockout' ? 'bracket' : 'schedule') + ' has been created, so players can no longer be added or removed. Withdraw a player instead, or delete the ' + (T.format === 'knockout' ? 'bracket' : 'schedule') + ' in the settings to start over.'));
    if (!T.players.length) { wrap.append(h('div', { class: 'card' }, h('div', { class: 'empty' }, h('b', {}, 'No players yet'), 'Type a name and press Enter, or paste a whole list. The number in the first column is the starting rank: the strongest player gets number 1.'))); return wrap; }

    const tb = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['No', 'Title', 'Name', 'Rating', 'Fed', 'Club', 'Status', ''].map((x) => h('th', {}, x)))));
    const body = h('tbody', {});
    const ps = HTM.playersByNo(T);
    const set = (id, key, conv) => (e) => App.mutate((t) => { P(t, id)[key] = conv ? conv(e.target.value) : e.target.value.trim(); }, { quiet: true });
    ps.forEach((p, i) => {
      const status = [];
      if (p.withdrawn !== null && p.withdrawn !== undefined) status.push(T.format === 'swiss' ? 'withdrawn from round ' + p.withdrawn : 'withdrawn');
      const byeTxt = Object.keys(p.byes || {}).sort((a, b) => a - b).map((r) => 'R' + r + ' ' + (p.byes[r] === 'half' ? '½' : p.byes[r] === 'zero' ? '0' : '1')).join(', ');
      if (byeTxt) status.push('bye ' + byeTxt);
      const acts = [];
      if (!started) {
        acts.push(h('button', { class: 'btn sm ghost', title: 'Move up', disabled: i === 0, onclick: () => App.mutate((t) => { const a = P(t, p.id), b = P(t, ps[i - 1].id); const x = a.no; a.no = b.no; b.no = x; HTM.renumber(t); }) }, '▲'));
        acts.push(h('button', { class: 'btn sm ghost', title: 'Move down', disabled: i === ps.length - 1, onclick: () => App.mutate((t) => { const a = P(t, p.id), b = P(t, ps[i + 1].id); const x = a.no; a.no = b.no; b.no = x; HTM.renumber(t); }) }, '▼'));
        acts.push(h('button', { class: 'btn sm ghost', title: 'Remove', onclick: () => App.mutate((t) => HTM.removePlayer(t, p.id)) }, '✕'));
      } else {
        if (T.format === 'swiss') acts.push(h('button', { class: 'btn sm', onclick: () => Dialogs.byes(p.id) }, 'Byes...'));
        if (p.withdrawn !== null && p.withdrawn !== undefined) { if (T.format === 'swiss') acts.push(h('button', { class: 'btn sm', onclick: () => App.mutate((t) => { P(t, p.id).withdrawn = null; }) }, 'Re-enter')); }
        else acts.push(h('button', { class: 'btn sm', onclick: () => Dialogs.withdraw(p.id) }, 'Withdraw'));
      }
      const off = p.withdrawn !== null && p.withdrawn !== undefined;
      body.append(h('tr', { class: off ? 'off' : '' },
        h('td', { class: 'r' }, p.no),
        h('td', { class: 'in' }, h('select', { class: 'cell', style: { width: '62px' }, onchange: set(p.id, 'title') }, HTM.TITLES.map((t) => h('option', { value: t, selected: p.title === t }, t)))),
        h('td', { class: 'in name' }, h('input', { class: 'cell', dir: 'auto', value: p.name, onchange: set(p.id, 'name') })),
        h('td', { class: 'in' }, h('input', { class: 'cell r', style: { width: '64px', textAlign: 'right' }, value: p.rating || '', inputmode: 'numeric', onchange: set(p.id, 'rating', (v) => parseInt(v, 10) || 0) })),
        h('td', { class: 'in' }, h('input', { class: 'cell', style: { width: '52px' }, maxlength: 3, value: p.fed, onchange: set(p.id, 'fed', (v) => v.trim().toUpperCase()) })),
        h('td', { class: 'in' }, h('input', { class: 'cell', style: { width: '160px' }, dir: 'auto', value: p.club, onchange: set(p.id, 'club') })),
        h('td', { class: 'tag' }, status.join('; ')),
        h('td', { class: 'nowrap' }, acts)));
    });
    tb.append(body);
    wrap.append(h('div', { class: 'card', style: { display: 'inline-block', maxWidth: '100%', overflow: 'auto' } }, tb));
    const active = ps.filter((p) => p.withdrawn === null || p.withdrawn === undefined).length;
    wrap.append(h('p', { class: 'help' }, ps.length + ' players' + (active !== ps.length ? ' (' + active + ' still playing)' : '') + '. Click a cell to change it.' + (!started && T.format === 'swiss' ? ' Recommended number of rounds for ' + ps.length + ' players: ' + Math.max(3, Math.ceil(Math.log2(Math.max(2, ps.length)))) + ' to ' + Math.max(4, Math.ceil(Math.log2(Math.max(2, ps.length))) + 2) + '.' : '')));
    return wrap;
  };

  // ---------------------------------------------------------------------------------------------- pairings and results
  function startPrompt(T, what, go) {                       // offers to sort by rating before the first pairing
    const sorted = T.players.every((p, i, a) => i === 0 || a[i - 1].rating >= p.rating);
    if (sorted || T.started) { go(); return; }
    UI.modal({
      title: 'Starting ranks', width: 'min(520px, 100%)', noFocus: true,
      body: h('p', {}, 'The players are not numbered by rating. The starting ranks decide who plays whom ' + what + '. Sort the players by rating first?'),
      buttons: [{ label: 'Cancel' }, { label: 'Keep my order', onClick: () => go() }, { label: 'Sort by rating', primary: true, onClick: () => { App.mutate((t) => HTM.sortByRating(t)); go(); } }],
    });
  }

  V.pairings = function () {
    const T = S().T;
    if (T.format === 'knockout') return V.bracket();
    if (T.players.length < 2) return empty('Enter at least two players first', 'The pairings are made from the player list.', h('button', { class: 'btn primary', onclick: () => App.go('players') }, 'Go to the players'));
    if (T.format === 'roundrobin' && !T.started) {
      const n = T.players.length, rounds = HTM.plannedRounds(T);
      return empty('Ready to create the schedule', n + ' players: ' + rounds + ' round' + (rounds > 1 ? 's' : '') + (T.opts.doubleRR ? ' (two games between every pair)' : '') + '. The pairings follow the FIDE Berger tables, so the starting ranks matter; after the schedule is created the player list is locked.',
        h('button', { class: 'btn primary lg', onclick: () => startPrompt(T, 'in the schedule', () => App.mutate((t) => HTM.createRoundRobin(t))) }, 'Create the schedule'));
    }
    const planned = Math.max(HTM.plannedRounds(T), T.rounds.length);
    let r = Math.max(1, Math.min(S().round || 1, Math.max(planned, 1)));
    if (T.format === 'swiss' && r > T.rounds.length + 1) r = T.rounds.length + 1;
    S().round = r;
    const wrap = h('div', {});
    const chips = h('div', { class: 'toolbar' }, h('b', {}, 'Round'));
    for (let i = 1; i <= planned; i++) {
      const done = i <= T.rounds.length && HTM.roundComplete(T, i);
      chips.append(h('span', { class: 'chip' + (i === r ? ' on' : '') + (done ? ' done' : '') + (i > T.rounds.length ? ' off' : ''), title: i > T.rounds.length ? 'not paired yet' : done ? 'all results entered' : 'results missing', onclick: () => { S().round = i; App.render(); } }, i + (done ? ' ✓' : '')));
    }
    wrap.append(chips);
    const rd = T.rounds[r - 1];
    if (!rd) {                                                       // Swiss: the next round is not paired yet
      const block = HTM.nextRoundBlock(T);
      wrap.append(h('div', { class: 'card' }, h('div', { class: 'empty' }, h('b', {}, 'Round ' + r + ' is not paired yet'), block ? block : 'All results are in. The pairings follow the Dutch system: players with the same score meet, nobody plays the same opponent twice, colours alternate, and the bye goes to the lowest-ranked player.',
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } }, h('button', { class: 'btn primary lg', disabled: !!block, onclick: () => V.pairNext() }, 'Pair round ' + r)))));
      return wrap;
    }
    // summary and tools
    const sum = h('span', { class: 'muted' });
    const tools = h('div', { class: 'toolbar' }, sum, h('span', { class: 'spacer' }));
    const isLast = r === T.rounds.length;
    if (T.format === 'swiss') {
      const block = HTM.nextRoundBlock(T);
      tools.append(h('button', { class: 'btn', disabled: !isLast, title: 'Change the players of the boards', onclick: () => Dialogs.editRound(r) }, 'Edit pairings...'),
        h('button', { class: 'btn', disabled: !isLast, onclick: () => V.deleteRound() }, 'Delete round ' + r),
        h('button', { class: 'btn primary', disabled: !!block || !isLast, title: block || '', onclick: () => V.pairNext() }, 'Pair round ' + (r + 1)));
    }
    tools.append(h('button', { class: 'btn', onclick: () => window.print() }, 'Print'));
    wrap.append(tools, printHeader(T, 'Round ' + r + (T.format === 'swiss' ? ' of ' + planned : '') + ' - pairings'));
    wrap.append(boardTable(T, r, rd, sum));
    if (rd.byes.length) {
      wrap.append(h('div', { class: 'card', style: { marginTop: '10px', display: 'inline-block' } }, h('b', {}, T.format === 'roundrobin' ? 'Round off: ' : 'Byes: '), rd.byes.map((b, i) => h('span', {}, i ? '; ' : '', h('span', { dir: 'auto' }, nameOf(P(T, b.p))), ' (' + HTM.BYE_LABEL[b.kind].toLowerCase() + (b.kind === 'rest' ? '' : ', ' + HTM.fmtPts(HTM.byePoints(T.opts, b.kind)) + ' point' + (HTM.byePoints(T.opts, b.kind) > 1 ? 's' : '')) + ')'))));
    }
    const out = T.players.filter((p) => !HTM.isActive(p, r) && !rd.byes.some((b) => b.p === p.id));
    if (out.length) wrap.append(h('p', { class: 'help' }, 'Not playing this round (withdrawn): ' + out.map(nameOf).join(', ')));
    return wrap;
  };

  function boardTable(T, r, rd, sumEl) {
    const byNo = new Map(T.players.map((p) => [p.id, p]));
    const o = T.opts;
    const opts = [''].concat(HTM.RESULTS);
    const head = ['Bd', 'No', 'White'].concat(o.showRating ? ['Rtg'] : [], ['Result', 'Black'], o.showRating ? ['Rtg'] : [], ['No']);
    const tb = h('table', { class: 'tbl board-tbl' }, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))));
    const body = h('tbody', {});
    const rows = [];
    function summary() {
      const have = rd.games.filter((g) => g.res).length;
      sumEl.textContent = rd.games.length + ' board' + (rd.games.length === 1 ? '' : 's') + ', ' + have + ' result' + (have === 1 ? '' : 's') + ' entered' + (have === rd.games.length ? ' - round complete' : ', ' + (rd.games.length - have) + ' missing');
    }
    function paint(i) { rows[i].classList.toggle('pend', !rd.games[i].res); }
    function setRes(i, val, move) {
      const wasComplete = HTM.roundComplete(T, r);
      App.mutate((t) => { t.rounds[r - 1].games[i].res = val || null; }, { quiet: true });
      const nowComplete = rd.games.every((g) => g.res);
      rows[i].querySelector('select').value = val || '';
      paint(i); summary();
      if (wasComplete !== nowComplete) {                                   // the buttons that depend on a finished round change: draw the screen again, keep the place
        S().focusSel = '.board-tbl tr[data-i="' + (move && rows[i + 1] ? i + 1 : i) + '"]';
        App.render();
        return;
      }
      if (move && rows[i + 1]) rows[i + 1].focus();
      App.refreshTabs();
    }
    rd.games.forEach((g, i) => {
      const w = byNo.get(g.w), b = byNo.get(g.b);
      const sel = h('select', { class: 'cell', onchange: (e) => setRes(i, e.target.value, false) }, opts.map((v) => h('option', { value: v, selected: (g.res || '') === v }, v ? HTM.RESULT_LABEL[v] : '')));
      const tr = h('tr', { tabindex: 0, 'data-i': i },
        h('td', { class: 'c' }, i + 1), h('td', { class: 'r' }, w.no), h('td', { class: 'pl' }, who(T, w)), o.showRating ? h('td', { class: 'r' }, w.rating || '') : null,
        h('td', { class: 'res in' }, sel), h('td', { class: 'pl' }, who(T, b)), o.showRating ? h('td', { class: 'r' }, b.rating || '') : null, h('td', { class: 'r' }, b.no));
      rows.push(tr); body.append(tr); paint(i);
    });
    tb.append(body);
    summary();
    body.addEventListener('keydown', (e) => {                       // keyboard entry on a focused row: 1 = White wins, 0 = Black wins, = / 5 = draw, Delete = clear, arrows move
      const tr = e.target.closest ? e.target.closest('tr') : null;
      if (!tr || e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = parseInt(tr.getAttribute('data-i'), 10);
      const k = e.key;
      const map = { '1': '1-0', '0': '0-1', '=': '1/2', '5': '1/2', d: '1/2', D: '1/2', '+': '+-', '-': '-+' };
      if (map[k]) { e.preventDefault(); setRes(i, map[k], true); }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); setRes(i, '', false); }
      else if (k === 'ArrowDown' && rows[i + 1]) { e.preventDefault(); rows[i + 1].focus(); }
      else if (k === 'ArrowUp' && rows[i - 1]) { e.preventDefault(); rows[i - 1].focus(); }
    });
    const quick = h('input', { class: 'input', style: { width: '230px' }, placeholder: 'Quick entry: board result, e.g. 3 1', title: '1 = White wins, 0 = Black wins, = or 5 = draw' });
    quick.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const m = quick.value.trim().match(/^(\d+)\s*([10=5dD+-])$/);
      if (!m || +m[1] < 1 || +m[1] > rd.games.length) { toast('Type a board number and a result: 3 1 (White wins), 3 0 (Black wins), 3 = (draw).', 'err'); return; }
      setRes(+m[1] - 1, { '1': '1-0', '0': '0-1', '=': '1/2', '5': '1/2', d: '1/2', D: '1/2', '+': '+-', '-': '-+' }[m[2]], false);
      quick.value = '';
    });
    return h('div', {}, h('div', { class: 'toolbar noprint' }, quick, h('span', { class: 'help' }, '1 = White wins, 0 = Black wins, = draw. You can also click a row and press 1, 0 or =.')), h('div', { class: 'card', style: { display: 'inline-block', maxWidth: '100%', overflow: 'auto' } }, tb));
  }

  V.pairNext = function () {
    const T = S().T;
    const block = HTM.nextRoundBlock(T);
    if (block) { toast(block, 'err'); return; }
    const go = () => {
      const r = T.rounds.length + 1;
      let res = HTM.pairSwiss(T, r);
      const apply = (x) => { App.mutate((t) => HTM.applySwissRound(t, r, x)); S().round = r; App.render(); (x.warnings || []).forEach((w) => toast(w)); };
      if (res.error) {
        App.confirm([res.error, 'Pair this round anyway and allow players to meet again?'], 'Allow repeats').then((yes) => { if (yes) { res = HTM.pairSwiss(T, r, { allowRepeats: true }); if (res.error) toast(res.error, 'err'); else apply(res); } });
        return;
      }
      apply(res);
    };
    startPrompt(T, 'in round 1', go);
  };
  V.deleteRound = function () {
    const T = S().T, r = T.rounds.length;
    const have = T.rounds[r - 1].games.filter((g) => g.res).length;
    App.confirm(['Delete the pairings of round ' + r + '?', have ? have + ' result' + (have > 1 ? 's' : '') + ' entered in this round will be lost.' : 'No results have been entered in this round.', 'You can undo this with the Undo button.'], 'Delete round ' + r, true).then((yes) => {
      if (yes) { App.mutate((t) => { t.rounds.pop(); if (!t.rounds.length) t.started = false; }); S().round = Math.max(1, r); App.render(); }
    });
  };

  // ---------------------------------------------------------------------------------------------- knockout bracket
  V.bracket = function () {
    const T = S().T;
    if (T.players.length < 2) return empty('Enter at least two players first', 'The bracket is made from the player list.', h('button', { class: 'btn primary', onclick: () => App.go('players') }, 'Go to the players'));
    if (!T.ko) {
      let size = 2; while (size < T.players.length) size *= 2;
      return empty('Ready to create the bracket', T.players.length + ' players: ' + HTM.plannedRounds(T) + ' rounds' + (size > T.players.length ? ', the top ' + (size - T.players.length) + ' seed' + (size - T.players.length > 1 ? 's' : '') + ' get a bye in the first round' : '') + '. Seed 1 meets the lowest seed, so the starting ranks matter; after the bracket is created the player list is locked.',
        h('button', { class: 'btn primary lg', onclick: () => startPrompt(T, 'in the bracket', () => App.mutate((t) => HTM.createKnockout(t))) }, 'Create the bracket'));
    }
    const byNo = new Map(T.players.map((p) => [p.id, p]));
    const wrap = h('div', {});
    wrap.append(h('div', { class: 'toolbar' }, h('span', { class: 'muted' }, 'Click a match to enter its games. ' + T.opts.koGames + (T.opts.koGames === 1 ? ' game' : ' games') + ' per match.'), h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => window.print() }, 'Print')), printHeader(T, 'Knockout bracket'));
    const br = h('div', { class: 'bracket' });
    T.ko.rounds.forEach((rd, r) => {
      const col = h('div', { class: 'rnd' }, h('h4', {}, HTM.koRoundName(T.ko.size, r)));
      rd.forEach((m, j) => {
        const w = HTM.koWinner(m), s = HTM.koScore(m);
        const line = (id, side, seed) => { const p = id ? byNo.get(id) : null; return h('div', { class: w === side ? 'win' : '' }, h('span', { class: 'seed' }, seed || ''), h('span', { class: 'nm', dir: 'auto' }, p ? nameOf(p) : (m.bye && !id ? 'bye' : '')), h('span', {}, p && s.done ? HTM.fmtPts(side === 'a' ? s.a : s.b) : '')); };
        const gm = m.games.some(Boolean) ? m.games.map((g) => (g ? HTM.RESULT_LABEL[g] : '-')).join(', ') + (m.tb ? '  (tie-break: ' + nameOf(byNo.get(m.tb === 'a' ? m.a : m.b)) + ')' : '') : '';
        const card = h('div', { class: 'match', onclick: () => { if (m.a && m.b && !m.bye) Dialogs.match(r, j); }, title: m.a && m.b && !m.bye ? 'Enter the games' : '' }, line(m.a, 'a', m.sa), line(m.b, 'b', m.sb), gm ? h('div', { class: 'gm' }, gm) : null);
        col.append(card);
      });
      br.append(col);
    });
    wrap.append(br);
    const st = HTM.koStandings(T);
    const champ = st.find((x) => x.champion);
    if (champ) wrap.append(h('div', { class: 'card', style: { marginTop: '10px', display: 'inline-block' } }, h('b', {}, 'Winner: '), h('span', { dir: 'auto' }, nameOf(champ.p))));
    return wrap;
  };

  // ---------------------------------------------------------------------------------------------- standings
  V.standings = function () {
    const T = S().T;
    if (T.format === 'knockout') return koStandings(T);
    if (!T.rounds.length) return empty('No standings yet', 'The standings appear as soon as the first round is paired.', h('button', { class: 'btn primary', onclick: () => App.go('pairings') }, 'Go to the pairings'));
    const last = T.rounds.length;
    let upto = S().stRound && S().stRound <= last ? S().stRound : last;
    const st = HTM.annotate(T, HTM.standings(T, upto));
    const o = T.opts;
    const wrap = h('div', {});
    const sel = h('select', { class: 'select auto', onchange: (e) => { S().stRound = parseInt(e.target.value, 10); App.render(); } }, Array.from({ length: last }, (_, i) => i + 1).map((r) => h('option', { value: r, selected: r === upto }, 'After round ' + r)));
    wrap.append(h('div', { class: 'toolbar' }, h('b', {}, 'Standings'), sel, h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => UI.download(UI.slug(T.name) + '-standings.csv', '﻿' + HTM.csv(HTM.standingsRows(T, st)), 'text/csv') }, 'Save as CSV'),
      h('button', { class: 'btn', onclick: async () => { const ok = await UI.copy(HTM.standingsRows(T, st).map((r) => r.join('\t')).join('\n')); toast(ok ? 'Copied: paste it into a spreadsheet.' : 'Copying failed.', ok ? '' : 'err'); } }, 'Copy'),
      h('button', { class: 'btn', onclick: () => window.print() }, 'Print')));
    wrap.append(printHeader(T, 'Standings after round ' + upto));
    const missing = [];
    for (let r = 1; r <= upto; r++) { const n = T.rounds[r - 1].games.filter((g) => !g.res).length; if (n) missing.push('round ' + r + ' (' + n + ')'); }
    if (missing.length) wrap.append(h('div', { class: 'msg warn noprint' }, 'Results are missing in ' + missing.join(', ') + ', so the standings are provisional.'));
    const head = ['Rk', 'No'].concat(o.showTitle ? ['Ti'] : [], ['Name'], o.showRating ? ['Rtg'] : [], o.showFed ? ['Fed'] : [], o.showClub ? ['Club'] : [], ['Pts'], st.tbs.map((id) => HTM.TB[id].short));
    if (T.format === 'swiss') for (let r = 1; r <= upto; r++) head.push('Rd' + r);
    const tb = h('table', { class: 'tbl click' }, h('thead', {}, h('tr', {}, head.map((x, i) => h('th', { title: HTM.TIEBREAKS.find((t) => t.short === x) ? HTM.TIEBREAKS.find((t) => t.short === x).name : '' }, x)))));
    const body = h('tbody', {});
    for (const row of st.rows) {
      const p = row.p;
      const off = p.withdrawn !== null && p.withdrawn !== undefined;
      const tr = h('tr', { class: off ? 'off' : '', onclick: () => Dialogs.playerCard(p.id, upto) },
        h('td', { class: 'r' }, row.rank + (row.tied ? '' : '')), h('td', { class: 'r' }, p.no), o.showTitle ? h('td', {}, p.title) : null, h('td', { class: 'name', dir: 'auto' }, p.name || '(no name)'), o.showRating ? h('td', { class: 'r' }, p.rating || '') : null,
        o.showFed ? h('td', {}, p.fed) : null, o.showClub ? h('td', { dir: 'auto' }, p.club) : null, h('td', { class: 'r', style: { fontWeight: 700 } }, HTM.fmtPts(row.points)),
        st.tbs.map((id, k) => h('td', { class: 'r' + (k === 0 ? ' sep' : '') }, HTM.fmtTb(id, id === 'de' ? row.tbShow.de : row.tb[id]))),
        T.format === 'swiss' ? row.entries.map((e, k) => h('td', { class: 'c' + (k === 0 ? ' sep' : '') }, HTM.cellText(T, row, e))) : null);
      body.append(tr);
    }
    tb.append(body);
    wrap.append(h('div', { class: 'card', style: { display: 'inline-block', maxWidth: '100%', overflow: 'auto' } }, tb));
    wrap.append(h('p', { class: 'help noprint' }, 'Tie-breaks in this order: ' + st.tbs.map((id) => HTM.TB[id].name).join(', ') + (st.tbs.length ? '.' : 'none.') + ' Round cells: opponent number, colour (w/b) and result; bye, H = half-point bye, Z = zero-point bye, F = full-point bye, + / - = forfeit. Click a player for the whole card.'));
    return wrap;
  };

  function koStandings(T) {
    if (!T.ko) return empty('No standings yet', 'Create the bracket first.', h('button', { class: 'btn primary', onclick: () => App.go('pairings') }, 'Go to the bracket'));
    const st = HTM.koStandings(T);
    const last = T.ko.rounds.length - 1;
    const tb = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Rank', 'Seed', 'Name', 'Rtg', 'Result', 'Matches won'].map((x) => h('th', {}, x)))));
    const body = h('tbody', {});
    for (const x of st) {
      body.append(h('tr', {}, h('td', { class: 'r' }, x.label), h('td', { class: 'r' }, x.p.no), h('td', { class: 'name', dir: 'auto' }, nameOf(x.p)), h('td', { class: 'r' }, x.p.rating || ''),
        h('td', {}, x.champion ? 'Winner' : x.out ? 'Out in the ' + HTM.koRoundName(T.ko.size, x.lastRound).toLowerCase() : 'Still in the ' + HTM.koRoundName(T.ko.size, Math.max(0, x.lastRound)).toLowerCase()), h('td', { class: 'r' }, x.won)));
    }
    tb.append(body);
    return h('div', {}, h('div', { class: 'toolbar' }, h('b', {}, 'Standings'), h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => window.print() }, 'Print')), printHeader(T, 'Final standings'), h('div', { class: 'card', style: { display: 'inline-block' } }, tb));
  }

  // ---------------------------------------------------------------------------------------------- cross table (round robin)
  V.cross = function () {
    const T = S().T;
    if (T.format !== 'roundrobin' || !T.rounds.length) return empty('No cross table yet', 'The cross table is available for a round robin once the schedule has been created.', h('button', { class: 'btn primary', onclick: () => App.go('pairings') }, 'Go to the pairings'));
    const st = HTM.annotate(T, HTM.standings(T));
    const ct = HTM.crosstable(T, st);
    const n = st.rows.length, o = T.opts;
    const head = h('tr', {}, h('th', {}, 'Rk'), h('th', {}, 'Name'), o.showRating ? h('th', {}, 'Rtg') : null, Array.from({ length: n }, (_, i) => h('th', { class: 'c' }, i + 1)), h('th', {}, 'Pts'), st.tbs.map((id) => h('th', {}, HTM.TB[id].short)));
    const body = h('tbody', {});
    ct.rows.forEach((row, i) => {
      body.append(h('tr', {}, h('td', { class: 'r' }, row.rank), h('td', { class: 'nm', dir: 'auto' }, nameOf(row.p)), o.showRating ? h('td', { class: 'r' }, row.p.rating || '') : null,
        ct.cells[i].map((c, j) => h('td', { class: i === j ? 'self' : '', title: c.length ? c.map((x) => (x.color === 'w' ? 'White' : 'Black') + ' ' + x.sym).join(', ') : '' }, i === j ? '' : c.map((x) => x.sym).join(' '))),
        h('td', { class: 'r', style: { fontWeight: 700 } }, HTM.fmtPts(row.points)), st.tbs.map((id) => h('td', { class: 'r' }, HTM.fmtTb(id, id === 'de' ? row.tbShow.de : row.tb[id])))));
    });
    return h('div', {}, h('div', { class: 'toolbar' }, h('b', {}, 'Cross table'), h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => window.print() }, 'Print')), printHeader(T, 'Cross table'),
      h('div', { class: 'card', style: { display: 'inline-block', maxWidth: '100%', overflow: 'auto' } }, h('table', { class: 'tbl xt' }, h('thead', {}, head), body)),
      h('p', { class: 'help noprint' }, 'Rows are in ranking order; the column numbers are the ranks. A cell shows what the row player scored against the column player.'));
  };

  // ---------------------------------------------------------------------------------------------- settings
  V.settings = function () {
    const T = S().T, o = T.opts;
    const q = (fn) => (e) => App.mutate((t) => fn(t, e.target), { quiet: true });
    const text = (key, ph, w) => h('input', { class: 'input', dir: 'auto', value: T[key] || '', placeholder: ph || '', style: w ? { width: w } : null, onchange: q((t, el) => { t[key] = el.value.trim(); if (key === 'name') App.refreshTop(); }) });
    const num = (key, step, min) => h('input', { class: 'input num', type: 'number', step: step || 0.5, min: min === undefined ? 0 : min, value: o[key], onchange: q((t, el) => { const v = parseFloat(el.value); if (isFinite(v)) t.opts[key] = v; }) });
    const chk = (key, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!o[key], onchange: q((t, el) => { t.opts[key] = el.checked; }) }), label);
    const wrap = h('div', { class: 'grid2' });
    const left = h('div', {}), right = h('div', {});
    left.append(h('div', { class: 'card' }, h('h3', {}, 'Tournament'),
      field('Name', text('name', 'Tournament name')), field('City / venue', text('city')), field('Organizer', text('organizer')), field('Arbiter', text('arbiter')),
      field('Dates', h('input', { class: 'input auto', type: 'date', value: T.startDate, onchange: q((t, el) => { t.startDate = el.value; }) }), 'to', h('input', { class: 'input auto', type: 'date', value: T.endDate, onchange: q((t, el) => { t.endDate = el.value; }) })),
      field('Time control', text('timeControl', 'e.g. 90 minutes + 30 seconds per move')),
      h('div', { class: 'field' }, h('label', {}, 'Notes'), h('textarea', { class: 'input', rows: 3, dir: 'auto', onchange: q((t, el) => { t.notes = el.value; }) }, T.notes || ''))));
    const fmtCard = h('div', { class: 'card' }, h('h3', {}, HTM.FORMATS[T.format]));
    if (T.format === 'swiss') {
      fmtCard.append(field('Number of rounds', h('input', { class: 'input num', type: 'number', min: Math.max(1, T.rounds.length), max: 30, value: o.rounds, onchange: q((t, el) => { t.opts.rounds = Math.max(t.rounds.length, Math.min(30, parseInt(el.value, 10) || t.opts.rounds)); }) }), h('span', { class: 'help' }, T.rounds.length + ' paired so far')));
      fmtCard.append(field('Colour in round 1', h('select', { class: 'select auto', onchange: q((t, el) => { t.opts.firstColor = el.value; }) }, h('option', { value: 'white', selected: o.firstColor !== 'black' }, 'the top seed has White'), h('option', { value: 'black', selected: o.firstColor === 'black' }, 'the top seed has Black'))));
    }
    if (T.format === 'roundrobin') fmtCard.append(field('Double round robin', h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.doubleRR, disabled: T.started, onchange: q((t, el) => { t.opts.doubleRR = el.checked; }) }), 'every pair plays twice, with the colours reversed')));
    if (T.format === 'knockout') fmtCard.append(field('Games per match', h('select', { class: 'select auto', disabled: T.started, onchange: q((t, el) => { t.opts.koGames = parseInt(el.value, 10); }) }, [1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: o.koGames === n }, n)))));
    left.append(fmtCard);
    const tbCard = h('div', { class: 'card' }, h('h3', {}, 'Tie-breaks'), h('p', { class: 'help', style: { margin: '0 0 6px' } }, 'Players with the same points are ranked by these, in this order.'));
    for (let i = 0; i < 5; i++) {
      const cur = o.tiebreaks[i] || '';
      tbCard.append(field((i + 1) + '.', h('select', { class: 'select', title: cur ? HTM.TB[cur].hint : '', onchange: q((t, el) => { const a = t.opts.tiebreaks.slice(); if (el.value) a[i] = el.value; else a.splice(i, 1); t.opts.tiebreaks = a.filter((x, k) => x && a.indexOf(x) === k); App.go('settings'); }) }, [h('option', { value: '' }, '- none -')].concat(HTM.TIEBREAKS.map((x) => h('option', { value: x.id, selected: cur === x.id }, x.name))))));
    }
    left.append(tbCard);
    right.append(h('div', { class: 'card' }, h('h3', {}, 'Points'),
      h('div', { class: 'row', style: { marginBottom: '6px' } }, h('button', { class: 'btn sm', onclick: () => App.mutate((t) => { Object.assign(t.opts, { win: 1, draw: 0.5, loss: 0, forfeitWin: 1, pab: 1, halfBye: 0.5, zeroBye: 0, fullBye: 1 }); }) }, 'Standard: 1 / ½ / 0'), h('button', { class: 'btn sm', onclick: () => App.mutate((t) => { Object.assign(t.opts, { win: 3, draw: 1, loss: 0, forfeitWin: 3, pab: 3, halfBye: 1, zeroBye: 0, fullBye: 3 }); }) }, 'Football: 3 / 1 / 0')),
      field('Win', num('win')), field('Draw', num('draw')), field('Loss', num('loss')), field('Win by forfeit', num('forfeitWin')),
      T.format === 'swiss' ? [field('Pairing bye', num('pab')), field('Half-point bye', num('halfBye')), field('Zero-point bye', num('zeroBye')), field('Full-point bye', num('fullBye'))] : null,
      h('p', { class: 'help' }, 'Changing the points recalculates all standings.')));
    right.append(h('div', { class: 'card' }, h('h3', {}, 'Columns'), h('div', { class: 'row', style: { gap: '16px' } }, chk('showTitle', 'Title'), chk('showRating', 'Rating'), chk('showFed', 'Federation'), chk('showClub', 'Club'))));
    right.append(h('div', { class: 'card' }, h('h3', {}, 'This tournament'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => App.exportFile(T.id) }, 'Save file...'), h('button', { class: 'btn', onclick: () => App.duplicate(T.id) }, 'Duplicate'),
        h('button', { class: 'btn', disabled: !T.started, onclick: () => V.resetPairings() }, T.format === 'swiss' ? 'Delete all rounds' : T.format === 'knockout' ? 'Delete the bracket' : 'Delete the schedule'),
        h('button', { class: 'btn', onclick: () => App.remove(T.id) }, 'Delete tournament')),
      h('p', { class: 'help' }, 'Created ' + UI.fmtDate(T.created) + '. Deleting the pairings keeps the players; you can undo it with the Undo button.')));
    wrap.append(left, right);
    return wrap;
  };

  V.resetPairings = function () {
    const T = S().T;
    App.confirm(['Delete all pairings and results of this tournament?', 'The players stay. You can undo this with the Undo button.'], 'Delete', true).then((yes) => {
      if (yes) { App.mutate((t) => { t.rounds = []; t.ko = null; t.started = false; for (const p of t.players) p.withdrawn = null; }); S().round = 1; S().stRound = null; }
    });
  };
})();
