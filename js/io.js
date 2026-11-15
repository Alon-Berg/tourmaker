/* Tourmaker - files: JSON (tournament file), CSV, validation of loaded data, crosstable. Pure logic, no DOM. */
(function (root) {
  'use strict';
  const HTM = root.HTM = root.HTM || {};
  const RES = new Set(HTM.RESULTS);

  HTM.exportJSON = function (T) { return JSON.stringify({ app: 'Tourmaker', version: HTM.VERSION, tournament: T }, null, 1); };

  // Checks and repairs a tournament that comes from a file or from the browser storage. Throws an Error with a plain message when it cannot be used.
  HTM.validate = function (T) {
    if (!T || typeof T !== 'object' || !Array.isArray(T.players) || !HTM.FORMATS[T.format]) throw new Error('This is not a Tourmaker file.');
    const fmt = T.format;
    T.id = typeof T.id === 'string' && T.id ? T.id : HTM.uid('t');
    for (const k of ['name', 'city', 'organizer', 'arbiter', 'startDate', 'endDate', 'timeControl', 'notes']) T[k] = typeof T[k] === 'string' ? T[k] : '';
    if (!T.name) T.name = 'Tournament';
    T.created = T.created || new Date().toISOString();
    T.modified = T.modified || T.created;
    T.opts = Object.assign(HTM.defaultOpts(fmt), T.opts && typeof T.opts === 'object' ? T.opts : {});
    if (!Array.isArray(T.opts.tiebreaks)) T.opts.tiebreaks = HTM.defaultOpts(fmt).tiebreaks;
    T.opts.tiebreaks = T.opts.tiebreaks.filter((id) => HTM.TB[id]);
    const seen = new Set();
    let maxId = 0;
    T.players = T.players.filter((p) => p && typeof p === 'object').map((p, i) => {
      let id = Number.isInteger(p.id) && p.id > 0 && !seen.has(p.id) ? p.id : 0;
      if (!id) { id = 1 + T.players.reduce((m, q) => Math.max(m, Number.isInteger(q && q.id) ? q.id : 0), 0) + i + 1000; while (seen.has(id)) id++; }
      seen.add(id); maxId = Math.max(maxId, id);
      return {
        id, no: Number.isInteger(p.no) && p.no > 0 ? p.no : i + 1, name: String(p.name || ''), title: HTM.TITLES.includes(p.title) ? p.title : '',
        rating: HTM.isNum(+p.rating) && +p.rating > 0 ? Math.round(+p.rating) : 0, fed: String(p.fed || ''), club: String(p.club || ''),
        withdrawn: Number.isInteger(p.withdrawn) ? p.withdrawn : null, byes: p.byes && typeof p.byes === 'object' ? p.byes : {},
      };
    });
    T.nextPlayerId = Math.max(Number.isInteger(T.nextPlayerId) ? T.nextPlayerId : 1, maxId + 1);
    HTM.renumber(T);
    const ids = new Set(T.players.map((p) => p.id));
    T.rounds = (Array.isArray(T.rounds) ? T.rounds : []).map((rd, i) => ({
      n: i + 1,
      games: (rd && Array.isArray(rd.games) ? rd.games : []).filter((g) => g && ids.has(g.w) && ids.has(g.b) && g.w !== g.b).map((g) => ({ w: g.w, b: g.b, res: RES.has(g.res) ? g.res : null })),
      byes: (rd && Array.isArray(rd.byes) ? rd.byes : []).filter((b) => b && ids.has(b.p) && HTM.BYE_LABEL[b.kind]).map((b) => ({ p: b.p, kind: b.kind })),
    }));
    if (fmt === 'knockout' && T.ko && Array.isArray(T.ko.rounds)) {
      T.ko.rounds = T.ko.rounds.map((rd) => (Array.isArray(rd) ? rd : []).map((m) => ({
        a: ids.has(m.a) ? m.a : null, b: ids.has(m.b) ? m.b : null, sa: m.sa, sb: m.sb, bye: !!m.bye, tb: m.tb === 'a' || m.tb === 'b' ? m.tb : null,
        games: (Array.isArray(m.games) ? m.games : []).map((r) => (RES.has(r) ? r : null)),
      })));
    } else T.ko = null;
    T.started = !!(T.started || T.rounds.length || T.ko);
    return T;
  };

  HTM.importJSON = function (text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { throw new Error('This is not a tournament file (it is not valid JSON).'); }
    return HTM.validate(o && o.tournament ? o.tournament : o);
  };

  HTM.csv = function (rows) {
    const q = (c) => { const s = c === null || c === undefined ? '' : String(c); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
  };

  HTM.standingsRows = function (T, st) {
    HTM.annotate(T, st);
    const head = ['Rank', 'No', 'Title', 'Name', 'Rating', 'Fed', 'Club', 'Points'].concat(st.tbs.map((id) => HTM.TB[id].short));
    if (T.format === 'swiss') for (let r = 1; r <= st.upto; r++) head.push('R' + r);
    const rows = [head];
    for (const r of st.rows) {
      const row = [r.rank, r.p.no, r.p.title, r.p.name, r.p.rating || '', r.p.fed, r.p.club, HTM.fmtPts(r.points)];
      for (const id of st.tbs) row.push(HTM.fmtTb(id, id === 'de' ? r.tbShow.de : r.tb[id]));
      if (T.format === 'swiss') for (const e of r.entries) row.push(HTM.cellText(T, r, e));
      rows.push(row);
    }
    return rows;
  };

  // Round robin cross table: cells[i][j] = what the i-th player of the ranking scored against the j-th ("1", "0", "½", "+", "-"; two cycles give two symbols)
  HTM.crosstable = function (T, st) {
    const idx = new Map(st.rows.map((r, i) => [r.p.id, i]));
    const cells = st.rows.map(() => st.rows.map(() => []));
    for (const [i, r] of st.rows.entries()) {
      for (const e of r.entries) {
        if (e.opp === null || !idx.has(e.opp)) continue;
        const sym = e.kind === 'pending' ? '' : e.kind === 'forfeitWin' ? '+' : e.kind === 'forfeitLoss' || e.kind === 'doubleForfeit' ? '-' : e.out === 'W' ? '1' : e.out === 'D' ? '½' : '0';
        cells[i][idx.get(e.opp)].push({ sym, color: e.color, r: e.r });
      }
    }
    return { rows: st.rows, cells };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = HTM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
