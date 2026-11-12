/* Human Tournament Maker - dialogs: new tournament, paste a player list, byes, withdrawal, manual pairings, player card, knockout match. */
(function () {
  'use strict';
  const { h, clear, toast, modal } = UI;
  const D = window.Dialogs = {};
  const S = () => window.App.S;

  const field = (label, ...ctl) => h('div', { class: 'field' }, h('label', {}, label), h('div', { class: 'inline' }, ...ctl));
  const nameOf = (p) => (p ? (p.title ? p.title + ' ' : '') + (p.name || '(no name)') : '?');
  D.nameOf = nameOf;
  const labelOf = (p) => p.no + '. ' + nameOf(p) + (p.rating ? ' (' + p.rating + ')' : '');

  // ---------------------------------------------------------------------------------------------- new tournament
  D.newTournament = function () {
    const name = h('input', { class: 'input', placeholder: 'e.g. Club championship', 'data-f': 'name' });
    const fmt = h('select', { class: 'select auto', onchange: sync }, Object.entries(HTM.FORMATS).map(([k, v]) => h('option', { value: k }, v)));
    const rounds = h('input', { class: 'input num', type: 'number', min: 1, max: 30, value: 5 });
    const dbl = h('input', { type: 'checkbox' });
    const kog = h('select', { class: 'select auto' }, [1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: n === 2 }, n + (n === 1 ? ' game' : ' games'))));
    const tc = h('input', { class: 'input', placeholder: 'e.g. 15 minutes + 10 seconds per move' });
    const city = h('input', { class: 'input' });
    const date = h('input', { class: 'input auto', type: 'date' });
    const arb = h('input', { class: 'input' });
    const rRounds = field('Rounds', rounds, h('span', { class: 'help' }, 'usually 5 to 9'));
    const rDouble = field('Round robin', h('label', { class: 'check' }, dbl, 'two games between every pair (double round robin)'));
    const rKo = field('Games per match', kog, h('span', { class: 'help' }, 'a tied match is decided by a tie-break winner'));
    function sync() { rRounds.classList.toggle('hidden', fmt.value !== 'swiss'); rDouble.classList.toggle('hidden', fmt.value !== 'roundrobin'); rKo.classList.toggle('hidden', fmt.value !== 'knockout'); }
    sync();
    const body = h('div', {}, field('Name', name), field('Format', fmt), rRounds, rDouble, rKo, h('div', { class: 'hr' }), field('Time control', tc), field('City / venue', city), field('Date', date), field('Arbiter', arb));
    modal({
      title: 'New tournament', width: 'min(620px, 100%)', body,
      buttons: [{ label: 'Cancel' }, { label: 'Create', primary: true, onClick: () => create() }],
      submit: (m) => { if (create() !== false) m.close(); },
    });
    function create() {
      const T = HTM.newTournament({ name: name.value.trim() || 'New tournament', format: fmt.value, timeControl: tc.value.trim(), city: city.value.trim(), startDate: date.value, arbiter: arb.value.trim() });
      if (fmt.value === 'swiss') T.opts.rounds = Math.max(1, Math.min(30, parseInt(rounds.value, 10) || 5));
      if (fmt.value === 'roundrobin') T.opts.doubleRR = dbl.checked;
      if (fmt.value === 'knockout') T.opts.koGames = parseInt(kog.value, 10) || 2;
      App.addTournament(T);
    }
  };

  // ---------------------------------------------------------------------------------------------- paste a list of players
  D.parsePlayers = function (text) {
    const out = [];
    for (const line of String(text).split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      let parts;
      if (/[\t;]/.test(s)) parts = s.split(/\t|;/).map((x) => x.trim()).filter((x) => x !== '');
      else {
        const m = s.match(/^(.*?\S)[,\s]+(\d{3,4})$/);                       // "Name 1850" or "Name, 1850"
        parts = m ? [m[1].replace(/,\s*$/, ''), m[2]] : [s];
      }
      const p = { name: '', rating: 0, title: '', fed: '', club: '' };
      const rest = [];
      for (const x of parts) {
        if (/^\d{3,4}$/.test(x) && !p.rating) p.rating = +x;
        else if (HTM.TITLES.includes(x.toUpperCase()) && x && !p.title && rest.length) p.title = x.toUpperCase();
        else if (/^[A-Z]{3}$/.test(x) && !p.fed && rest.length) p.fed = x;
        else rest.push(x);
      }
      const first = (rest[0] || '').match(/^(GM|IM|FM|CM|WGM|WIM|WFM|WCM)\s+(.+)$/i);       // "GM Name"
      if (first && !p.title) { p.title = first[1].toUpperCase(); rest[0] = first[2]; }
      p.name = rest.shift() || '';
      p.club = rest.join(' ');
      if (p.name) out.push(p);
    }
    return out;
  };

  D.pasteList = function () {
    const ta = h('textarea', { class: 'input', rows: 12, placeholder: 'Dana Katz; 1850\nOmer Levi; 1720; FM; ISR; Haifa chess club\nGM Alex Smith 2510' });
    const info = h('div', { class: 'help' }, 'Nothing recognised yet.');
    const upd = () => { const n = D.parsePlayers(ta.value).length; info.textContent = n ? n + ' player' + (n > 1 ? 's' : '') + ' recognised.' : 'Nothing recognised yet.'; };
    ta.addEventListener('input', upd);
    const body = h('div', {}, h('p', { style: { margin: '0 0 6px' } }, 'One player per line. Fields (any order, separated by a semicolon or a tab): name, rating, title, federation (3 capital letters), club. "Name 1850" also works.'), ta, info);
    modal({
      title: 'Paste a list of players', width: 'min(640px, 100%)', body,
      buttons: [{ label: 'Cancel' }, { label: 'Add players', primary: true, onClick: () => {
        const list = D.parsePlayers(ta.value);
        if (!list.length) { toast('Nothing to add.', 'err'); return false; }
        App.addPlayers(list);
      } }],
    });
  };

  // ---------------------------------------------------------------------------------------------- late entry (Swiss, after round 1)
  D.latePlayer = function (fields) {
    const T = S().T;
    const sel = h('select', { class: 'select auto' }, h('option', { value: 'zero' }, '0 points (zero-point bye)'), h('option', { value: 'half' }, '½ point (half-point bye)'));
    modal({
      title: 'Late entry', width: 'min(520px, 100%)', noFocus: true,
      body: h('div', {}, h('p', { style: { margin: '0 0 8px' } }, nameOf(fields) + ' joins after ' + T.rounds.length + ' round' + (T.rounds.length > 1 ? 's' : '') + '. For each round already paired the player gets:'), sel),
      buttons: [{ label: 'Cancel' }, { label: 'Add player', primary: true, onClick: () => App.addLatePlayer(fields, sel.value) }],
    });
  };

  // ---------------------------------------------------------------------------------------------- requested byes
  D.byes = function (pid) {
    const T = S().T, p = T.players.find((x) => x.id === pid);
    const planned = Math.max(HTM.plannedRounds(T), T.rounds.length);
    const sels = [];
    const rows = [];
    for (let r = T.rounds.length + 1; r <= planned; r++) {
      const sel = h('select', { class: 'select auto' }, [['', 'plays'], ['half', 'half-point bye'], ['zero', 'zero-point bye'], ['full', 'full-point bye']].map(([v, l]) => h('option', { value: v, selected: (p.byes[r] || '') === v }, l)));
      sels.push([r, sel]);
      rows.push(field('Round ' + r, sel));
    }
    if (!rows.length) { toast('All rounds are already paired.', 'err'); return; }
    modal({
      title: 'Byes of ' + nameOf(p), width: 'min(460px, 100%)', noFocus: true,
      body: h('div', {}, h('p', { class: 'help', style: { margin: '0 0 6px' } }, 'A player with a bye is not paired in that round and gets the points set in the rules (' + HTM.fmtPts(T.opts.halfBye) + ' / ' + HTM.fmtPts(T.opts.zeroBye) + ' / ' + HTM.fmtPts(T.opts.fullBye) + ').'), rows),
      buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => App.mutate((t) => { const q = t.players.find((x) => x.id === pid); q.byes = {}; for (const [r, sel] of sels) if (sel.value) q.byes[r] = sel.value; }) }],
    });
  };

  // ---------------------------------------------------------------------------------------------- withdrawal
  D.withdraw = function (pid) {
    const T = S().T, p = T.players.find((x) => x.id === pid);
    if (T.format === 'knockout') {
      App.confirm(['Withdraw ' + nameOf(p) + '?', 'The open match is lost by forfeit, so the opponent moves on.'], 'Withdraw').then((yes) => { if (yes) App.mutate((t) => { t.players.find((x) => x.id === pid).withdrawn = 1; HTM.koWithdraw(t, pid); }); });
      return;
    }
    if (T.format === 'roundrobin') {
      App.confirm(['Withdraw ' + nameOf(p) + '?', 'All games that have no result yet are lost by forfeit. Games already played keep their result.'], 'Withdraw').then((yes) => { if (yes) App.mutate((t) => { t.players.find((x) => x.id === pid).withdrawn = 1; HTM.rrWithdraw(t, pid); }); });
      return;
    }
    const num = h('input', { class: 'input num', type: 'number', min: 1, max: 60, value: T.rounds.length + 1 });
    modal({
      title: 'Withdraw ' + nameOf(p), width: 'min(500px, 100%)',
      body: h('div', {}, field('First round not played', num), h('p', { class: 'help' }, 'The player is not paired from that round on. Points and games already played stay in the standings.')),
      buttons: [{ label: 'Cancel' }, { label: 'Withdraw', primary: true, onClick: () => { const n = Math.max(1, parseInt(num.value, 10) || 1); App.mutate((t) => { t.players.find((x) => x.id === pid).withdrawn = n; }); } }],
      submit: (m) => { const n = Math.max(1, parseInt(num.value, 10) || 1); App.mutate((t) => { t.players.find((x) => x.id === pid).withdrawn = n; }); m.close(); },
    });
  };

  // ---------------------------------------------------------------------------------------------- manual pairings of a Swiss round
  D.editRound = function (r) {
    const T = S().T, rd = T.rounds[r - 1];
    const ps = HTM.playersByNo(T);
    const boards = rd.games.map((g) => ({ w: g.w, b: g.b, res: g.res, ow: g.w, ob: g.b }));           // ow / ob: the pair the result belongs to
    const byes = rd.byes.map((b) => ({ p: b.p, kind: b.kind }));
    const body = h('div', {});
    const playerSel = (val, on) => h('select', { class: 'select', onchange: (e) => on(parseInt(e.target.value, 10) || 0) }, [h('option', { value: 0 }, '- none -')].concat(ps.map((p) => h('option', { value: p.id, selected: p.id === val }, labelOf(p)))));
    function draw() {
      clear(body);
      body.append(h('p', { class: 'help', style: { margin: '0 0 6px' } }, 'Choose the players of every board. A result is kept when the board keeps both players and their colours.'));
      const tb = h('table', { class: 'tbl full' }, h('thead', {}, h('tr', {}, h('th', {}, 'Bd'), h('th', {}, 'White'), h('th', {}, 'Black'), h('th', {}, ''))));
      const tbody = h('tbody', {});
      boards.forEach((b, i) => tbody.append(h('tr', {}, h('td', { class: 'c' }, i + 1), h('td', { class: 'in' }, playerSel(b.w, (v) => { b.w = v; })), h('td', { class: 'in' }, playerSel(b.b, (v) => { b.b = v; })),
        h('td', { class: 'c' }, h('button', { class: 'btn sm ghost', title: 'Swap colours', onclick: () => {
          const same = b.w === b.ow && b.b === b.ob, t = b.w;
          b.w = b.b; b.b = t;
          if (same) { b.ow = b.w; b.ob = b.b; b.res = { '1-0': '0-1', '0-1': '1-0', '+-': '-+', '-+': '+-' }[b.res] || b.res; }
          draw();
        } }, '⇄'), h('button', { class: 'btn sm ghost', title: 'Remove board', onclick: () => { boards.splice(i, 1); draw(); } }, '✕')))));
      tb.append(tbody);
      body.append(tb, h('div', { class: 'toolbar', style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: () => { boards.push({ w: 0, b: 0, res: null }); draw(); } }, 'Add board')));
      body.append(h('div', { class: 'hr' }), h('b', {}, 'Byes'));
      const bt = h('table', { class: 'tbl full', style: { marginTop: '4px' } });
      byes.forEach((b, i) => bt.append(h('tr', {}, h('td', { class: 'in' }, playerSel(b.p, (v) => { b.p = v; })),
        h('td', { class: 'in' }, h('select', { class: 'select', onchange: (e) => { b.kind = e.target.value; } }, Object.entries(HTM.BYE_LABEL).map(([k, v]) => h('option', { value: k, selected: b.kind === k }, v)))),
        h('td', { class: 'c' }, h('button', { class: 'btn sm ghost', onclick: () => { byes.splice(i, 1); draw(); } }, '✕')))));
      body.append(bt, h('div', { class: 'toolbar', style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: () => { byes.push({ p: 0, kind: 'pab' }); draw(); } }, 'Add bye')));
    }
    draw();
    modal({
      title: 'Pairings of round ' + r, width: 'min(760px, 100%)', body, noFocus: true,
      buttons: [{ label: 'Cancel' }, { label: 'Save pairings', primary: true, onClick: (m) => save(m) }],
    });
    function save(m) {
      const used = new Map();
      const bad = [];
      for (const b of boards) { if (!b.w || !b.b) { bad.push('A board has no player.'); break; } if (b.w === b.b) { bad.push('A player cannot play himself or herself.'); break; } }
      for (const b of byes) if (!b.p) { bad.push('A bye has no player.'); break; }
      for (const id of [].concat(...boards.map((b) => [b.w, b.b]), byes.map((b) => b.p))) used.set(id, (used.get(id) || 0) + 1);
      for (const [id, n] of used) if (n > 1) { bad.push(nameOf(T.players.find((p) => p.id === id)) + ' appears more than once.'); break; }
      if (bad.length) { toast(bad[0], 'err'); return false; }
      const missing = ps.filter((p) => HTM.isActive(p, r) && !used.has(p.id));
      const hist = HTM.playerEntries(T, r - 1);
      const rematch = boards.filter((b) => (hist.get(b.w) || []).some((e) => e.opp === b.b));
      const go = () => App.mutate((t) => {
        t.rounds[r - 1].games = boards.map((b) => ({ w: b.w, b: b.b, res: b.w === b.ow && b.b === b.ob ? b.res : null }));
        t.rounds[r - 1].byes = byes.map((b) => ({ p: b.p, kind: b.kind }));
      });
      if (missing.length || rematch.length) {
        const lines = [];
        if (missing.length) lines.push(missing.length + ' active player' + (missing.length > 1 ? 's are' : ' is') + ' not paired and will score 0: ' + missing.slice(0, 5).map(nameOf).join(', ') + (missing.length > 5 ? ', ...' : '') + '.');
        if (rematch.length) lines.push(rematch.length + ' board' + (rematch.length > 1 ? 's repeat' : ' repeats') + ' an earlier pairing.');
        App.confirm(lines.concat('Save anyway?'), 'Save anyway').then((yes) => { if (yes) { go(); m.close(); } });
        return false;                                                  // keep the dialog open until the question is answered
      }
      go();
    }
  };

  // ---------------------------------------------------------------------------------------------- player card
  D.playerCard = function (pid, upto) {
    const T = S().T;
    const st = HTM.annotate(T, HTM.standings(T, upto));
    const row = st.byId.get(pid);
    if (!row) return;
    const byId = new Map(T.players.map((p) => [p.id, p]));
    const sym = (e) => (e.kind === 'pending' ? '?' : e.out === 'W' ? '1' : e.out === 'D' ? '½' : '0');
    const kindText = { game: '', forfeitWin: 'win by forfeit', forfeitLoss: 'loss by forfeit', doubleForfeit: 'both forfeit', pending: 'no result yet', pab: 'bye', half: 'half-point bye', zero: 'zero-point bye', full: 'full-point bye', rest: 'round off', absent: 'not paired' };
    const tb = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Rd', 'Opponent', 'Rtg', 'Col', 'Result', 'Pts', ''].map((x) => h('th', {}, x)))));
    const tbody = h('tbody', {});
    for (const e of row.entries) {
      const o = e.opp ? byId.get(e.opp) : null;
      tbody.append(h('tr', {}, h('td', { class: 'c' }, e.r), h('td', { dir: 'auto' }, o ? o.no + '. ' + nameOf(o) : '-'), h('td', { class: 'r' }, o && o.rating ? o.rating : ''), h('td', { class: 'c' }, e.color === 'w' ? 'White' : e.color === 'b' ? 'Black' : ''),
        h('td', { class: 'c' }, e.kind === 'game' || e.kind === 'pending' || e.kind === 'forfeitWin' || e.kind === 'forfeitLoss' ? sym(e) : ''), h('td', { class: 'r' }, HTM.fmtPts(e.pts)), h('td', { class: 'tag' }, kindText[e.kind] || '')));
    }
    tb.append(tbody);
    const kv = h('dl', { class: 'kv', style: { margin: '0 0 8px' } },
      h('dt', {}, 'Rank'), h('dd', {}, row.rank + ' of ' + st.rows.length), h('dt', {}, 'Points'), h('dd', {}, HTM.fmtPts(row.points) + ' from ' + st.upto + ' round' + (st.upto === 1 ? '' : 's')),
      row.tb.tpr ? [h('dt', {}, 'Performance'), h('dd', {}, row.tb.tpr)] : null,
      row.p.rating ? [h('dt', {}, 'Rating'), h('dd', {}, row.p.rating)] : null,
      row.p.club || row.p.fed ? [h('dt', {}, 'Club'), h('dd', {}, [row.p.club, row.p.fed].filter(Boolean).join(', '))] : null);
    modal({ title: '#' + row.p.no + '  ' + nameOf(row.p), width: 'min(640px, 100%)', body: h('div', { dir: 'auto' }, kv, tb), buttons: [{ label: 'Close', primary: true }], noFocus: true });
  };

  // ---------------------------------------------------------------------------------------------- knockout match
  D.match = function (r, j) {
    const T = S().T, m = T.ko.rounds[r][j];
    const byId = new Map(T.players.map((p) => [p.id, p]));
    const pa = byId.get(m.a), pb = byId.get(m.b);
    if (!pa || !pb || m.bye) { toast('This match does not have two players yet.', 'err'); return; }
    const games = m.games.slice();
    let tb = m.tb;
    const body = h('div', {});
    const sum = h('p', { style: { margin: '8px 0 0', fontWeight: 600 } });
    const tbSel = h('select', { class: 'select auto', onchange: (e) => { tb = e.target.value || null; refresh(); } }, h('option', { value: '' }, '- none -'), h('option', { value: 'a', selected: tb === 'a' }, nameOf(pa)), h('option', { value: 'b', selected: tb === 'b' }, nameOf(pb)));
    function refresh() {
      const tmp = { a: m.a, b: m.b, games, tb, bye: false };
      const s = HTM.koScore(tmp), w = HTM.koWinner(tmp);
      sum.textContent = nameOf(pa) + '  ' + HTM.fmtPts(s.a) + ' : ' + HTM.fmtPts(s.b) + '  ' + nameOf(pb) + (w ? '   → ' + nameOf(w === 'a' ? pa : pb) + ' moves on' : (s.left === 0 ? '   → tied: pick the tie-break winner' : ''));
      tbRow.classList.toggle('hidden', !(s.left === 0 && s.a === s.b));
    }
    const tbRow = field('Tie-break winner', tbSel, h('span', { class: 'help' }, 'e.g. after a blitz or Armageddon game'));
    games.forEach((res, i) => {
      const aw = i % 2 === 0;
      const sel = h('select', { class: 'select auto', onchange: (e) => { games[i] = e.target.value || null; refresh(); } }, [''].concat(HTM.RESULTS).map((v) => h('option', { value: v, selected: (res || '') === v }, v ? HTM.RESULT_LABEL[v] : '-')));
      body.append(field('Game ' + (i + 1), h('span', { style: { minWidth: '260px' }, dir: 'auto' }, nameOf(aw ? pa : pb) + ' (White) vs ' + nameOf(aw ? pb : pa)), sel));
    });
    body.append(tbRow, sum);
    refresh();
    modal({
      title: HTM.koRoundName(T.ko.size, r) + ' - match ' + (j + 1), width: 'min(720px, 100%)', body, noFocus: true,
      buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => App.mutate((t) => { const mm = t.ko.rounds[r][j]; mm.games = games.slice(); mm.tb = tb; HTM.koAdvance(t); }) }],
    });
  };
})();
