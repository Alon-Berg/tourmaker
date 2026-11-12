/* Human Tournament Maker - Swiss pairings (Dutch system, following FIDE C.04.3 in structure; see README for the differences).
   Score brackets from the top; in a bracket the upper half (S1) is paired with the lower half (S2) in the order of the transpositions;
   no rematches, the bye goes to the lowest-ranked player who has not had one, colours follow the colour preferences. Pure logic, no DOM. */
(function (root) {
  'use strict';
  const HTM = root.HTM = root.HTM || {};
  const EPS = 1e-9;
  const BUDGET = { budget: true };

  // ---------------------------------------------------------------------------------------------- matching (Edmonds' blossom)
  function maxMatching(adj) {
    const n = adj.length;
    const match = new Array(n).fill(-1), p = new Array(n).fill(-1), base = new Array(n), used = new Array(n), blossom = new Array(n);
    let q = [];
    function lca(a, b) {
      const seen = new Array(n).fill(false);
      for (;;) { a = base[a]; seen[a] = true; if (match[a] === -1) break; a = p[match[a]]; }
      for (;;) { b = base[b]; if (seen[b]) return b; b = p[match[b]]; }
    }
    function markPath(v, b, children) {
      while (base[v] !== b) {
        blossom[base[v]] = blossom[base[match[v]]] = true;
        p[v] = children; children = match[v]; v = p[match[v]];
      }
    }
    function findPath(root0) {
      used.fill(false); p.fill(-1);
      for (let i = 0; i < n; i++) base[i] = i;
      used[root0] = true; q = [root0];
      for (let qh = 0; qh < q.length; qh++) {
        const v = q[qh];
        for (const to of adj[v]) {
          if (base[v] === base[to] || match[v] === to) continue;
          if (to === root0 || (match[to] !== -1 && p[match[to]] !== -1)) {
            const cb = lca(v, to);
            blossom.fill(false);
            markPath(v, cb, to); markPath(to, cb, v);
            for (let i = 0; i < n; i++) if (blossom[base[i]]) { base[i] = cb; if (!used[i]) { used[i] = true; q.push(i); } }
          } else if (p[to] === -1) {
            p[to] = v;
            if (match[to] === -1) return to;
            used[match[to]] = true; q.push(match[to]);
          }
        }
      }
      return -1;
    }
    for (let v = 0; v < n; v++) if (match[v] === -1) for (const to of adj[v]) if (match[to] === -1) { match[to] = v; match[v] = to; break; }
    for (let i = 0; i < n; i++) {
      if (match[i] !== -1) continue;
      const v = findPath(i);
      for (let cur = v; cur !== -1;) { const pv = p[cur], ppv = match[pv]; match[cur] = pv; match[pv] = cur; cur = ppv; }
    }
    return match;
  }
  HTM._maxMatching = maxMatching;

  // can all players of the list be paired with each other (nobody left over)?
  function canPairAll(list, compat) {
    const n = list.length;
    if (n === 0) return true;
    if (n % 2) return false;
    const used = new Array(n).fill(false);
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      if (used[i]) continue;
      let found = false;
      for (let j = i + 1; j < n; j++) if (!used[j] && compat(list[i], list[j])) { used[i] = used[j] = true; found = true; break; }
      if (!found) ok = false;
    }
    if (ok) return true;
    const adj = list.map(() => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (compat(list[i], list[j])) { adj[i].push(j); adj[j].push(i); }
    return maxMatching(adj).every((x) => x !== -1);
  }
  HTM._canPairAll = canPairAll;

  // ---------------------------------------------------------------------------------------------- colours
  function prefOf(cols) {            // cols: colours ('w' / 'b') of the games played so far; c = preferred colour, s = 2 absolute, 1 strong, 0 mild
    const n = cols.length;
    if (!n) return { c: null, s: 0 };
    let cd = 0;
    for (const c of cols) cd += c === 'w' ? 1 : -1;
    const l1 = cols[n - 1], l2 = n > 1 ? cols[n - 2] : null;
    if (cd >= 2 || (l1 === 'w' && l2 === 'w')) return { c: 'b', s: 2 };
    if (cd <= -2 || (l1 === 'b' && l2 === 'b')) return { c: 'w', s: 2 };
    if (cd === 1) return { c: 'b', s: 1 };
    if (cd === -1) return { c: 'w', s: 1 };
    return { c: l1 === 'w' ? 'b' : 'w', s: 0 };
  }
  HTM.colorPref = prefOf;

  // ---------------------------------------------------------------------------------------------- the search
  const zeroCost = () => [0, 0, 0, 0, 0, 0, 0, 0];
  const addCost = (a, b) => { const c = new Array(8); for (let i = 0; i < 8; i++) c[i] = a[i] + b[i]; return c; };
  const cmpCost = (a, b) => { for (let i = 0; i < 8; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
  const isZero = (c) => c.every((x) => x === 0);

  // The best arrangement of one bracket: mdps = players moved down from the brackets above, res = the players of the score group,
  // f = number of players that float down to the next bracket. Returns { pairs, floaters, cost } or null.
  function bracketBest(ctx, mdps, res, f, feasibleFn) {
    const M = mdps.length, R = res.length;
    let best = null, zero = false, nodes = 0;
    const stack = [];
    const tick = () => { if (++ctx.nodes > ctx.maxNodes) throw BUDGET; return ++nodes > ctx.bracketNodes && best; };

    function leaf(floaters, cost) {
      if (best && cmpCost(cost, best.cost) >= 0) return;
      if (!feasibleFn(floaters)) return;
      best = { cost, pairs: stack.map((x) => x.slice()), floaters: floaters.slice() };
      if (isZero(cost)) zero = true;
    }

    function dfsB(L, cost0) {                       // the players that are not paired with a moved-down player: upper half against lower half
      const m = L.length;
      if (m < f || ((m - f) & 1)) return;
      const k = (m - f) / 2;
      const used = new Array(m).fill(false);
      const fl = [];
      const go = (i, cost, floats, unused) => {
        if (zero || tick()) return;
        while (i < m && used[i]) i++;
        if (i >= m) {
          if (floats !== f) return;
          leaf(fl, addCost(cost, ctx.floatCost(fl)));
          return;
        }
        if (unused < f - floats) return;
        const a = L[i];
        const tryPartner = (j) => {
          if (used[j]) return;
          const b = L[j];
          if (!ctx.compat(a, b)) return;
          const c2 = addCost(cost, ctx.pairCost(a, b));
          if (best && cmpCost(c2, best.cost) >= 0) return;
          used[i] = used[j] = true; stack.push([a, b]);
          go(i + 1, c2, floats, unused - 2);
          stack.pop(); used[i] = used[j] = false;
        };
        if (i < k) {                                // S1 member: the S2 players in order, then the other S1 players (an exchange)
          for (let j = Math.max(k, i + 1); j < m && !zero; j++) tryPartner(j);
          for (let j = i + 1; j < k && !zero; j++) tryPartner(j);
        } else for (let j = i + 1; j < m && !zero; j++) tryPartner(j);
        if (!zero && floats < f) { used[i] = true; fl.push(a); go(i + 1, cost, floats + 1, unused - 1); fl.pop(); used[i] = false; }
      };
      go(0, cost0, 0, m);
    }

    if (M === 0) { dfsB(res, zeroCost()); return best; }
    for (let m1 = Math.min(M, R); m1 >= 0 && !zero; m1--) {          // as many moved-down players as possible get a partner in the score group
      const usedRes = new Array(R).fill(false);
      const dfsA = (i, cost) => {
        if (zero || tick()) return;
        if (i === m1) { dfsB(mdps.slice(m1).concat(res.filter((_, j) => !usedRes[j])), cost); return; }
        const a = mdps[i];
        for (let j = 0; j < R && !zero; j++) {
          if (usedRes[j]) continue;
          const b = res[j];
          if (!ctx.compat(a, b)) continue;
          const c2 = addCost(cost, ctx.pairCost(a, b));
          if (best && cmpCost(c2, best.cost) >= 0) continue;
          usedRes[j] = true; stack.push([a, b]);
          dfsA(i + 1, c2);
          stack.pop(); usedRes[j] = false;
        }
      };
      dfsA(0, zeroCost());
      if (best) break;
    }
    return best;
  }

  function solveBrackets(ctx, groups) {
    const n = groups.length;
    const lower = new Array(n);
    let acc = [];
    for (let g = n - 1; g >= 0; g--) { lower[g] = acc; acc = groups[g].concat(acc); }
    function rec(gi, mdps) {
      if (gi === n) return mdps.length === 0 ? [] : null;
      const res = groups[gi];
      const total = mdps.length + res.length;
      const last = gi === n - 1;
      const memo = new Map();
      const feasibleFn = (floaters) => {
        if (last) return floaters.length === 0;
        const key = floaters.map((h) => h.id).sort((a, b) => a - b).join(',');
        if (!memo.has(key)) memo.set(key, canPairAll(floaters.concat(lower[gi]), ctx.compat));
        return memo.get(key);
      };
      for (let f = last ? 0 : total % 2; f <= total; f += 2) {
        if (last && f > 0) break;
        const best = bracketBest(ctx, mdps, res, f, feasibleFn);
        if (!best) continue;
        const tail = rec(gi + 1, best.floaters);
        if (tail) return best.pairs.concat(tail);
      }
      return null;
    }
    return rec(0, []);
  }

  function fallbackPairs(list, compat) {            // always valid when a pairing exists: take the nearest partner that keeps the rest pairable
    const rest = list.slice(), out = [];
    while (rest.length) {
      const a = rest.shift();
      let done = false;
      for (let j = 0; j < rest.length && !done; j++) {
        if (!compat(a, rest[j])) continue;
        const rem = rest.filter((_, k) => k !== j);
        if (canPairAll(rem, compat)) { out.push([a, rest[j]]); rest.splice(j, 1); done = true; }
      }
      if (!done) return null;
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------- the pairing of one round
  // Returns { games: [{w, b, res: null}], byes: [{p, kind}], warnings: [], info } or { error }.
  HTM.pairSwiss = function (T, roundNo, opts) {
    opts = opts || {};
    const O = T.opts, warnings = [];
    const ent = HTM.playerEntries(T, roundNo - 1);
    const before = new Map();
    for (const [pid, es] of ent) { const a = []; let c = 0; for (const e of es) { a[e.r] = c; c += e.pts; } before.set(pid, a); }
    const H = new Map();
    for (const p of T.players) {
      const es = ent.get(p.id);
      const h = { p, id: p.id, no: p.no, pts: 0, opps: new Set(), cols: [], colByRound: [], floats: [], hadPab: false, hadForfeitWin: false };
      for (const e of es) {
        h.pts += e.pts;
        if (e.opp !== null) h.opps.add(e.opp);
        const played = e.color && (e.kind === 'game' || e.kind === 'pending');
        if (played) h.cols.push(e.color);
        h.colByRound[e.r] = played ? e.color : null;
        if (e.kind === 'pab') h.hadPab = true;
        if (e.kind === 'forfeitWin') h.hadForfeitWin = true;
        let fl = '=';
        if (e.kind === 'pab') fl = 'D';
        else if (e.opp !== null && played) { const mine = before.get(p.id)[e.r], theirs = before.get(e.opp)[e.r]; fl = mine > theirs + EPS ? 'D' : mine < theirs - EPS ? 'U' : '='; }
        h.floats[e.r] = fl;
      }
      H.set(p.id, h);
    }
    const act = [], byes = [];
    for (const p of T.players) {
      if (!HTM.isActive(p, roundNo)) continue;
      const bk = p.byes && p.byes[roundNo];
      if (bk) { byes.push({ p: p.id, kind: bk }); continue; }
      act.push(H.get(p.id));
    }
    act.sort((a, b) => (b.pts - a.pts) || (a.no - b.no));
    const rankIdx = new Map(act.map((h, i) => [h.id, i]));
    if (act.length < 1) return { games: [], byes, warnings, info: {} };
    const compat = opts.allowRepeats ? () => true : (a, b) => !a.opps.has(b.id);

    // the bye for an odd number of players: lowest score, then the lowest-ranked player, never twice; the others must remain pairable
    let pab = null;
    if (act.length % 2 === 1) {
      const cands = act.slice().sort((a, b) => (a.pts - b.pts) || (b.no - a.no));
      const pick = (list) => { for (const c of list) if (canPairAll(act.filter((x) => x !== c), compat)) return c; return null; };
      pab = pick(cands.filter((c) => !c.hadPab && !c.hadForfeitWin));
      if (!pab) {
        pab = pick(cands);
        if (pab) warnings.push(pab.p.name + ' gets a second bye because no other pairing is possible.');
      }
      if (!pab) return { error: 'No pairing is possible without a rematch. Pair this round by hand, or allow repeated pairings.' };
    }
    const pool = act.filter((x) => x !== pab);
    const groups = [];
    for (const x of pool) { const g = groups[groups.length - 1]; if (g && Math.abs(g[0].pts - x.pts) < EPS) g.push(x); else groups.push([x]); }

    const pref = new Map(act.map((h) => [h.id, prefOf(h.cols)]));
    const floatRep = (c, h, kind) => {
      if (h.floats[roundNo - 1] === kind) c[kind === 'D' ? 4 : 5]++;
      if (h.floats[roundNo - 2] === kind) c[kind === 'D' ? 6 : 7]++;
    };
    const ctx = {
      compat, nodes: 0, maxNodes: 4000000, bracketNodes: 60000,
      pairCost(a, b) {
        const c = zeroCost();
        const pa = pref.get(a.id), pb = pref.get(b.id);
        if (pa.c && pb.c && pa.c === pb.c) { if (pa.s === 2 && pb.s === 2) c[1] = 1; c[2] = 1; if (Math.min(pa.s, pb.s) >= 1) c[3] = 1; }
        if (a.pts > b.pts + EPS) { floatRep(c, a, 'D'); floatRep(c, b, 'U'); }
        else if (b.pts > a.pts + EPS) { floatRep(c, b, 'D'); floatRep(c, a, 'U'); }
        return c;
      },
      floatCost(list) {
        const c = zeroCost();
        for (const h of list) { c[0] += Math.round(h.pts * 2); floatRep(c, h, 'D'); }
        return c;
      },
    };
    let pairs = null;
    try { pairs = solveBrackets(ctx, groups); } catch (e) { if (e !== BUDGET) throw e; warnings.push('The search was cut short; the pairing is valid but may be less balanced.'); }
    if (!pairs) pairs = fallbackPairs(pool, compat);
    if (!pairs) return { error: 'No pairing is possible without a rematch. Pair this round by hand, or allow repeated pairings.' };

    // colours
    const cdOf = (h) => h.cols.reduce((s, c) => s + (c === 'w' ? 1 : -1), 0);
    const assign = (a, b) => {                       // [white, black], or null when neither has a preference
      const pa = pref.get(a.id), pb = pref.get(b.id);
      if (!pa.c && !pb.c) return null;
      if (pa.c && !pb.c) return pa.c === 'w' ? [a, b] : [b, a];
      if (!pa.c && pb.c) return pb.c === 'w' ? [b, a] : [a, b];
      if (pa.c !== pb.c) return pa.c === 'w' ? [a, b] : [b, a];
      const c = pa.c;
      let first = null;
      if (pa.s !== pb.s) first = pa.s > pb.s ? a : b;
      else if (pa.s === 2) { const da = Math.abs(cdOf(a)), db = Math.abs(cdOf(b)); if (da !== db) first = da > db ? a : b; }
      if (!first) {
        for (let r = roundNo - 1; r >= 1 && !first; r--) {
          const ca = a.colByRound[r], cb = b.colByRound[r];
          if (ca && cb && ca !== cb) first = ca === c ? b : a;
        }
      }
      if (!first) first = rankIdx.get(a.id) < rankIdx.get(b.id) ? a : b;
      const other = first === a ? b : a;
      return c === 'w' ? [first, other] : [other, first];
    };
    const boards = pairs.map(([a, b]) => ({ a, b, key: [Math.max(a.pts, b.pts), a.pts + b.pts, -Math.min(rankIdx.get(a.id), rankIdx.get(b.id))] }));
    boards.sort((x, y) => (y.key[0] - x.key[0]) || (y.key[1] - x.key[1]) || (y.key[2] - x.key[2]));
    const first = O.firstColor === 'black' ? 'b' : 'w';
    let k = 0;
    const games = boards.map((bd) => {
      let wb = assign(bd.a, bd.b);
      if (!wb) {
        const hi = rankIdx.get(bd.a.id) < rankIdx.get(bd.b.id) ? bd.a : bd.b, lo = hi === bd.a ? bd.b : bd.a;
        const hiColour = k % 2 === 0 ? first : (first === 'w' ? 'b' : 'w');
        wb = hiColour === 'w' ? [hi, lo] : [lo, hi];
        k++;
      }
      return { w: wb[0].id, b: wb[1].id, res: null };
    });
    if (pab) byes.push({ p: pab.id, kind: 'pab' });
    return { games, byes, warnings, info: { groups: groups.map((g) => g.length), nodes: ctx.nodes } };
  };

  HTM.nextRoundBlock = function (T) {                // why the next round cannot be paired yet, or null
    const planned = HTM.plannedRounds(T);
    if (T.format !== 'swiss') return 'This format is not paired round by round.';
    if (T.players.length < 2) return 'Enter at least two players.';
    if (T.rounds.length >= planned) return 'All ' + planned + ' rounds have been paired. Raise the number of rounds in the settings to continue.';
    const last = T.rounds[T.rounds.length - 1];
    if (last) {
      const open = last.games.map((g, i) => (g.res ? 0 : i + 1)).filter(Boolean);
      if (open.length) return 'Round ' + last.n + ' still has ' + open.length + ' game' + (open.length > 1 ? 's' : '') + ' without a result (board' + (open.length > 1 ? 's ' : ' ') + open.slice(0, 8).join(', ') + (open.length > 8 ? ', ...' : '') + ').';
    }
    return null;
  };

  HTM.applySwissRound = function (T, roundNo, result) {
    T.rounds.push({ n: roundNo, games: result.games, byes: result.byes });
    T.started = true;
    return T;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = HTM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
