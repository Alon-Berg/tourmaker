// Tests of the tournament engine (no browser needed):  deno run -A tests/test_engine.js
await import('../js/core.js');
await import('../js/swiss.js');
await import('../js/rr.js');
await import('../js/io.js');
const HTM = globalThis.HTM;

let failed = 0, passed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log('ok   ' + msg); } else { failed++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, msg + (x === y ? '' : '\n       got      ' + x + '\n       expected ' + y)); }
function near(a, b, msg) { ok(Math.abs(a - b) < 1e-9, msg + (Math.abs(a - b) < 1e-9 ? '' : ' (got ' + a + ', expected ' + b + ')')); }
function rngOf(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function swiss(n, rounds, ratings) {
  const T = HTM.newTournament({ name: 'T', format: 'swiss', rounds });
  for (let i = 0; i < n; i++) HTM.addPlayer(T, { name: 'P' + (i + 1), rating: ratings ? ratings[i] : 2000 - i * 10 });
  HTM.sortByRating(T);
  return T;
}
function pairRound(T, opts) {
  const r = T.rounds.length + 1;
  const res = HTM.pairSwiss(T, r, opts);
  if (res.error) return res;
  HTM.applySwissRound(T, r, res);
  return res;
}
function playRandom(T, rng) {
  const rd = T.rounds[T.rounds.length - 1];
  const pm = HTM.playerMap(T);
  for (const g of rd.games) {
    const dr = (pm.get(g.w).rating - pm.get(g.b).rating) / 400, pw = 1 / (1 + Math.pow(10, -dr));
    const x = rng();
    g.res = x < 0.22 ? '1/2' : (x - 0.22) / 0.78 < pw ? '1-0' : '0-1';
  }
}

// ---------------------------------------------------------------------------------------------- matching oracle
{
  const rng = rngOf(1);
  let bad = 0, total = 0;
  function brute(n, edge) {
    const used = new Array(n).fill(false);
    const go = () => { let i = used.indexOf(false); if (i < 0) return true; used[i] = true; for (let j = i + 1; j < n; j++) if (!used[j] && edge[i][j]) { used[j] = true; if (go()) { used[j] = false; used[i] = false; return true; } used[j] = false; } used[i] = false; return false; };
    return go();
  }
  for (let t = 0; t < 600; t++) {
    const n = 2 * (1 + Math.floor(rng() * 5)), dens = 0.15 + rng() * 0.6;
    const edge = Array.from({ length: n }, () => new Array(n).fill(false));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rng() < dens) edge[i][j] = edge[j][i] = true;
    const list = Array.from({ length: n }, (_, i) => i);
    const got = HTM._canPairAll(list, (a, b) => edge[a][b]);
    total++; if (got !== brute(n, edge)) bad++;
  }
  ok(bad === 0, 'perfect-matching check agrees with brute force on ' + total + ' random graphs');
}

// ---------------------------------------------------------------------------------------------- Berger tables
{
  eq(HTM.bergerRounds(6), [[[1, 6], [2, 5], [3, 4]], [[6, 4], [5, 3], [1, 2]], [[2, 6], [3, 1], [4, 5]], [[6, 5], [1, 4], [2, 3]], [[3, 6], [4, 2], [5, 1]]], 'Berger table for 6 players equals the FIDE table');
  eq(HTM.bergerRounds(8), [[[1, 8], [2, 7], [3, 6], [4, 5]], [[8, 5], [6, 4], [7, 3], [1, 2]], [[2, 8], [3, 1], [4, 7], [5, 6]], [[8, 6], [7, 5], [1, 4], [2, 3]], [[3, 8], [4, 2], [5, 1], [6, 7]], [[8, 7], [1, 6], [2, 5], [3, 4]], [[4, 8], [5, 3], [6, 2], [7, 1]]], 'Berger table for 8 players equals the FIDE table');
  let bad = [];
  for (let n = 2; n <= 40; n++) {
    const rounds = HTM.bergerRounds(n), m = n % 2 ? n + 1 : n;
    const met = new Set(), wh = new Array(n + 2).fill(0), bl = new Array(n + 2).fill(0);
    let problem = rounds.length !== m - 1;
    for (const pairs of rounds) {
      const seen = new Set();
      for (const [w, b] of pairs) {
        const key = Math.min(w, b) + '-' + Math.max(w, b);
        if (met.has(key) || seen.has(w) || seen.has(b)) problem = true;
        met.add(key); seen.add(w); seen.add(b);
        if (w <= n && b <= n) { wh[w]++; bl[b]++; }
      }
      if (seen.size !== m) problem = true;
    }
    if (met.size !== m * (m - 1) / 2) problem = true;
    for (let p = 1; p <= n; p++) if (Math.abs(wh[p] - bl[p]) > 1) problem = true;
    if (problem) bad.push(n);
  }
  ok(bad.length === 0, 'Berger tables for 2..40 players: every pair meets once, everybody plays every round, colours differ by at most 1' + (bad.length ? ' (bad: ' + bad + ')' : ''));
  const T = HTM.newTournament({ format: 'roundrobin' }); T.opts.doubleRR = true;
  for (let i = 0; i < 5; i++) HTM.addPlayer(T, { name: 'P' + i, rating: 1500 + i });
  HTM.createRoundRobin(T);
  ok(T.rounds.length === 10 && T.rounds.every((r) => r.games.length === 2 && r.byes.length === 1), 'double round robin of 5 players: 10 rounds, 2 games and one round off each');
  const cnt = new Map();
  for (const r of T.rounds) for (const g of r.games) { const k = g.w + '>' + g.b; cnt.set(k, (cnt.get(k) || 0) + 1); }
  ok(cnt.size === 20 && [...cnt.values()].every((v) => v === 1), 'double round robin: every ordered pair (colour assignment) occurs exactly once');
}

// ---------------------------------------------------------------------------------------------- Swiss: round 1
{
  const T = swiss(8, 5);
  const r = HTM.pairSwiss(T, 1);
  const nm = (id) => T.players.find((p) => p.id === id).no;
  eq(r.games.map((g) => [nm(g.w), nm(g.b)]), [[1, 5], [6, 2], [3, 7], [8, 4]], 'round 1 with 8 players: 1-5, 2-6, 3-7, 4-8, colours alternate from the top board');
  const T2 = swiss(7, 5);
  const r2 = HTM.pairSwiss(T2, 1);
  eq(r2.byes.map((b) => [T2.players.find((p) => p.id === b.p).no, b.kind]), [[7, 'pab']], '7 players: the lowest-ranked player gets the bye');
  eq(r2.games.map((g) => [T2.players.find((p) => p.id === g.w).no, T2.players.find((p) => p.id === g.b).no]), [[1, 4], [5, 2], [3, 6]], '7 players: the other six are paired 1-4, 2-5, 3-6');
  const T3 = swiss(8, 5); T3.opts.firstColor = 'black';
  const r3 = HTM.pairSwiss(T3, 1);
  ok(T3.players.find((p) => p.id === r3.games[0].b).no === 1, 'first colour "black": the top seed has Black on board 1');
}

// ---------------------------------------------------------------------------------------------- Swiss: random tournaments, every hard rule
{
  const t0 = Date.now();
  let tournaments = 0, rounds = 0, errors = [], bad = [], absViol = 0, playerRounds = 0, floaters = 0, boards = 0;
  const sizes = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 24, 25, 30, 31, 40, 41, 50, 63];
  for (const n of sizes) for (let seed = 1; seed <= 3; seed++) {
    const rng = rngOf(n * 100 + seed);
    const R = Math.min(9, Math.max(1, Math.floor(n / 2)));              // a Swiss tournament is not played over n-1 rounds in a tiny field: that often has no rematch-free pairing
    const T = swiss(n, R, Array.from({ length: n }, () => 1200 + Math.floor(rng() * 1000)));
    // some requested byes and a withdrawal
    if (n >= 8) { T.players[3].byes[2] = 'half'; T.players[n - 2].byes[3] = 'zero'; if (R >= 4) T.players[n - 1].withdrawn = 4; }
    tournaments++;
    for (let r = 1; r <= R; r++) {
      const before = T.rounds.length;
      const res = pairRound(T);
      if (res.error) { errors.push(n + '/' + seed + ' round ' + r + ': ' + res.error); break; }
      rounds++;
      const rd = T.rounds[before];
      const seen = new Map();
      const pm = HTM.playerMap(T);
      const hist = HTM.playerEntries(T, r - 1);
      let problem = '';
      for (const g of rd.games) {
        for (const id of [g.w, g.b]) seen.set(id, (seen.get(id) || 0) + 1);
        if (g.w === g.b) problem = 'self pairing';
        if (hist.get(g.w).some((e) => e.opp === g.b)) problem = 'rematch ' + pm.get(g.w).no + '-' + pm.get(g.b).no;
      }
      for (const b of rd.byes) seen.set(b.p, (seen.get(b.p) || 0) + 1);
      const expectActive = T.players.filter((p) => HTM.isActive(p, r)).length;
      if (seen.size !== expectActive || [...seen.values()].some((v) => v !== 1)) problem = 'players missing or paired twice (' + seen.size + ' of ' + expectActive + ')';
      for (const p of T.players) if (!HTM.isActive(p, r) && seen.has(p.id)) problem = 'withdrawn player paired';
      const pabs = rd.byes.filter((b) => b.kind === 'pab');
      const activeNoBye = T.players.filter((p) => HTM.isActive(p, r) && !(p.byes && p.byes[r])).length;
      if ((activeNoBye % 2 === 1) !== (pabs.length === 1) || pabs.length > 1) problem = 'wrong number of pairing byes';
      for (const b of pabs) if (hist.get(b.p).some((e) => e.kind === 'pab')) { if (!res.warnings.length) problem = 'second bye without warning'; }
      // absolute colour preference violations (same colour three times in a row)
      for (const g of rd.games) for (const [id, c] of [[g.w, 'w'], [g.b, 'b']]) {
        const cols = hist.get(id).filter((e) => e.color).map((e) => e.color);
        playerRounds++;
        if (cols.length >= 2 && cols[cols.length - 1] === c && cols[cols.length - 2] === c) absViol++;
      }
      for (const g of rd.games) { boards++; if (Math.abs(HTM.standings(T, r - 1).byId.get(g.w).points - HTM.standings(T, r - 1).byId.get(g.b).points) > 1.01) floaters++; }
      if (problem) { bad.push(n + '/' + seed + ' round ' + r + ': ' + problem); break; }
      playRandom(T, rng);
    }
  }
  ok(errors.length === 0, 'random Swiss tournaments (' + tournaments + ' tournaments, ' + rounds + ' rounds): every round could be paired' + (errors.length ? ' - ' + errors.slice(0, 3).join('; ') : ''));
  ok(bad.length === 0, 'random Swiss tournaments: everybody paired exactly once, no rematch, bye only for an odd field, withdrawn players left out' + (bad.length ? ' - ' + bad.slice(0, 3).join('; ') : ''));
  console.log('     (same colour three times in a row: ' + absViol + ' of ' + playerRounds + ' player-rounds; pairs more than a point apart: ' + floaters + ' of ' + boards + ' boards; ' + (Date.now() - t0) + ' ms)');
  ok(absViol / playerRounds < 0.02, 'colour rule: fewer than 2% of the player-rounds repeat a colour a third time');
}

// ---------------------------------------------------------------------------------------------- Swiss: when a pairing exists the program finds it (brute force on tiny fields)
{
  function existsPerfect(list, played) {
    const used = new Array(list.length).fill(false);
    const go = () => { const i = used.indexOf(false); if (i < 0) return true; used[i] = true; for (let j = i + 1; j < list.length; j++) if (!used[j] && !played.get(list[i]).has(list[j])) { used[j] = true; const r = go(); used[j] = false; if (r) { used[i] = false; return true; } } used[i] = false; return false; };
    return go();
  }
  let checked = 0, miss = [];
  for (let n = 4; n <= 8; n += 2) for (let seed = 1; seed <= 40; seed++) {
    const rng = rngOf(7000 + n * 50 + seed);
    const T = swiss(n, n - 1);
    for (let r = 1; r <= n - 1; r++) {
      const played = new Map(T.players.map((p) => [p.id, new Set()]));
      for (const rd of T.rounds) for (const g of rd.games) { played.get(g.w).add(g.b); played.get(g.b).add(g.w); }
      const possible = existsPerfect(T.players.map((p) => p.id), played);
      const res = pairRound(T);
      checked++;
      if (possible && res.error) miss.push(n + '/' + seed + '/r' + r);
      if (res.error) break;
      playRandom(T, rng);
    }
  }
  ok(miss.length === 0, 'tiny Swiss fields (4, 6, 8 players, full length): a rematch-free pairing is always found when one exists (' + checked + ' rounds)' + (miss.length ? ' - missed ' + miss.slice(0, 4) : ''));
}

// ---------------------------------------------------------------------------------------------- Swiss: requested byes, withdrawals, repeated pairings
{
  const T = swiss(6, 4);
  T.players[1].byes[1] = 'half';                    // player 2 asks for a half-point bye in round 1
  const r = pairRound(T);
  ok(r.byes.some((b) => b.p === T.players[1].id && b.kind === 'half') && r.games.length === 2, 'requested half-point bye: the player is not paired and gets the bye');
  playRandom(T, rngOf(3));
  const st = HTM.standings(T, 1);
  near(st.byId.get(T.players[1].id).points, 0.5, 'requested half-point bye scores half a point');
  T.players[5].withdrawn = 2;
  const r2 = pairRound(T);
  ok(!r2.games.some((g) => g.w === T.players[5].id || g.b === T.players[5].id) && !r2.byes.some((b) => b.p === T.players[5].id), 'a withdrawn player is not paired any more');
  const U = swiss(2, 3);
  pairRound(U); playRandom(U, rngOf(5));
  const e = pairRound(U);
  ok(e.error && /rematch/i.test(e.error), 'two players, round 2: no pairing without a rematch is reported as an error');
  const f = HTM.pairSwiss(U, 2, { allowRepeats: true });
  ok(!f.error && f.games.length === 1, '... and "allow repeated pairings" pairs them again');
  ok(HTM.nextRoundBlock(T) !== null && /without a result/.test(HTM.nextRoundBlock(T)), 'the next round is blocked while results are missing');
}

// ---------------------------------------------------------------------------------------------- speed
{
  const rng = rngOf(99);
  const T = swiss(150, 9, Array.from({ length: 150 }, () => 1000 + Math.floor(rng() * 1500)));
  const t0 = Date.now();
  let good = true;
  for (let r = 1; r <= 9; r++) { const res = pairRound(T); if (res.error) { good = false; break; } playRandom(T, rng); }
  const ms = Date.now() - t0;
  ok(good && ms < 8000, '150 players, 9 rounds paired in ' + ms + ' ms');
}

// ---------------------------------------------------------------------------------------------- standings and tie-breaks
{
  const T = HTM.newTournament({ format: 'roundrobin' });
  for (const [nm, rt] of [['A', 2000], ['B', 1900], ['C', 1800], ['D', 1700]]) HTM.addPlayer(T, { name: nm, rating: rt });
  T.opts.tiebreaks = ['sb', 'de'];
  HTM.createRoundRobin(T);
  const id = (nm) => T.players.find((p) => p.name === nm).id;
  const set = (x, y, res) => { for (const rd of T.rounds) for (const g of rd.games) { if (g.w === id(x) && g.b === id(y)) g.res = res; else if (g.w === id(y) && g.b === id(x)) g.res = res === '1-0' ? '0-1' : res === '0-1' ? '1-0' : res; } };
  set('A', 'B', '1-0'); set('A', 'C', '1/2'); set('A', 'D', '1-0'); set('B', 'C', '1-0'); set('B', 'D', '1/2'); set('C', 'D', '1-0');
  const st = HTM.standings(T);
  eq(st.rows.map((r) => r.p.name), ['A', 'B', 'C', 'D'], 'round robin of four: A first, then B ahead of C on direct encounter (SB is equal), D last');
  near(st.byId.get(id('A')).points, 2.5, 'points of A'); near(st.byId.get(id('B')).tb.sb, 1.75, 'Sonneborn-Berger of B'); near(st.byId.get(id('C')).tb.sb, 1.75, 'Sonneborn-Berger of C'); near(st.byId.get(id('A')).tb.sb, 2.75, 'Sonneborn-Berger of A');
  near(st.byId.get(id('A')).tb.buchholz, 3.5, 'Buchholz of A'); near(st.byId.get(id('A')).tb.buchholz1, 3.0, 'Buchholz Cut 1 of A (without the lowest score 0.5)'); near(st.byId.get(id('A')).tb.median1, 1.5, 'Median Buchholz of A');
  T.opts.tiebreaks = ['sb'];
  const st2 = HTM.standings(T);
  eq(st2.rows.map((r) => r.p.name), ['A', 'B', 'C', 'D'], 'without direct encounter the exact tie falls back to the starting rank');
  ok(st2.rows[1].tied && st2.rows[2].tied, '... and the two players are marked as tied');

  // virtual opponent for byes (FIDE tie-break regulations): X beats Y, Z has the bye; round 2: X draws Z, Y has the bye
  const S = HTM.newTournament({ format: 'swiss', rounds: 2 });
  for (const nm of ['X', 'Y', 'Z']) HTM.addPlayer(S, { name: nm, rating: 1500 });
  const sid = (nm) => S.players.find((p) => p.name === nm).id;
  S.rounds.push({ n: 1, games: [{ w: sid('X'), b: sid('Y'), res: '1-0' }], byes: [{ p: sid('Z'), kind: 'pab' }] });
  S.rounds.push({ n: 2, games: [{ w: sid('Z'), b: sid('X'), res: '1/2' }], byes: [{ p: sid('Y'), kind: 'pab' }] });
  S.opts.tiebreaks = ['buchholz'];
  const sr = HTM.standings(S);
  near(sr.byId.get(sid('Y')).tb.buchholz, 1.5, 'Buchholz with a bye: Y = score of X (1.5) + virtual opponent (0)');
  near(sr.byId.get(sid('Z')).tb.buchholz, 2.0, 'Buchholz with a bye: Z = virtual opponent 0.5 + score of X (1.5)');
  near(sr.byId.get(sid('X')).tb.buchholz, 2.5, 'Buchholz of X = Y (1) + Z (1.5)');
  eq(HTM.standings(S, 1).rows.map((r) => HTM.fmtPts(r.points)), ['1', '1', '0'], 'standings after round 1 only count round 1');

  near(HTM.ratingDiff(0.75), 193, 'performance rating table: 75% = +193'); near(HTM.ratingDiff(0.25), -193, 'performance rating table: 25% = -193'); near(HTM.ratingDiff(1), 800, 'performance rating table: 100% = +800'); near(HTM.ratingDiff(0.5), 0, 'performance rating table: 50% = 0');
  eq([HTM.fmtPts(4.5), HTM.fmtPts(0.5), HTM.fmtPts(3), HTM.fmtPts(0)], ['4½', '½', '3', '0'], 'half points are shown as ½');

  // football scoring
  const F = HTM.newTournament({ format: 'roundrobin' }); F.opts.win = 3; F.opts.draw = 1; F.opts.loss = 0; F.opts.forfeitWin = 3;
  for (const nm of ['a', 'b', 'c']) HTM.addPlayer(F, { name: nm });
  HTM.createRoundRobin(F);
  for (const rd of F.rounds) for (const g of rd.games) g.res = '1-0';
  const fs = HTM.standings(F);
  ok(fs.rows.reduce((s, r) => s + r.points, 0) === 9, '3-1-0 scoring: three games, 9 points in total');
}

// ---------------------------------------------------------------------------------------------- knockout
{
  eq(HTM.koSeedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6], 'knockout seeding for 8: 1-8, 4-5, 2-7, 3-6');
  eq(HTM.koSeedOrder(16).slice(0, 4), [1, 16, 8, 9], 'knockout seeding for 16 starts 1-16, 8-9');
  let bad = [];
  for (let n = 2; n <= 33; n++) for (const games of [1, 2, 3]) {
    const rng = rngOf(n * 10 + games);
    const T = HTM.newTournament({ format: 'knockout' }); T.opts.koGames = games;
    for (let i = 0; i < n; i++) HTM.addPlayer(T, { name: 'P' + (i + 1), rating: 2500 - i });
    HTM.createKnockout(T);
    const size = T.ko.size;
    if (size < n || size / 2 >= n) bad.push('size ' + n);
    const byes = T.ko.rounds[0].filter((m) => m.bye).length;
    if (byes !== size - n) bad.push('byes ' + n);
    for (const m of T.ko.rounds[0]) if (m.bye && !(m.sa <= size - n * 0 && (m.sa <= (size - n)))) bad.push('bye to a low seed ' + n);
    let guard = 0;
    while (guard++ < 500) {
      let did = false;
      for (const rd of T.ko.rounds) for (const m of rd) {
        if (m.a && m.b && !HTM.koWinner(m)) {
          did = true;
          for (let g = 0; g < m.games.length; g++) if (!m.games[g] && !HTM.koWinner(m)) m.games[g] = ['1-0', '0-1', '1/2'][Math.floor(rng() * 3)];
          if (!HTM.koWinner(m)) m.tb = rng() < 0.5 ? 'a' : 'b';
          HTM.koAdvance(T);
        }
      }
      if (!did) break;
    }
    const st = HTM.koStandings(T);
    if (st.filter((x) => x.champion).length !== 1 || st[0].label !== '1' || st.some((x) => x.alive)) bad.push('standings ' + n + '/' + games);
    if (new Set(st.map((x) => x.p.id)).size !== n) bad.push('standings players ' + n);
  }
  ok(bad.length === 0, 'knockout for 2..33 players with 1, 2 and 3 games per match: byes to the top seeds, one champion, everybody ranked' + (bad.length ? ' - ' + bad.slice(0, 4) : ''));
  const T = HTM.newTournament({ format: 'knockout' }); T.opts.koGames = 3;
  for (let i = 0; i < 4; i++) HTM.addPlayer(T, { name: 'P' + (i + 1), rating: 2000 - i });
  HTM.createKnockout(T);
  const m = T.ko.rounds[0][0];
  m.games[0] = '1-0'; m.games[1] = '1/2';                  // game 1: a has White; game 2: b has White
  ok(HTM.koWinner(m) === null, 'best of 3: 1.5 - 0.5 after two games and one to play is not decided yet');
  m.games[1] = '1-0';                                      // b (White) wins game 2
  ok(HTM.koWinner(m) === null, '... 1 - 1 is not decided');
  m.games[1] = '0-1';                                      // a (Black) wins game 2
  ok(HTM.koWinner(m) === 'a', '... 2 - 0 with one game to play is decided');
  m.games[1] = '1-0'; m.games[2] = '1/2';
  ok(HTM.koWinner(m) === null, '... 1.5 - 1.5 after three games needs a tie-break');
  m.tb = 'b';
  ok(HTM.koWinner(m) === 'b', '... and the tie-break winner decides');
}

// ---------------------------------------------------------------------------------------------- files
{
  const T = swiss(10, 5);
  const rng = rngOf(8);
  for (let r = 1; r <= 3; r++) { pairRound(T); playRandom(T, rng); }
  const back = HTM.importJSON(HTM.exportJSON(T));
  eq(back.rounds, T.rounds, 'JSON export and import keep all rounds');
  eq(back.players.map((p) => [p.id, p.no, p.name, p.rating]), T.players.map((p) => [p.id, p.no, p.name, p.rating]), '... and all players');
  let msg = '';
  try { HTM.importJSON('{"nothing": 1}'); } catch (e) { msg = e.message; }
  ok(/not a Tourmaker file/.test(msg), 'a file that is not a tournament is refused with a plain message');
  try { HTM.importJSON('x{'); msg = ''; } catch (e) { msg = e.message; }
  ok(/not valid JSON/.test(msg), 'broken JSON is refused with a plain message');
  const dirty = JSON.parse(HTM.exportJSON(T)); dirty.tournament.rounds[0].games.push({ w: 999, b: 1, res: '1-0' }); dirty.tournament.rounds[0].games[0].res = 'banana';
  const fixed = HTM.importJSON(JSON.stringify(dirty));
  ok(fixed.rounds[0].games.every((g) => g.res === null || HTM.RESULTS.includes(g.res)) && !fixed.rounds[0].games.some((g) => g.w === 999), 'unknown players and results in a file are dropped');
  const st = HTM.standings(T);
  const rows = HTM.standingsRows(T, st);
  ok(rows.length === 11 && rows[0][0] === 'Rank' && rows[1][3].startsWith('P'), 'standings export has a header and one row per player');
  ok(HTM.csv([['a', 'b,c', 'd"e']]) === 'a,"b,c","d""e"\r\n', 'CSV quotes commas and quotation marks');
}

console.log('\n' + (failed ? 'FAILED: ' + failed + ' of ' + (passed + failed) : 'ALL OK (' + passed + ' checks)'));
if (failed) Deno.exit(1);
