/* Human Tournament Maker - core: data model, scoring, standings and tie-breaks.
   Pure logic, no DOM. Loaded as a classic script in the browser and imported by the tests (Deno). */
(function (root) {
  'use strict';
  const HTM = root.HTM = root.HTM || {};
  const EPS = 1e-9;

  HTM.VERSION = 1;
  HTM.FORMATS = { swiss: 'Swiss system', roundrobin: 'Round robin', knockout: 'Knockout' };
  HTM.RESULTS = ['1-0', '1/2', '0-1', '+-', '-+', '--'];                       // 1/2 = draw; +- / -+ = forfeit win for White / Black; -- = both lose
  HTM.RESULT_LABEL = { '1-0': '1 - 0', '1/2': '½ - ½', '0-1': '0 - 1', '+-': '+ : -', '-+': '- : +', '--': '- : -' };
  HTM.TITLES = ['', 'GM', 'IM', 'FM', 'CM', 'WGM', 'WIM', 'WFM', 'WCM'];
  HTM.TITLE_ORDER = { GM: 1, IM: 2, WGM: 3, FM: 4, WIM: 5, CM: 6, WFM: 7, WCM: 8, '': 9 };
  HTM.BYE_LABEL = { pab: 'Bye', half: 'Half-point bye', zero: 'Zero-point bye', full: 'Full-point bye', rest: 'Rest' };

  HTM.TIEBREAKS = [
    { id: 'de', short: 'DE', name: 'Direct encounter', hint: 'Points scored between the tied players (used only when they all met each other)' },
    { id: 'wins', short: 'Wins', name: 'Number of wins', hint: 'Games won over the board' },
    { id: 'blackwins', short: 'BWins', name: 'Wins with Black', hint: 'Games won with the black pieces' },
    { id: 'blackgames', short: 'BGames', name: 'Games with Black', hint: 'More games with Black ranks higher' },
    { id: 'buchholz', short: 'Bch', name: 'Buchholz', hint: 'Sum of the scores of the opponents' },
    { id: 'buchholz1', short: 'Bch-1', name: 'Buchholz Cut 1', hint: 'Buchholz without the lowest opponent score' },
    { id: 'buchholz2', short: 'Bch-2', name: 'Buchholz Cut 2', hint: 'Buchholz without the two lowest opponent scores' },
    { id: 'median1', short: 'Med', name: 'Median Buchholz', hint: 'Buchholz without the highest and the lowest opponent score' },
    { id: 'median2', short: 'Med-2', name: 'Median Buchholz 2', hint: 'Buchholz without the two highest and the two lowest opponent scores' },
    { id: 'sb', short: 'SB', name: 'Sonneborn-Berger', hint: 'Scores of the beaten opponents plus half of the scores of the drawn ones' },
    { id: 'ps', short: 'Prog', name: 'Progressive score', hint: 'Sum of the running scores after each round' },
    { id: 'koya', short: 'Koya', name: 'Koya system', hint: 'Points against opponents who scored at least 50%' },
    { id: 'aro', short: 'ARO', name: 'Average rating of opponents', hint: 'Average rating of the rated opponents met over the board' },
    { id: 'tpr', short: 'TPR', name: 'Performance rating', hint: 'FIDE performance rating over the board' },
    { id: 'rating', short: 'Rtg', name: 'Rating', hint: 'Higher rating first' },
  ];
  HTM.TB = {}; HTM.TIEBREAKS.forEach((t) => { HTM.TB[t.id] = t; });

  HTM.uid = (p) => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  HTM.clone = (o) => JSON.parse(JSON.stringify(o));
  HTM.isNum = (x) => typeof x === 'number' && isFinite(x);

  HTM.defaultOpts = function (format) {
    return {
      rounds: format === 'swiss' ? 5 : 0,              // planned rounds (Swiss); the others derive it
      doubleRR: false,                                 // round robin: every pair meets twice
      firstColor: 'white',                             // colour of the top seed on board 1 in round 1
      win: 1, draw: 0.5, loss: 0,                      // points per game
      forfeitWin: 1,                                   // points for a win by forfeit
      pab: 1, halfBye: 0.5, zeroBye: 0, fullBye: 1,    // points for byes
      tiebreaks: format === 'roundrobin' ? ['sb', 'de', 'wins'] : ['buchholz1', 'buchholz', 'sb', 'wins'],
      koGames: 2,                                      // games per knockout match
      showTitle: true, showRating: true, showFed: false, showClub: true,
    };
  };

  HTM.newTournament = function (init) {
    init = init || {};
    const fmt = init.format || 'swiss';
    const now = new Date().toISOString();
    const T = {
      v: HTM.VERSION, id: HTM.uid('t'), created: now, modified: now,
      name: init.name || 'New tournament', city: init.city || '', organizer: init.organizer || '', arbiter: init.arbiter || '',
      startDate: init.startDate || '', endDate: init.endDate || '', timeControl: init.timeControl || '', notes: init.notes || '',
      format: fmt, opts: HTM.defaultOpts(fmt), players: [], nextPlayerId: 1, rounds: [], ko: null, started: false,
    };
    if (init.rounds) T.opts.rounds = init.rounds;
    return T;
  };

  // ------------------------------------------------------------------------------------------------ players
  HTM.newPlayer = function (T, f) {
    f = f || {};
    const p = {
      id: T.nextPlayerId++, no: 0, name: (f.name || '').trim(), title: f.title || '', rating: HTM.isNum(+f.rating) && +f.rating > 0 ? Math.round(+f.rating) : 0,
      fed: (f.fed || '').trim(), club: (f.club || '').trim(), withdrawn: null, byes: {},
    };
    return p;
  };
  HTM.addPlayer = function (T, f) {
    const p = HTM.newPlayer(T, f);
    p.no = T.players.reduce((m, q) => Math.max(m, q.no), 0) + 1;
    T.players.push(p);
    return p;
  };
  HTM.addLatePlayer = function (T, f, kind) {          // Swiss: a player who joins after round 1 gets a bye (kind: 'zero' or 'half') for each round already paired
    const p = HTM.addPlayer(T, f);
    for (const rd of T.rounds) rd.byes.push({ p: p.id, kind });
    return p;
  };
  HTM.playerMap = (T) => new Map(T.players.map((p) => [p.id, p]));
  HTM.renumber = function (T) { T.players.sort((a, b) => a.no - b.no); T.players.forEach((p, i) => { p.no = i + 1; }); };
  HTM.sortByRating = function (T) {                    // starting ranks by rating, then title, then name (only before the first round)
    T.players.sort((a, b) => (b.rating - a.rating) || ((HTM.TITLE_ORDER[a.title] || 9) - (HTM.TITLE_ORDER[b.title] || 9)) || a.name.localeCompare(b.name) || a.id - b.id);
    T.players.forEach((p, i) => { p.no = i + 1; });
  };
  HTM.removePlayer = function (T, id) { T.players = T.players.filter((p) => p.id !== id); HTM.renumber(T); };
  HTM.playersByNo = (T) => T.players.slice().sort((a, b) => a.no - b.no);
  HTM.isActive = (p, r) => p.withdrawn === null || p.withdrawn === undefined || r < p.withdrawn;      // withdrawn = first round the player does not play
  HTM.plannedRounds = function (T) {
    const n = T.players.length;
    if (T.format === 'roundrobin') return n < 2 ? 0 : (n % 2 ? n : n - 1) * (T.opts.doubleRR ? 2 : 1);
    if (T.format === 'knockout') { let r = 0, s = 1; while (s < n) { s *= 2; r++; } return r; }
    return T.opts.rounds || 0;
  };

  // ------------------------------------------------------------------------------------------------ scoring
  HTM.byePoints = function (O, kind) {
    switch (kind) {
      case 'pab': return O.pab; case 'half': return O.halfBye; case 'zero': return O.zeroBye; case 'full': return O.fullBye; default: return 0;
    }
  };
  function comp(O, x) {                                // the result of the virtual opponent of an unplayed game
    if (Math.abs(x - O.win) < EPS) return O.loss;
    if (Math.abs(x - O.loss) < EPS) return O.win;
    if (Math.abs(x - O.draw) < EPS) return O.draw;
    return O.win + O.loss - x;
  }

  // One entry per player and round: what happened to the player in that round.
  // kind: game | forfeitWin | forfeitLoss | doubleForfeit | pending | pab | half | zero | full | rest | absent
  HTM.playerEntries = function (T, upto) {
    const O = T.opts;
    const map = new Map(); T.players.forEach((p) => map.set(p.id, []));
    const R = Math.max(0, Math.min(upto == null ? T.rounds.length : upto, T.rounds.length));
    for (let r = 1; r <= R; r++) {
      const rd = T.rounds[r - 1];
      const seen = new Set();
      for (const g of rd.games) {
        const w = { r, opp: g.b, color: 'w', kind: 'pending', pts: 0, frac: 0, out: null };
        const b = { r, opp: g.w, color: 'b', kind: 'pending', pts: 0, frac: 0, out: null };
        switch (g.res) {
          case '1-0': w.kind = b.kind = 'game'; w.pts = O.win; b.pts = O.loss; w.out = 'W'; b.out = 'L'; w.frac = 1; break;
          case '0-1': w.kind = b.kind = 'game'; w.pts = O.loss; b.pts = O.win; w.out = 'L'; b.out = 'W'; b.frac = 1; break;
          case '1/2': w.kind = b.kind = 'game'; w.pts = b.pts = O.draw; w.out = b.out = 'D'; w.frac = b.frac = 0.5; break;
          case '+-': w.kind = 'forfeitWin'; b.kind = 'forfeitLoss'; w.pts = O.forfeitWin; b.pts = O.loss; w.out = 'W'; b.out = 'L'; w.frac = 1; break;
          case '-+': w.kind = 'forfeitLoss'; b.kind = 'forfeitWin'; w.pts = O.loss; b.pts = O.forfeitWin; w.out = 'L'; b.out = 'W'; b.frac = 1; break;
          case '--': w.kind = b.kind = 'doubleForfeit'; w.pts = b.pts = O.loss; w.out = b.out = 'L'; break;
          default: break;
        }
        if (map.has(g.w)) { map.get(g.w).push(w); seen.add(g.w); }
        if (map.has(g.b)) { map.get(g.b).push(b); seen.add(g.b); }
      }
      for (const bye of rd.byes || []) {
        if (!map.has(bye.p)) continue;
        const pts = HTM.byePoints(O, bye.kind);
        const frac = bye.kind === 'pab' || bye.kind === 'full' ? 1 : bye.kind === 'half' ? 0.5 : 0;
        map.get(bye.p).push({ r, opp: null, color: null, kind: bye.kind, pts, frac, out: frac === 1 ? 'W' : frac === 0.5 ? 'D' : 'L' });
        seen.add(bye.p);
      }
      for (const p of T.players) if (!seen.has(p.id)) map.get(p.id).push({ r, opp: null, color: null, kind: 'absent', pts: 0, frac: 0, out: 'L' });
    }
    return map;
  };

  // ------------------------------------------------------------------------------------------------ performance rating
  const DP = [0, 7, 14, 21, 29, 36, 43, 50, 57, 65, 72, 80, 87, 95, 102, 110, 117, 125, 133, 141, 149, 158, 166, 175, 184, 193, 202, 211, 220, 230, 240, 251, 262, 273, 284, 296, 309, 322, 336, 351, 366, 383, 401, 422, 444, 470, 501, 538, 589, 677, 800];
  HTM.ratingDiff = function (p) {                      // FIDE table: expected score -> rating difference (p = score / games)
    const k = Math.max(0, Math.min(100, Math.round(p * 100)));
    return k >= 50 ? DP[k - 50] : -DP[50 - k];
  };

  // ------------------------------------------------------------------------------------------------ standings
  HTM.standings = function (T, upto) {
    const O = T.opts, W = O.win, D = O.draw;
    const R = Math.max(0, Math.min(upto == null ? T.rounds.length : upto, T.rounds.length));
    const ent = HTM.playerEntries(T, R);
    const byId = new Map(), rows = [];
    for (const p of T.players) {
      const es = ent.get(p.id);
      const before = [0], cum = [0];
      let pts = 0, games = 0, wins = 0, blackWins = 0, blackGames = 0, pending = 0;
      for (const e of es) {
        before[e.r] = pts; pts += e.pts; cum[e.r] = pts;
        if (e.kind === 'game') { games++; if (e.out === 'W') { wins++; if (e.color === 'b') blackWins++; } if (e.color === 'b') blackGames++; }
        if (e.kind === 'pending') pending++;
      }
      const row = { p, no: p.no, entries: es, points: pts, before, cum, games, wins, blackWins, blackGames, pending, tb: {}, tbShow: {}, rank: 0, tied: false };
      rows.push(row); byId.set(p.id, row);
    }
    const tnr = R;
    // scores of the opponents; an unplayed game counts against a virtual opponent (FIDE Tie-Break Regulations)
    const oppScores = (row) => {
      const out = [];
      for (const e of row.entries) {
        if (e.kind === 'pending' || e.kind === 'rest') continue;
        if (e.kind === 'game') { const o = byId.get(e.opp); out.push({ e, sc: o ? o.points : 0 }); }
        else out.push({ e, sc: row.before[e.r] + comp(O, e.pts) + D * (tnr - e.r) });
      }
      return out;
    };
    const wanted = new Set(O.tiebreaks);
    for (const row of rows) {
      const os = (wanted.has('buchholz') || wanted.has('buchholz1') || wanted.has('buchholz2') || wanted.has('median1') || wanted.has('median2') || wanted.has('sb')) ? oppScores(row) : [];
      const list = os.map((x) => x.sc).sort((a, b) => a - b);
      const sum = (a) => a.reduce((s, x) => s + x, 0);
      const cut = (lo, hi) => (list.length > lo + hi ? sum(list.slice(lo, list.length - hi)) : 0);
      row.tb.buchholz = sum(list);
      row.tb.buchholz1 = cut(1, 0);
      row.tb.buchholz2 = cut(2, 0);
      row.tb.median1 = cut(1, 1);
      row.tb.median2 = cut(2, 2);
      row.tb.sb = os.reduce((s, x) => s + x.e.frac * x.sc, 0);
      row.tb.wins = row.wins;
      row.tb.blackwins = row.blackWins;
      row.tb.blackgames = row.blackGames;
      row.tb.ps = row.cum.slice(1).reduce((s, x) => s + x, 0);
      row.tb.rating = row.p.rating || 0;
      const otb = row.entries.filter((e) => e.kind === 'game');
      const rated = otb.filter((e) => { const o = byId.get(e.opp); return o && o.p.rating > 0; });
      row.tb.aro = rated.length ? rated.reduce((s, e) => s + byId.get(e.opp).p.rating, 0) / rated.length : 0;
      if (rated.length) {
        const sc = rated.reduce((s, e) => s + e.frac, 0) / rated.length;
        row.tb.tpr = Math.round(row.tb.aro + HTM.ratingDiff(sc));
      } else row.tb.tpr = 0;
      const half = R * W / 2;
      row.tb.koya = otb.reduce((s, e) => { const o = byId.get(e.opp); return s + (o && o.points >= half - EPS ? e.pts : 0); }, 0);
    }
    // order: points, then the tie-breaks one after the other (a tie-break splits only the players still tied)
    const eq = (a, b) => Math.abs(a - b) < EPS;
    const directEncounter = (group) => {
      const ids = new Set(group.map((r) => r.p.id));
      const val = new Map(group.map((r) => [r, 0]));
      for (const r of group) {
        const met = new Set();
        for (const e of r.entries) {
          if (e.opp !== null && ids.has(e.opp) && (e.kind === 'game' || e.kind === 'forfeitWin' || e.kind === 'forfeitLoss' || e.kind === 'doubleForfeit')) { val.set(r, val.get(r) + e.pts); met.add(e.opp); }
        }
        if (met.size < group.length - 1) return null;
      }
      return val;
    };
    const order = (group, k) => {
      if (group.length < 2) return group;
      if (k >= O.tiebreaks.length) return group.slice().sort((a, b) => a.no - b.no);
      const id = O.tiebreaks[k];
      let val;
      if (id === 'de') {
        val = directEncounter(group);
        if (!val) return order(group, k + 1);
        group.forEach((r) => { r.tbShow.de = val.get(r); });
      } else val = new Map(group.map((r) => [r, r.tb[id] || 0]));
      const sorted = group.slice().sort((a, b) => (val.get(b) - val.get(a)) || (a.no - b.no));
      const out = [];
      let i = 0;
      while (i < sorted.length) {
        let j = i + 1;
        while (j < sorted.length && eq(val.get(sorted[j]), val.get(sorted[i]))) j++;
        out.push(...order(sorted.slice(i, j), k + 1));
        i = j;
      }
      return out;
    };
    const byPts = rows.slice().sort((a, b) => (b.points - a.points) || (a.no - b.no));
    const final = [];
    for (let i = 0; i < byPts.length;) {
      let j = i + 1;
      while (j < byPts.length && eq(byPts[j].points, byPts[i].points)) j++;
      final.push(...order(byPts.slice(i, j), 0));
      i = j;
    }
    final.forEach((r, i) => { r.rank = i + 1; });
    for (let i = 0; i < final.length; i++) {                       // exactly tied: same points and the same value in every tie-break
      const a = final[i], b = final[i + 1];
      if (b && eq(a.points, b.points) && O.tiebreaks.every((id) => (id === 'de' ? true : eq(a.tb[id] || 0, b.tb[id] || 0)))) { a.tied = true; b.tied = true; }
    }
    return { rows: final, byId, upto: R, tbs: O.tiebreaks.slice() };
  };

  // Compact text for one round of one row: opponent number, colour and result ("12w1", "3b=", "bye", "+", ...)
  HTM.cellText = function (T, row, e) {
    const sym = e.out === 'W' ? '1' : e.out === 'D' ? '=' : '0';
    switch (e.kind) {
      case 'game': return (e.oppNo || '?') + (e.color === 'w' ? 'w' : 'b') + sym;
      case 'pending': return (e.oppNo || '?') + (e.color === 'w' ? 'w' : 'b') + '?';
      case 'forfeitWin': return (e.oppNo || '?') + (e.color === 'w' ? 'w' : 'b') + '+';
      case 'forfeitLoss': return (e.oppNo || '?') + (e.color === 'w' ? 'w' : 'b') + '-';
      case 'doubleForfeit': return (e.oppNo || '?') + '--';
      case 'pab': return 'bye';
      case 'full': return 'F';
      case 'half': return 'H';
      case 'zero': return 'Z';
      case 'rest': return 'rest';
      default: return '-';
    }
  };
  HTM.annotate = function (T, st) {                                // fills e.oppNo so that cells can show opponent numbers
    const no = new Map(T.players.map((p) => [p.id, p.no]));
    for (const r of st.rows) for (const e of r.entries) e.oppNo = e.opp === null ? null : no.get(e.opp);
    return st;
  };

  HTM.fmtPts = function (v) {                                      // 4.5 -> 4½, 0.5 -> ½
    if (v === null || v === undefined || isNaN(v)) return '';
    const whole = Math.floor(v + EPS), frac = v - whole;
    if (Math.abs(frac - 0.5) < EPS) return (whole ? String(whole) : '') + '½';
    if (Math.abs(frac) < EPS) return String(whole);
    return (Math.round(v * 100) / 100).toString();
  };
  HTM.fmtTb = function (id, v) {
    if (v === undefined || v === null) return '';
    if (id === 'wins' || id === 'blackwins' || id === 'blackgames' || id === 'tpr' || id === 'rating') return v ? String(Math.round(v)) : (id === 'tpr' || id === 'rating' ? '' : '0');
    if (id === 'aro') return v ? String(Math.round(v)) : '';
    return HTM.fmtPts(v);
  };
  HTM.gamesOf = function (rd) { return rd ? rd.games : []; };
  HTM.roundComplete = function (T, r) {
    const rd = T.rounds[r - 1];
    return !!rd && rd.games.every((g) => g.res);
  };
  HTM.lastPairedRound = (T) => T.rounds.length;
  HTM.touch = (T) => { T.modified = new Date().toISOString(); return T; };

  if (typeof module !== 'undefined' && module.exports) module.exports = HTM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
