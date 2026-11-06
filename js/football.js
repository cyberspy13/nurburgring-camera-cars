// football.js — a six-a-side match on Parkroyal's pitch: Parkroyal Community School against Tytherington,
// with a referee, goals with nets, floodlights, a giant scoreboard over a live screen showing the match, and
// the TV camera on its tower that the Football view (and that screen) watches from.
// The match runs in pitch coordinates (school.js): u along the road, l away from it.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});
  const FONT = '"Saira Condensed", "Arial Narrow", sans-serif';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // The pitch's white lines (school.js): goal lines at u = ±GL, touchlines at l = TL0 and TL1, the centre spot at (0, MID).
  const GL = 27, TL0 = 10.5, TL1 = 29.5, MID = 20;
  const GW = 1.83, GH = 1.83, BR = 0.11; // half the goal's width, its height (five-a-side goals), the ball's radius
  const HALF = 360;                     // seconds of play in each half
  const SPRINT = 5.4, RUN = 3.8, JOG = 2.4, WALK = 1.3;
  const KICK = 0.34;                    // how long a kick takes, wind-up to follow-through

  const TEAMS = [
    { name: 'Parkroyal', long: 'PARKROYAL', short: 'PAR', col: '#c4161c',
      kit: { top: '#c4161c', sleeve: '#c4161c', thigh: '#f4f4f0', shin: '#c4161c' },
      keeper: { top: '#2fa84f', sleeve: '#2fa84f', thigh: '#1d1f23', shin: '#1d1f23' } },
    { name: 'Tytherington', long: 'TYTHERINGTON', short: 'TYT', col: '#1f5fbf',
      kit: { top: '#1f5fbf', sleeve: '#1f5fbf', thigh: '#14213d', shin: '#f4f4f0' },
      keeper: { top: '#f2c230', sleeve: '#f2c230', thigh: '#1d1f23', shin: '#1d1f23' } },
  ];
  // Where each player plays, in their own team's terms: x towards the goal they attack, l across the pitch.
  const SHAPE = [
    { role: 'gk', x: -25.4, l: 20 },
    { role: 'def', x: -15, l: 14.5 }, { role: 'def', x: -15, l: 25.5 },
    { role: 'mid', x: -4, l: 20 },
    { role: 'fwd', x: 8, l: 15 }, { role: 'fwd', x: 8, l: 25 },
  ];
  const KO = [[-25.4, 20], [-12, 14], [-12, 26], [-6.5, 20], [-3.8, 15.5], [-3.8, 24.5]]; // kick-off, in their own half
  const KO_KICK = { 3: [-0.35, 20], 4: [-0.8, 23.2] }; // the side kicking off: one over the ball, one beside it

  // ======================= the match itself =======================
  function createMatch(rand) {
    rand = rand || Math.random;
    const teams = TEAMS.map((info, i) => ({ i, info, dir: i ? -1 : 1, score: 0, players: [], chaser: null, second: null }));
    const all = [];
    const person = (o) => Object.assign({ u: 0, l: MID, vu: 0, vl: 0, tu: 0, tl: MID, ts: 0, head: 0, ph: rand() * 6.283, amp: 0,
      pace: 0.92 + rand() * 0.16, cd: 0, kickT: 0, kpow: 1, foot: rand() < 0.8 ? 0 : 1, hold: 0, anim: 'run', animT: 0, look: null }, o);
    teams.forEach((T) => SHAPE.forEach((s, k) => { const p = person({ team: T, k, role: s.role }); T.players.push(p); all.push(p); }));
    teams[0].home = true; // Parkroyal know their own pitch: they shoot a little straighter and their keeper fumbles less
    const ref = person({ team: null, k: -1, role: 'ref', pace: 1, l: 13 });
    const everyone = all.concat(ref);
    const ball = { u: 0, l: MID, h: 0, vu: 0, vl: 0, vh: 0, holder: null, inNet: 0 };
    const M = { phase: 'kickoff', pt: 0, clock: 0, half: 1, kick: 0, first: 0, last: null, lastP: null, passTo: null, n: 1,
      started: false, placed: true, task: null, scorer: null, goalTeam: null, cel: null, winner: null, onEvent: null,
      teams, all, ref, ball };

    const emit = (type, o) => { if (M.onEvent) M.onEvent(Object.assign({ type }, o)); };
    const other = (T) => teams[1 - T.i];
    const dist = (p, q) => Math.hypot(p.u - q.u, p.l - q.l);
    const setT = (p, u, l, s) => { p.tu = u; p.tl = l; p.ts = s * p.pace; };
    const inBox = (T, u, l) => Math.hypot(u + GL * T.dir, l - MID) < 6.5; // the keeper's area in front of their goal
    const nearestOpp = (p) => { let o = null, d = 1e9; for (const q of other(p.team).players) { const e = dist(p, q); if (e < d) { d = e; o = q; } } return o; };
    function segDist(o, a, b) { // from o to the line from a to b
      const du = b.u - a.u, dl = b.l - a.l, L2 = du * du + dl * dl || 1;
      const k = clamp(((o.u - a.u) * du + (o.l - a.l) * dl) / L2, 0, 1);
      return Math.hypot(a.u + du * k - o.u, a.l + dl * k - o.l);
    }
    function whistle(kind) { ref.anim = 'whistle'; ref.animT = 1.3; emit('whistle', { kind }); }

    function lineUp() { // everyone on their kick-off spot, the ball on the centre spot
      teams.forEach((T) => T.players.forEach((p, k) => {
        const s = (T.i === M.kick && KO_KICK[k]) || KO[k];
        p.u = p.tu = s[0] * T.dir; p.l = p.tl = s[1]; p.vu = p.vl = 0; p.head = T.dir > 0 ? 0 : Math.PI;
      }));
      ref.u = ref.tu = -2; ref.l = ref.tl = 13; ref.head = Math.PI / 2;
      Object.assign(ball, { u: 0, l: MID, h: 0, vu: 0, vl: 0, vh: 0, holder: null, inNet: 0 });
    }
    lineUp();

    // ---------- kicking the ball ----------
    function kick(p, ang, speed, vh, cd, pow) {
      if (ball.holder) { ball.holder = null; ball.h = Math.max(ball.h, 0.05); }
      ball.vu = Math.cos(ang) * speed; ball.vl = Math.sin(ang) * speed; ball.vh = vh;
      if (vh > 0) ball.h = Math.max(ball.h, 0.02);
      p.cd = cd; p.kickT = KICK * 0.55; p.kpow = pow == null ? 1 : pow;
      M.last = p.team; M.lastP = p; M.passTo = null;
      if (speed > 8.5) emit('kick', { power: clamp((speed - 6) / 10, 0, 1), u: ball.u, l: ball.l });
    }
    function shoot(p, dg) {
      const gu = GL * p.team.dir, sd = rand() < 0.5 ? -1 : 1;
      const aim = MID + sd * (0.45 + rand() * 1.25), err = (rand() - 0.5) * (0.06 + dg * 0.013) * (p.team.home ? 0.9 : 1);
      const vh = rand() < 0.12 ? 4.5 + rand() * 2.5 : 0.4 + rand() * 2.6; // now and then one goes over the bar
      kick(p, Math.atan2(aim - ball.l, gu - ball.u) + err, 11 + rand() * 5 * p.pace, vh, 0.9, 1);
      emit('shot', { team: p.team });
    }
    // the best team-mate to pass to: further forward, free of markers, and not behind someone
    function passTo(p) {
      let best = null, bs = -1e9;
      for (const q of p.team.players) {
        if (q === p || (q.role === 'gk' && rand() < 0.85)) continue;
        const d = dist(p, q);
        if (d < 3 || d > 21) continue;
        let free = 9, lane = 9;
        for (const o of other(p.team).players) { free = Math.min(free, dist(o, q)); lane = Math.min(lane, segDist(o, p, q)); }
        if (lane < 1) continue;
        const s = (q.u - p.u) * p.team.dir * 0.6 + Math.min(free, 6) * 1.2 + Math.min(lane, 4) - d * 0.15 + rand() * 2;
        if (s > bs) { bs = s; best = q; }
      }
      return best;
    }
    function pass(p, q, soft) {
      const lu = clamp(q.u + q.vu * 0.5, -GL + 0.5, GL - 0.5), ll = clamp(q.l + q.vl * 0.5, TL0 + 0.6, TL1 - 0.6);
      const d = Math.hypot(lu - ball.u, ll - ball.l);
      const speed = soft ? clamp(2.5 + d * 0.7, 4, 9) : clamp(3 + d * 0.85, 5.5, 13);
      kick(p, Math.atan2(ll - ball.l, lu - ball.u) + (rand() - 0.5) * 0.12, speed, !soft && d > 14 && rand() < 0.5 ? 3 + rand() * 2 : soft ? 1.6 : 0, 0.7, 0.75);
      M.passTo = q;
    }
    function clear(p) {
      kick(p, (p.team.dir > 0 ? 0 : Math.PI) + (rand() - 0.5) * 0.9, 13 + rand() * 3, 5 + rand() * 2.5, 0.8, 1);
    }
    function cross(p) {
      const T = p.team, tu = GL * T.dir - T.dir * (2 + rand() * 5), tl = MID + (rand() - 0.5) * 7;
      const d = Math.hypot(tu - ball.u, tl - ball.l);
      kick(p, Math.atan2(tl - ball.l, tu - ball.u), clamp(3 + d * 0.6, 8, 13), 4 + rand() * 2, 0.8, 1);
    }
    function dribble(p) {
      const T = p.team;
      let ang = Math.atan2(MID + (rand() - 0.5) * 6 - ball.l, GL * T.dir - ball.u);
      const o = nearestOpp(p);
      if (o && dist(o, p) < 4) { // swerve away from someone in the way
        const rel = wrap(Math.atan2(o.l - p.l, o.u - p.u) - ang);
        if (Math.abs(rel) < 1.2) ang -= Math.sign(rel || 1) * (1.2 - Math.abs(rel)) * 0.9;
      }
      if ((ball.l < TL0 + 1.5 && Math.sin(ang) < 0) || (ball.l > TL1 - 1.5 && Math.sin(ang) > 0)) ang = Math.atan2(-Math.sin(ang) * 0.3, Math.cos(ang)); // keep it on the pitch
      kick(p, ang, Math.max(3.4, Math.hypot(p.vu, p.vl) + 1.7), 0, 0.3, 0.4);
    }
    function act(p) {
      const T = p.team, gu = GL * T.dir, x = ball.u * T.dir;
      const dg = Math.hypot(gu - ball.u, MID - ball.l), o = nearestOpp(p), press = o ? dist(o, p) : 9;
      if (dg < 15 && x < GL - 0.5 && rand() < (dg < 9 ? 0.85 : dg < 12 ? 0.5 : 0.25)) return shoot(p, dg);
      if (rand() < (press < 2.2 ? 0.65 : 0.22)) { const q = passTo(p); if (q) return pass(p, q); }
      if (x < -14 && press < 2.5 && rand() < 0.6) return clear(p);
      dribble(p);
    }
    function hold(p) {
      Object.assign(ball, { holder: p, vu: 0, vl: 0, vh: 0 });
      p.hold = 1.2 + rand() * 1.2; p.cd = 0.5;
      M.last = p.team; M.lastP = p; M.passTo = null;
    }
    // the ball reaches someone
    function touch(p) {
      const T = p.team, sp = Math.hypot(ball.vu, ball.vl);
      if (p.role === 'gk' && inBox(T, ball.u, ball.l)) {
        const shot = sp > 8 && ball.vu * T.dir < 0;
        if (shot && rand() < (T.home ? 0.2 : 0.24)) { p.cd = 0.8; return; } // they're only young: it squirms past
        if (!shot || rand() < 0.55) { hold(p); if (shot) emit('save', { team: T }); return; }
        // pushed away
        Object.assign(ball, { vu: -ball.vu * 0.35 + T.dir * 2, vl: (rand() - 0.5) * 9, vh: 2.5 + rand() * 2 });
        p.cd = 1.2; M.last = T; M.lastP = p; M.passTo = null;
        emit('save', { team: T });
        return;
      }
      if (sp > 9 && rand() < 0.3) { // a hard ball doesn't always stick
        Object.assign(ball, { vu: -ball.vu * 0.25 + (rand() - 0.5) * 3, vl: ball.vl * 0.3 + (rand() - 0.5) * 4, vh: 1 + rand() * 1.5 });
        p.cd = 0.5; M.last = T; M.lastP = p; M.passTo = null;
        return;
      }
      act(p);
    }
    function touches() {
      if (ball.holder) return;
      let best = null, bd = 1e9;
      for (const p of all) {
        if (p.cd > 0) continue;
        const gk = p.role === 'gk' && inBox(p.team, ball.u, ball.l);
        if (ball.h > (gk ? 2.2 : 0.75)) continue;
        const d = Math.hypot(ball.u - p.u, ball.l - p.l);
        if (d < (gk ? 1.05 : 0.62) && d < bd) { bd = d; best = p; }
      }
      if (best) touch(best);
    }

    // ---------- where everyone wants to be ----------
    function chase(p, speed) {
      const lead = Math.min(0.8, dist(p, ball) / (speed * p.pace));
      setT(p, clamp(ball.u + ball.vu * lead, -30.4, 30.4), clamp(ball.l + ball.vl * lead, 8, 34), speed); // (as far as anyone can go)
    }
    function shape(p) {
      const T = p.team, s = SHAPE[p.k], bx = ball.u * T.dir;
      let x = s.x + bx * 0.45 + (M.last === T ? 3.5 : -1.5);
      if (p.role === 'def') x = Math.min(x, bx - 2, 2); // goal-side of the ball
      if (p.role === 'fwd') x = Math.max(x, -6);
      x = clamp(x, -23, 23);
      const l = clamp(s.l + (ball.l - MID) * 0.4, TL0 + 1, TL1 - 1);
      const d = Math.hypot(x * T.dir - p.u, l - p.l);
      setT(p, x * T.dir, l, d > 6 ? RUN : d > 1.5 ? JOG : WALK);
    }
    function keeper(p) {
      const T = p.team, gu = -GL * T.dir;
      if (ball.holder === p) { setT(p, p.u, p.l, 0); return; }
      let tu = gu + 1.2 * T.dir, tl = MID + clamp((ball.l - MID) * 0.3, -1.4, 1.4), ts = JOG;
      const vx = ball.vu * T.dir;
      if (!ball.holder && vx < -4) { // coming at goal: get across to where it will cross the line
        const tt = (ball.u * T.dir + GL) / -vx;
        if (tt < 2.2) { const lc = ball.l + ball.vl * tt; if (Math.abs(lc - MID) < GW + 2) { tl = clamp(lc, MID - GW - 0.4, MID + GW + 0.4); ts = 5.2; } }
      } else if (!ball.holder && inBox(T, ball.u, ball.l) && ball.h < 1.5) { // loose in the area: go and get it
        let near = 1e9;
        for (const o of other(T).players) near = Math.min(near, dist(o, ball));
        if (dist(p, ball) < near + 2) { tu = ball.u; tl = ball.l; ts = 5; }
      }
      setT(p, tu, tl, ts);
    }
    function refFollow() {
      const tl = ball.l > 16 ? ball.l - 7 : ball.l + 7, tu = clamp(ball.u * 0.85, -22, 22);
      setT(ref, tu, clamp(tl, 11, 28), Math.hypot(tu - ref.u, tl - ref.l) > 4 ? RUN * 0.85 : JOG);
    }
    function pickChasers() {
      for (const T of teams) {
        let best = null, bd = 1e9, sec = null, sd = 1e9;
        for (const p of T.players) {
          if (p.role === 'gk') continue;
          let d = dist(p, ball);
          if (p.cd > 0.3 && M.lastP === p) d += 6;   // just passed it: let it go
          if (M.passTo === p) d -= 4;                // the one it was passed to
          if (p === T.chaser) d -= 1;                // and no swapping every moment
          if (d < bd) { sec = best; sd = bd; best = p; bd = d; } else if (d < sd) { sec = p; sd = d; }
        }
        T.chaser = best; T.second = sec;
      }
    }
    // p goes and picks the ball up, then carries it to (u, l); true once there with it
    function carry(p, u, l) {
      if (ball.holder && ball.holder !== p) ball.holder = null;
      if (ball.holder !== p) {
        chase(p, RUN);
        if (dist(p, ball) < 0.75 && Math.hypot(ball.vu, ball.vl) < 4 && ball.h < 1.2) { hold(p); ball.inNet = 0; p.hold = 1e9; }
        return false;
      }
      setT(p, u, l, RUN);
      return Math.hypot(p.u - u, p.l - l) < 0.3;
    }

    // ---------- the phases ----------
    function play(h) {
      pickChasers();
      for (const p of all) {
        p.anim = ball.holder === p ? 'hold' : 'run';
        if (p.role === 'gk') keeper(p);
        else if (p === p.team.chaser) chase(p, SPRINT);
        else if (p === p.team.second && M.last !== p.team && dist(p, ball) < 10) chase(p, RUN);
        else shape(p);
      }
      refFollow();
      const k = ball.holder;
      if (k && k.role === 'gk' && (k.hold -= h) <= 0) { // the keeper lets it go: thrown out, or a big kick
        const q = passTo(k);
        ball.h = 1;
        if (q && rand() < 0.6) { pass(k, q, true); k.kickT = 0; } else clear(k); // (a throw needs no kick)
      }
    }
    function out(type, T, u, l) {
      M.phase = 'restart'; M.pt = 0; M.passTo = null;
      let taker = T.players[0];
      if (type !== 'goalkick') { let d = 1e9; for (const p of T.players) if (p.role !== 'gk' && Math.hypot(p.u - u, p.l - l) < d) { d = Math.hypot(p.u - u, p.l - l); taker = p; } }
      M.task = { type, team: T, u, l, p: taker, stage: 'fetch', t: 0 };
      M.last = T;
      emit('out', { kind: type, team: T });
    }
    function restart(h) {
      const k = M.task, p = k.p, T = k.team;
      for (const q of all) if (q !== p) { q.anim = 'run'; q.role === 'gk' ? keeper(q) : shape(q); }
      for (const q of other(T).players) { // the other side stands off
        const du = q.tu - k.u, dl = q.tl - k.l, d = Math.hypot(du, dl);
        if (d < 4) { q.tu = k.u + (du / (d || 1)) * 4; q.tl = clamp(k.l + (dl / (d || 1)) * 4, TL0, TL1); }
      }
      refFollow();
      k.t += h;
      const face = Math.atan2(MID - k.l, -k.u * 0.6);
      if (k.stage === 'fetch') {
        p.anim = ball.holder === p ? 'hold' : 'run';
        if (k.t > 15 && ball.holder !== p) hold(p), p.hold = 1e9; // never stuck: somehow it's in their hands
        if (carry(p, k.u, k.l)) { k.stage = 'set'; k.t = 0; }
      } else if (k.stage === 'set') {
        p.look = { u: k.u + Math.cos(face) * 5, l: k.l + Math.sin(face) * 5 };
        if (k.type === 'throw') { setT(p, k.u, k.l, 0); p.anim = 'throw'; }
        else { // put it down and take a step back
          if (ball.holder === p) Object.assign(ball, { holder: null, u: k.u, l: k.l, h: 0, vu: 0, vl: 0, vh: 0 });
          setT(p, k.u - Math.cos(face) * 1.4, k.l - Math.sin(face) * 1.4, WALK); p.anim = 'run';
        }
        if (k.t > 1.1) { k.stage = 'go'; k.t = 0; }
      } else if (k.type === 'throw') {
        let q = passTo(p);
        if (!q) { let d = 1e9; for (const r of T.players) if (r !== p && r.role !== 'gk' && dist(r, p) < d) { d = dist(r, p); q = r; } }
        ball.h = 1.6;
        pass(p, q, true);
        p.kickT = 0; // thrown, not kicked
        p.anim = 'run'; p.look = null; M.phase = 'play'; M.pt = 0;
      } else {
        setT(p, ball.u, ball.l, RUN); p.anim = 'run';
        if (dist(p, ball) < 0.55) {
          if (k.type === 'corner') cross(p); else clear(p);
          p.look = null; M.phase = 'play'; M.pt = 0;
        }
      }
    }
    function kickoff() {
      const K = teams[M.kick], kp = K.players[3];
      teams.forEach((T) => T.players.forEach((p, k) => {
        p.anim = ball.holder === p ? 'hold' : 'run'; p.look = { u: 0, l: MID };
        if (p === kp && !M.placed) return; // they see to the ball
        const s = (T === K && KO_KICK[k]) || KO[k], d = Math.hypot(s[0] * T.dir - p.u, s[1] - p.l);
        setT(p, s[0] * T.dir, s[1], d > 4 ? RUN : JOG);
      }));
      setT(ref, -2, 13, Math.hypot(ref.u + 2, ref.l - 13) > 4 ? RUN : WALK); ref.look = { u: 0, l: MID };
      if (!M.placed && (carry(kp, 0, MID) || M.pt > 25)) { M.placed = true; Object.assign(ball, { holder: null, u: 0, l: MID, h: 0, vu: 0, vl: 0, vh: 0, inNet: 0 }); }
      const ready = M.placed && all.every((p) => Math.hypot(p.u - p.tu, p.l - p.tl) < 0.8);
      if (M.placed && ((ready && M.pt > 3) || M.pt > 16)) {
        whistle('short');
        everyone.forEach((p) => { p.look = null; });
        M.started = true; M.phase = 'play'; M.pt = 0;
        pass(kp, K.players[4], true);
        ball.vh = 0; ball.h = 0; // rolled along the ground
        emit('kickoff', { team: K, half: M.half });
      }
    }
    function scored(T, end) {
      T.score++;
      const own = !M.lastP || M.lastP.team !== T;
      M.scorer = own ? T.players[4] : M.lastP; // an own goal: the forward celebrates anyway
      M.goalTeam = T; M.kick = 1 - T.i; M.placed = false;
      M.phase = 'goal'; M.pt = 0; M.passTo = null;
      ball.inNet = end; ball.holder = null;
      const S = M.scorer;
      M.cel = { u: end * (GL - 1.5), l: S.l < MID ? TL0 + 1 : TL1 - 1 }; // off to the corner flag
      whistle('goal');
      emit('goal', { team: T, own, score: [teams[0].score, teams[1].score], clock: M.clock, half: M.half });
    }
    function goal() {
      const T = M.goalTeam, S = M.scorer, c = M.cel;
      const k = Math.min(1, M.pt / 2.5);
      teams.forEach((U) => U.players.forEach((p, i) => {
        if (U === T) {
          p.anim = 'cheer';
          if (p === S) setT(p, c.u, c.l, SPRINT);
          else if (p.role === 'gk') setT(p, p.u, p.l, 0); // jumps up and down in their goal
          else { const a = i * 1.3; setT(p, S.u + Math.cos(a) * 1.1 * k + (c.u - S.u) * 0.2, S.l + Math.sin(a) * 1.1 * k, SPRINT); } // pile on
        } else {
          p.anim = 'sad';
          if (p.role !== 'gk') setT(p, KO[i][0] * U.dir, KO[i][1], WALK);
          else setT(p, p.u, p.l, 0);
        }
      }));
      setT(ref, -2, 13, JOG); ref.look = { u: 0, l: MID };
      if (ref.animT <= 0 && M.pt < 3) { ref.anim = 'point'; ref.animT = 0.1; }
      if (M.pt > 6.5) { M.phase = 'kickoff'; M.pt = 0; all.forEach((p) => { p.anim = 'run'; }); }
    }
    function halfTime() {
      teams.forEach((T) => T.players.forEach((p, k) => {
        setT(p, (T.i ? 1 : -1) * (4.5 + k * 1.5), 32.2 - (k % 2) * 0.9, WALK); p.anim = 'idle'; p.look = { u: 0, l: MID };
      }));
      if (!M.placed && carry(ref, 0, MID)) { M.placed = true; Object.assign(ball, { holder: null, u: 0, l: MID, h: 0, vu: 0, vl: 0, vh: 0 }); }
      if (M.placed) { setT(ref, -2, 14, WALK); ref.look = { u: 0, l: MID }; }
      if (M.pt > 25) {
        teams.forEach((T) => { T.dir = -T.dir; T.players.forEach((p) => { p.look = null; }); });
        M.half = 2; M.kick = 1 - M.first; M.phase = 'kickoff'; M.pt = 0;
        emit('secondHalf', {});
      }
    }
    function fullTime() {
      const w = M.winner;
      teams.forEach((T) => T.players.forEach((p, k) => {
        if (w === T) { // the winners in a ring in the centre circle, jumping
          const a = (k / 6) * Math.PI * 2;
          setT(p, Math.cos(a) * 2, MID + Math.sin(a) * 2, RUN); p.anim = 'cheer'; p.look = { u: 0, l: MID };
        } else {
          setT(p, (T.i ? 1 : -1) * (4.5 + k * 1.5), 32.2 - (k % 2) * 0.9, WALK); p.anim = w ? 'sad' : 'clap'; p.look = { u: 0, l: MID };
        }
      }));
      if (!M.placed && carry(ref, 0, MID - 4)) { M.placed = true; Object.assign(ball, { holder: null, u: 0, l: MID - 4, h: 0, vu: 0, vl: 0, vh: 0 }); }
      if (M.pt > 30) newMatch();
    }
    function newMatch() {
      teams.forEach((T) => { T.score = 0; T.dir = T.i ? -1 : 1; });
      M.n++; M.first = M.kick = (M.n + 1) % 2; M.half = 1; M.clock = 0; M.started = false; M.winner = null;
      M.phase = 'kickoff'; M.pt = 0; M.placed = false; M.last = null; M.lastP = null;
      everyone.forEach((p) => { p.look = null; p.anim = 'run'; });
      emit('newMatch', { n: M.n });
    }
    function checkClock() {
      if (M.phase !== 'play') return;
      if (M.half === 1 && M.clock >= HALF) {
        M.phase = 'half'; M.pt = 0; M.placed = false; ball.holder = null; M.clock = HALF;
        whistle('half');
        emit('half', { score: [teams[0].score, teams[1].score] });
      } else if (M.half === 2 && M.clock >= HALF * 2) {
        M.phase = 'full'; M.pt = 0; M.placed = false; ball.holder = null; M.clock = HALF * 2;
        const [a, b] = teams;
        M.winner = a.score > b.score ? a : b.score > a.score ? b : null;
        whistle('full');
        emit('full', { winner: M.winner, score: [a.score, b.score] });
      }
    }
    const PHASES = { play, restart, kickoff, goal, half: halfTime, full: fullTime };

    // ---------- moving ----------
    function steer(p, h) {
      const du = p.tu - p.u, dl = p.tl - p.l, d = Math.hypot(du, dl);
      const want = d < 0.12 ? 0 : Math.min(p.ts, d * 2.4);
      let wu = d > 1e-6 ? (du / d) * want : 0, wl = d > 1e-6 ? (dl / d) * want : 0;
      for (const q of everyone) { // don't run into each other
        if (q === p) continue;
        const eu = p.u - q.u, el = p.l - q.l, e2 = eu * eu + el * el;
        if (e2 < 1.1 && e2 > 1e-6) { const e = Math.sqrt(e2), k = (1.05 - e) * 3; wu += (eu / e) * k; wl += (el / e) * k; }
      }
      const acc = 10 * h;
      let au = wu - p.vu, al = wl - p.vl;
      const a = Math.hypot(au, al);
      if (a > acc) { au *= acc / a; al *= acc / a; }
      p.vu += au; p.vl += al;
      p.u = clamp(p.u + p.vu * h, -30.4, 30.4); p.l = clamp(p.l + p.vl * h, 8, 34);
      const sp = Math.hypot(p.vu, p.vl);
      const look = p.look || ball;
      const face = sp > 0.6 ? Math.atan2(p.vl, p.vu) : Math.atan2(look.l - p.l, look.u - p.u);
      p.head += clamp(wrap(face - p.head), -9 * h, 9 * h);
      if (sp > 0.12) p.ph += h * (4.6 + 1.3 * sp);
      p.amp += (clamp(sp / 5.2, 0, 1) - p.amp) * Math.min(1, h * 8);
    }
    function lines(pu) {
      const b = ball;
      if (Math.abs(b.u) > GL && Math.abs(pu) <= GL) {
        const end = Math.sign(b.u), att = teams[0].dir === end ? teams[0] : teams[1], def = other(att);
        const off = Math.abs(b.l - MID);
        if (off < GW - BR && b.h < GH - BR) return scored(att, end);
        if (off < GW + BR && b.h < GH + BR) { // off the post or the bar
          b.u = pu; b.vu = -b.vu * 0.55; b.vl += (rand() - 0.5) * 3;
          if (b.h > GH - BR - 0.1) b.vh = -Math.abs(b.vh) * 0.5;
          emit('post', { team: att });
          return;
        }
        if ((M.last || def) === def) out('corner', att, end * (GL - 0.4), b.l < MID ? TL0 + 0.4 : TL1 - 0.4);
        else out('goalkick', def, (-GL + 2.5) * def.dir, MID + (rand() - 0.5) * 3);
        return;
      }
      if (b.l < TL0 - BR || b.l > TL1 + BR) out('throw', other(M.last || teams[0]), clamp(b.u, -GL + 1, GL - 1), b.l < MID ? TL0 - 0.35 : TL1 + 0.35);
    }
    function ballStep(h) {
      const b = ball;
      if (b.holder) {
        const p = b.holder;
        b.u = p.u + Math.cos(p.head) * 0.3; b.l = p.l + Math.sin(p.head) * 0.3;
        b.h = p.anim === 'throw' ? 1.5 : 0.78; b.vu = p.vu; b.vl = p.vl; b.vh = 0;
        return;
      }
      if (b.h > 0 || b.vh > 0) {
        b.vh -= 9.81 * h; b.h += b.vh * h;
        if (b.h <= 0) { b.h = 0; if (b.vh < -1.4) { b.vh *= -0.5; b.vu *= 0.82; b.vl *= 0.82; } else b.vh = 0; }
      }
      const sp = Math.hypot(b.vu, b.vl);
      if (sp > 1e-4) {
        let ns = b.h > 0.01 ? sp * (1 - 0.03 * h) : Math.max(0, sp - (0.7 + 0.32 * sp) * h);
        if (M.phase === 'restart' && (b.l < TL0 || b.l > TL1 || Math.abs(b.u) > GL)) ns = Math.max(0, ns * (1 - 3 * h) - 6 * h); // the pupils along the side stop it
        b.vu *= ns / sp; b.vl *= ns / sp;
      }
      const pu = b.u;
      b.u += b.vu * h; b.l += b.vl * h;
      if (b.inNet) { // caught by the net
        const e = b.inNet;
        if (e * b.u > GL + 0.95) { b.u = e * (GL + 0.95); b.vu *= -0.12; b.vl *= 0.5; }
        if (e * b.u < GL + 0.05) { b.u = e * (GL + 0.05); b.vu = 0; }
        if (Math.abs(b.l - MID) > GW - BR) { b.l = MID + Math.sign(b.l - MID) * (GW - BR); b.vl *= -0.3; }
        if (b.h > GH - BR) { b.h = GH - BR; b.vh = Math.min(0, b.vh); }
        return;
      }
      if (M.phase === 'play') lines(pu);
      // the railings by the road, the school, the railings at the ends: the ball comes back off them
      if (b.l < 7.7) { b.l = 7.7; b.vl = Math.abs(b.vl) * 0.35; }
      if (b.l > 34.4) { b.l = 34.4; b.vl = -Math.abs(b.vl) * 0.35; }
      if (Math.abs(b.u) > 30.6) { b.u = Math.sign(b.u) * 30.6; b.vu = -b.vu * 0.35; }
    }

    function step(h) {
      M.pt += h;
      if (M.started && M.phase !== 'half' && M.phase !== 'full') M.clock += h;
      for (const p of everyone) { p.cd -= h; p.kickT = Math.max(0, p.kickT - h); p.animT -= h; }
      if (ref.animT <= 0) ref.anim = 'run';
      PHASES[M.phase](h);
      for (const p of everyone) steer(p, h);
      ballStep(h);
      if (M.phase === 'play') touches();
      checkClock();
    }
    // dt in seconds; even sub-steps of about 1/60 s
    function update(dt) {
      dt = clamp(dt, 0, 0.25);
      const n = Math.ceil(dt * 60 - 0.01);
      for (let i = 0; i < n; i++) step(dt / n);
    }
    return { M, teams, all, everyone, ref, ball, update, step };
  }

  // ======================= on the pitch: players, ball, goals, lights, board, the TV camera =======================
  function buildFootball(ctx, school) {
    const { track, scene, crowd, W, std } = ctx;
    const { col, canvasTex, bake } = NR.world;
    const { s: S, side } = school.pitch;
    const sim = createMatch();
    const M = sim.M;
    const fr = track.newFrame();
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
    // a point on the pitch (on the surface), and the world facing of a heading there; at() leaves fr at that point
    const at = (u, l, out) => { track.frame(S + u, side * (W + l), fr); return (out || tmp).set(fr.pos.x, NR.groundY(fr.pos.x, fr.pos.z) + 0.07, fr.pos.z); };
    const yawOf = (cu, cl) => Math.atan2(fr.fwd.x * cu + side * fr.side.x * cl, fr.fwd.z * cu + side * fr.side.z * cl);
    const yawAt = (u, l, head) => { at(u, l); return yawOf(Math.cos(head), Math.sin(head)); };
    const shade = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
    const mesh = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m; };
    const centre = at(0, MID).clone();

    // ---------- the players and the referee: a crowd area of their own, posed by the match ----------
    const A = crowd.newArea('Parkroyal match', { match: true, pad: 8 });
    sim.everyone.forEach((p) => {
      const T = p.team;
      const o = p.role === 'ref'
        ? { scale: 0.95, prop: null, hw: ['hair'], cols: { top: '#16181b', sleeve: '#16181b', thigh: '#16181b', shin: '#16181b' } }
        : { scale: 0.72 + Math.random() * 0.12, prop: null, hw: ['hair', 'hairLong'], cols: Object.assign({}, p.role === 'gk' ? T.info.keeper : T.info.kit) };
      p.person = crowd.addPerson(A, at(p.u, p.l).clone(), yawAt(p.u, p.l, p.head), 'stand', o);
      p.person.run = { ph: 0, amp: 0, lean: 0.03, foot: p.foot, kick: 0, knee: 0 };
    });

    // ---------- the ball ----------
    const ballTex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#16181b';
      [[0.1, 0.5], [0.35, 0.18], [0.35, 0.82], [0.6, 0.5], [0.85, 0.18], [0.85, 0.82]].forEach(([x, y]) => {
        g.beginPath();
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; g.lineTo(x * w + Math.cos(a) * 15, y * h + Math.sin(a) * 15); }
        g.fill();
      });
    });
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BR, 16, 12), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }));
    ballMesh.castShadow = true;
    scene.add(ballMesh);
    const roll = new THREE.Quaternion(), axis = new THREE.Vector3(), lastBall = new THREE.Vector3();

    // ---------- goals: white frames with nets ----------
    const netTex = canvasTex(32, 32, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); }, true);
    const netMat = new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
    const postMat = std('#f4f4f0', { roughness: 0.4, metalness: 0.2 });
    const netPlane = (w, h) => { const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.14, uv.getY(i) * h / 0.14); return g; };
    const DEPTH = 1.1;
    [-1, 1].forEach((end) => {
      const g = new THREE.Group();
      g.position.copy(at(end * GL, MID));
      g.rotation.y = yawOf(end, 0); // local +z points out behind the goal
      const post = new THREE.CylinderGeometry(0.05, 0.05, GH, 8);
      [-1, 1].forEach((sd) => {
        mesh(post, postMat, g, sd * GW, GH / 2, 0);
        mesh(new THREE.CylinderGeometry(0.03, 0.03, GH, 6), postMat, g, sd * GW, GH / 2, DEPTH); // back posts
        const top = mesh(new THREE.CylinderGeometry(0.03, 0.03, DEPTH, 6), postMat, g, sd * GW, GH, DEPTH / 2); top.rotation.x = Math.PI / 2;
        const net = mesh(netPlane(DEPTH, GH), netMat, g, sd * GW, GH / 2, DEPTH / 2); net.rotation.y = Math.PI / 2;
      });
      const bar = mesh(new THREE.CylinderGeometry(0.05, 0.05, GW * 2 + 0.1, 8), postMat, g, 0, GH, 0); bar.rotation.z = Math.PI / 2;
      const back = mesh(new THREE.CylinderGeometry(0.03, 0.03, GW * 2, 6), postMat, g, 0, GH, DEPTH); back.rotation.z = Math.PI / 2;
      mesh(netPlane(GW * 2, GH), netMat, g, 0, GH / 2, DEPTH);
      const roof = mesh(netPlane(GW * 2, DEPTH), netMat, g, 0, GH, DEPTH / 2); roof.rotation.x = Math.PI / 2;
      scene.add(bake(shade(g)));
    });

    // ---------- floodlights: four masts, and one light over the pitch at night ----------
    const glowTex = canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.3, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,235,190,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const lampMat = new THREE.MeshStandardMaterial({ color: col('#d9dde2'), emissive: col('#fff3d6'), emissiveIntensity: 0, roughness: 0.3 });
    const mastMat = std('#8a9198', { metalness: 0.6, roughness: 0.4 });
    const glows = [];
    const masts = new THREE.Group();
    [[-32.4, 8.6], [32.4, 8.6], [-32.4, 33.2], [32.4, 33.2]].forEach(([u, l]) => {
      const p = at(u, l).clone(), H = 13;
      mesh(new THREE.CylinderGeometry(0.11, 0.17, H, 8), mastMat, masts, p.x, p.y + H / 2, p.z);
      const head = mesh(new THREE.BoxGeometry(1.7, 0.85, 0.3), mastMat, masts, p.x, p.y + H + 0.3, p.z);
      head.rotation.y = yawOf(-u, MID - l); head.rotateX(0.5); // turned to the middle of the pitch, tipped down
      head.updateMatrix();
      const face = mesh(new THREE.PlaneGeometry(1.5, 0.7), lampMat, masts, 0, 0, 0.16);
      face.applyMatrix4(head.matrix);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
      sp.position.copy(head.position); sp.scale.set(4.5, 4.5, 1); sp.visible = false;
      scene.add(sp); glows.push(sp);
    });
    scene.add(bake(shade(masts)));
    const flood = new THREE.PointLight(col('#fff1d6'), 0, 70, 1);
    flood.position.copy(centre).y += 17;
    scene.add(flood);

    // ---------- the TV tower behind the far touchline, by the school ----------
    const DECK = 8.2, TOWER_L = 35.4;
    const tower = new THREE.Group();
    tower.position.copy(at(0, TOWER_L));
    tower.rotation.y = yawOf(0, -1); // local +z looks across the pitch to the road
    const scaff = std('#9aa1a8', { metalness: 0.6, roughness: 0.45 });
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => mesh(new THREE.CylinderGeometry(0.05, 0.05, DECK + 1.1, 6), scaff, tower, a * 0.95, (DECK + 1.1) / 2 - 0.3, b * 0.95)));
    for (let y = 1.8; y < DECK; y += 1.8) [-1, 1].forEach((a) => { // braces
      mesh(new THREE.BoxGeometry(1.9, 0.05, 0.05), scaff, tower, 0, y, a * 0.95);
      mesh(new THREE.BoxGeometry(0.05, 0.05, 1.9), scaff, tower, a * 0.95, y, 0);
    });
    mesh(new THREE.BoxGeometry(2.3, 0.12, 2.3), std('#5b6168', { roughness: 0.8 }), tower, 0, DECK, 0);
    mesh(new THREE.BoxGeometry(2.0, 0.05, 0.05), scaff, tower, 0, DECK + 0.9, -0.95); // rails behind and at the sides
    [-1, 1].forEach((a) => mesh(new THREE.BoxGeometry(0.05, 0.05, 1.9), scaff, tower, a * 0.95, DECK + 0.9, 0));
    mesh(new THREE.BoxGeometry(2.0, 0.05, 0.05), scaff, tower, 0, DECK + 0.45, 0.95); // a low one in front
    const camBody = std('#2a2e33', { roughness: 0.5, metalness: 0.3 });
    mesh(new THREE.BoxGeometry(0.34, 0.36, 0.62), camBody, tower, 0, DECK + 1.32, 0.35);
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.42, 10), camBody, tower, 0, DECK + 1.34, 0.86).rotation.x = Math.PI / 2;
    [0, 2.1, 4.2].forEach((a) => { const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5), camBody, tower, Math.sin(a) * 0.25, DECK + 0.6, 0.35 + Math.cos(a) * 0.25); leg.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25); });
    scene.add(bake(shade(tower)));
    tower.updateMatrixWorld(true);
    const towerEye = tower.localToWorld(new THREE.Vector3(0, DECK + 1.5, 1.25));
    // the camera operator, behind the camera
    crowd.addPerson(school.area, tower.localToWorld(new THREE.Vector3(0, DECK + 0.06, -0.2)), tower.rotation.y, 'stand',
      { prop: null, hw: ['cap'], noStand: true, cols: { top: '#2b3a55', bottom: '#2d2f35', hw: '#16181b' } });
    ctx.clear(towerEye.x, towerEye.z, 6);

    // ---------- the giant scoreboard, with the live screen under it, past the end of the pitch ----------
    const BW = 14, SCORE_H = BW / 3.2, SCREEN_H = (BW * 9) / 16, LEGS = 2.6;
    const board = new THREE.Group();
    const bPos = at(42, 22).clone(), look = at(0, 14).clone(); // it faces back up the pitch, turned a little to the road
    board.rotation.y = Math.atan2(look.x - bPos.x, look.z - bPos.z);
    let gLo = 1e9, gHi = -1e9;
    const LEG_X = BW * 0.33;
    [-1, 1].forEach((sd) => {
      const p = new THREE.Vector3(sd * LEG_X, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), board.rotation.y).add(bPos);
      const y = NR.groundY(p.x, p.z); gLo = Math.min(gLo, y); gHi = Math.max(gHi, y);
    });
    board.position.set(bPos.x, gHi, bPos.z);
    const frameH = SCORE_H + SCREEN_H + 0.85, frameY = LEGS + frameH / 2;
    const steel = std('#2c3138', { roughness: 0.6, metalness: 0.4 });
    mesh(new THREE.BoxGeometry(BW + 0.6, frameH, 0.6), steel, board, 0, frameY, -0.32);
    mesh(new THREE.BoxGeometry(BW + 0.9, 0.3, 1.0), steel, board, 0, LEGS + frameH + 0.15, -0.2);
    [-1, 1].forEach((sd) => mesh(new THREE.BoxGeometry(0.7, LEGS + (gHi - gLo) + 1, 0.7), steel, board, sd * LEG_X, (LEGS - (gHi - gLo) - 1) / 2, -0.32));
    const screenY = LEGS + 0.3 + SCREEN_H / 2, scoreY = LEGS + 0.3 + SCREEN_H + 0.25 + SCORE_H / 2;
    scene.add(bake(shade(board)));

    // the scoreboard: who's winning and who's losing, the score, the clock
    const scoreCanvas = document.createElement('canvas');
    scoreCanvas.width = 1024; scoreCanvas.height = 320;
    const scoreTex = new THREE.CanvasTexture(scoreCanvas);
    scoreTex.encoding = THREE.sRGBEncoding; scoreTex.anisotropy = 8;
    const scorePlane = new THREE.Mesh(new THREE.PlaneGeometry(BW, SCORE_H), new THREE.MeshBasicMaterial({ map: scoreTex, toneMapped: false }));
    scorePlane.position.set(0, scoreY, 0.0);
    board.add(scorePlane);
    // the live screen, fed by the TV camera
    const rt = new THREE.WebGLRenderTarget(640, 360, { encoding: THREE.sRGBEncoding, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    rt.texture.generateMipmaps = false;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(BW, SCREEN_H), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false }));
    screen.position.set(0, screenY, 0.0);
    board.add(screen);
    const liveTex = canvasTex(512, 96, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#e5322d'; g.fillRect(0, 0, 150, h);
      g.fillStyle = 'rgba(10, 14, 19, 0.85)'; g.fillRect(150, 0, w - 150, h);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(30, h / 2, 11, 0, Math.PI * 2); g.fill();
      g.textBaseline = 'middle'; g.font = `800 52px ${FONT}`; g.fillText('LIVE', 50, h / 2 + 3);
      g.font = `700 46px ${FONT}`; g.fillText('PARKROYAL TV', 172, h / 2 + 3, w - 190);
    });
    const live = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.64), new THREE.MeshBasicMaterial({ map: liveTex, transparent: true, toneMapped: false }));
    live.position.set(-BW / 2 + 2.05, screenY + SCREEN_H / 2 - 0.55, 0.03);
    board.add(live);
    board.updateMatrixWorld(true);
    const screenSphere = new THREE.Sphere(board.localToWorld(new THREE.Vector3(0, screenY, 0)), BW * 0.6);
    ctx.clear(bPos.x, bPos.z, 14);

    const STATE = { win: ['WINNING', '#3ecf6e'], lose: ['LOSING', '#ff5247'], draw: ['DRAWING', '#ffd23f'], won: ['WON', '#3ecf6e'], lost: ['LOST', '#ff5247'], drew: ['DRAW', '#ffd23f'] };
    const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`;
    function standing() { // what each side is doing: winning, losing, drawing (or, at the end, won, lost, drew)
      const [a, b] = sim.teams, end = M.phase === 'full';
      if (a.score === b.score) return end ? ['drew', 'drew'] : ['draw', 'draw'];
      const aw = a.score > b.score;
      return end ? (aw ? ['won', 'lost'] : ['lost', 'won']) : (aw ? ['win', 'lose'] : ['lose', 'win']);
    }
    function clockText() {
      if (M.phase === 'half') return 'HALF TIME';
      if (M.phase === 'full') return 'FULL TIME';
      if (!M.started) return 'KICK-OFF SOON';
      return `${M.half === 1 ? '1ST' : '2ND'} HALF  ·  ${mmss(M.clock)}`;
    }
    let boardKey = '';
    function drawBoard(now) {
      const flash = M.phase === 'goal' && M.pt < 5.5 ? Math.floor(now * 2.5) % 2 : -1;
      const st = standing(), clk = clockText();
      const key = `${sim.teams[0].score}|${sim.teams[1].score}|${st}|${clk}|${flash}`;
      if (key === boardKey) return;
      boardKey = key;
      const g = scoreCanvas.getContext('2d'), w = 1024, h = 320;
      g.fillStyle = '#07090d'; g.fillRect(0, 0, w, h);
      g.textBaseline = 'middle';
      if (flash === 1) { // GOAL! in the scorers' colours
        const T = M.goalTeam.info;
        g.fillStyle = T.col; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff'; g.textAlign = 'center';
        g.font = `800 170px ${FONT}`; g.fillText('GOAL!', w / 2, 130);
        g.font = `800 58px ${FONT}`; g.fillText(T.long, w / 2, 262, w - 80);
      } else {
        g.fillStyle = '#121820'; g.fillRect(0, 0, w, 58);
        g.textAlign = 'center'; g.fillStyle = '#c9d2da'; g.font = `700 32px ${FONT}`;
        g.fillText('PARKROYAL  v  TYTHERINGTON  ·  MACCLESFIELD', w / 2, 31, w - 60);
        sim.teams.forEach((T, i) => { // Parkroyal on the left, Tytherington on the right
          const left = i === 0, x = left ? 50 : w - 50;
          g.fillStyle = T.info.col; g.fillRect(left ? 18 : w - 34, 76, 16, 220);
          g.textAlign = left ? 'left' : 'right';
          g.fillStyle = '#ffffff'; g.font = `800 60px ${FONT}`; g.fillText(T.info.long, x, 128, 330);
          const [word, c] = STATE[st[i]];
          g.fillStyle = c; g.font = `800 50px ${FONT}`; g.fillText(word, x, 210, 330);
        });
        g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.font = `800 150px ${FONT}`;
        g.textAlign = 'right'; g.fillText(String(sim.teams[0].score), w / 2 - 34, 172);
        g.textAlign = 'center'; g.fillText('–', w / 2, 166);
        g.textAlign = 'left'; g.fillText(String(sim.teams[1].score), w / 2 + 34, 172);
        g.textAlign = 'center'; g.fillStyle = '#eef2f5'; g.font = `700 40px ${FONT}`; g.fillText(clk, w / 2, 282, 380);
      }
      g.fillStyle = 'rgba(0, 0, 0, 0.28)'; // LED rows
      for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
      scoreTex.needsUpdate = true;
    }

    // ---------- the TV director: the wide shot from the tower, close-ups after a goal and at the end ----------
    const tv = { pos: new THREE.Vector3().copy(towerEye), look: centre.clone(), fov: 40, lu: 0, ll: MID, cu: 0, cl: MID, shot: 'wide', cut: true, zoom: 1, t: 0 };
    const focus = centre.clone();
    function direct(dt) {
      const b = sim.ball;
      let shot = 'wide', su = b.u, sl = MID + (b.l - MID) * 0.7;
      if (M.phase === 'goal' && M.pt > 0.9 && M.pt < 5.8) { shot = 'close'; su = M.scorer.u; sl = M.scorer.l; }
      else if (M.phase === 'full' && M.winner && M.pt > 3 && M.pt < 18) { shot = 'close'; su = 0; sl = MID; }
      if (shot !== tv.shot) { tv.shot = shot; tv.cut = true; }
      const k = tv.cut ? 1 : 1 - Math.exp(-dt * (shot === 'close' ? 4 : 2.4));
      tv.lu += (su - tv.lu) * k; tv.ll += (sl - tv.ll) * k;
      at(tv.lu, tv.ll, tv.look); tv.look.y += shot === 'close' ? 0.85 : 0.45;
      if (shot === 'wide') {
        tv.pos.copy(towerEye);
        tv.fov = clamp((2 * Math.atan(8.5 / tv.pos.distanceTo(tv.look)) * 180) / Math.PI, 24, 56); // about 17 m of pitch top to bottom
      } else {
        // a goal: just off the pitch by the corner flag the scorer runs to, looking back at them coming;
        // full time: in the middle, a few metres from the winners' ring
        const goalCam = M.phase === 'goal', end = goalCam ? Math.sign(M.cel.u) : 1, low = M.cel && M.cel.l < MID;
        const cu = goalCam ? end * (GL + 2.2) : 5.5, cl = goalCam ? (low ? TL0 - 1.8 : TL1 + 1.8) : MID + 4;
        tv.cu += (cu - tv.cu) * k; tv.cl += (cl - tv.cl) * k;
        at(tv.cu, tv.cl, tv.pos); tv.pos.y += 2.6;
        tv.fov = 40;
      }
      tv.fov *= tv.zoom;
      tv.cut = false;
      at(tv.lu, tv.ll, focus);
    }
    const tvCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 9000); // (the sky dome rides with the main camera: see all of it)
    function aim(cam, t, shake) {
      cam.position.copy(tv.pos);
      if (tv.shot === 'close') { cam.position.y += Math.sin(t * 1.1) * 0.04 * shake; cam.position.x += Math.sin(t * 0.7) * 0.05 * shake; }
      cam.lookAt(tv.look);
      // a narrow (upright) view keeps the width of the 16:9 shot
      const a = cam.aspect || 16 / 9, fov = tv.fov;
      cam.fov = a >= 16 / 9 ? fov : Math.min(80, (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9) / a) * 180) / Math.PI);
      cam.updateProjectionMatrix();
    }

    // ---------- posing the players ----------
    const ARMS = new Float32Array(6);
    const setArms = (a, b, c, d, e, f) => { ARMS[0] = a; ARMS[1] = b; ARMS[2] = c; ARMS[3] = d; ARMS[4] = e; ARMS[5] = f; };
    const ballW = new THREE.Vector3();
    let visible = true;
    function pose(t, dt) {
      const kH = 1 - Math.exp(-dt * 8);
      for (const p of sim.everyone) {
        const q = p.person, r = q.run;
        const pos = at(p.u, p.l, tmp2);
        q.up.set(pos.x, pos.y + 0.93 * q.s, pos.z); q.x = pos.x; q.z = pos.z;
        q.yaw = yawOf(Math.cos(p.head), Math.sin(p.head));
        r.ph = p.ph; r.amp = p.amp; r.lean = 0.03 + p.amp * 0.24;
        // a kick: wind the leg back, swing it through, follow through
        if (p.kickT > 0) {
          const k = 1 - p.kickT / KICK, pw = p.kpow;
          r.kick = (k < 0.35 ? -0.7 * (k / 0.35) : k < 0.7 ? -0.7 + 2.0 * ((k - 0.35) / 0.35) : 1.3 * (1 - (k - 0.7) / 0.3)) * pw;
          r.knee = (k < 0.35 ? 1.3 * (k / 0.35) : k < 0.6 ? 1.3 * (1 - (k - 0.35) / 0.25) : 0.15) * pw;
        } else r.kick = 0;
        const sw = Math.sin(p.ph) * p.amp;
        let jump = p.amp * 0.045 * Math.abs(Math.sin(p.ph)), lookDown = 0;
        switch (p.anim) {
          case 'cheer': { const w = 0.22 * Math.sin(t * 8.5 + q.ph); setArms(2.75 + w, 0.35, 0, 2.75 - w, 0.35, 0); if (p.amp < 0.3) jump = Math.max(0, Math.sin(t * 7.5 + q.ph)) * 0.13; break; }
          case 'clap': { const w = 0.3 + 0.14 * (1 + Math.sin(t * 14 + q.ph)); setArms(1.2, 0, w, 1.2, 0, w); break; }
          case 'hold': setArms(1.25, 0, 0.42, 1.25, 0, 0.42); break;
          case 'throw': setArms(2.95, 0.05, 0.28, 2.95, 0.05, 0.28); break;
          case 'sad': setArms(-0.3, 0.05, 0.25, -0.3, 0.05, 0.25); lookDown = 0.45; break;
          case 'idle': setArms(0.06, 0.08, 0, 0.06, 0.08, 0); break;
          case 'whistle': setArms(2.5, 0.25, 0, 0.1 - sw, 0.12, 0); break;
          case 'point': setArms(1.55, 0.1, 0, 0.1, 0.12, 0); break;
          default: { // running: arms swing against the legs; a keeper gets ready when the ball comes near
            const near = p.role === 'gk' && Math.hypot(sim.ball.u - p.u, sim.ball.l - p.l) < 12 ? 0.45 : 0;
            setArms(0.12 + sw * 1.1 + near, 0.12 + near, 0, 0.12 - sw * 1.1 + near, 0.12 + near, 0);
          }
        }
        const kA = p.anim === 'run' ? 1 : Math.min(1, kH * 1.5); // running arms keep time with the legs; the rest ease in
        for (let j = 0; j < 6; j++) q.arms[j] += (ARMS[j] - q.arms[j]) * kA;
        // the head follows the ball (or whatever they're looking at)
        const lk = p.look ? at(p.look.u, p.look.l, tmp) : ballW;
        const rel = wrap(Math.atan2(lk.x - pos.x, lk.z - pos.z) - q.yaw);
        const tw = clamp(rel * 0.3, -0.4, 0.4), hy = clamp(rel - tw, -1.15, 1.15);
        const hd = Math.hypot(lk.x - pos.x, lk.z - pos.z);
        const hp = lookDown || clamp(Math.atan2(0.95 * q.s - (p.look ? 0.9 : sim.ball.h), Math.max(1, hd)), -0.3, 0.55);
        q.hy += (hy - q.hy) * kH; q.tw += (tw - q.tw) * kH; q.hp += (hp - q.hp) * kH;
        crowd.pose(q, t, jump);
      }
      crowd.dirty(A);
    }

    // ---------- every frame ----------
    // dt: seconds (0 when paused); camera: the main camera, for what's worth drawing; nightK 0..1
    function update(dt, t, camera, nightK) {
      sim.update(dt);
      direct(dt);
      const b = sim.ball;
      at(b.u, b.l, ballW); ballW.y += BR + b.h;
      // rolling: turn the ball by the ground it covered
      const moved = tmp.subVectors(ballW, lastBall);
      const len = Math.hypot(moved.x, moved.z);
      if (len > 1e-4 && len < 3 && b.h < 0.05) { axis.set(moved.z, 0, -moved.x).normalize(); roll.setFromAxisAngle(axis, len / BR); ballMesh.quaternion.premultiply(roll); }
      lastBall.copy(ballW);
      ballMesh.position.copy(ballW);
      // only drawn and posed when the camera is near enough to see them
      const near = camera.position.distanceTo(centre) < 650;
      if (near !== visible) { visible = near; for (const k in A.m) A.m[k].visible = near; ballMesh.visible = near; }
      if (near) pose(t, Math.max(dt, 1 / 120));
      if (camera.position.distanceTo(screenSphere.center) < 900) drawBoard(t); // (redrawn when it changes, and only near enough to read)
      // lights after dark
      lampMat.emissiveIntensity = 2.4 * nightK;
      flood.intensity = 1.5 * nightK;
      glows.forEach((g) => { g.visible = nightK > 0.05; g.material.opacity = nightK; });
    }

    // the live screen: the TV camera's picture, drawn into the screen's texture now and then, when it can be seen
    const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
    const EVERY = window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 0.1 : 0.066; // 10 pictures a second on a phone or iPad, 15 otherwise
    let shotT = 0;
    function renderScreen(renderer, scn, camera, now) {
      if (now - shotT < EVERY || camera.position.distanceTo(screenSphere.center) > 520) return;
      camera.updateMatrixWorld();
      pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pv);
      if (!frustum.intersectsSphere(screenSphere)) return;
      shotT = now;
      aim(tvCam, now, 0);
      screen.visible = false; // it can't show itself while it's being drawn into
      const auto = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(rt);
      renderer.render(scn, tvCam);
      renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = auto;
      screen.visible = true;
    }

    return {
      sim, teams: sim.teams, focus, centre,
      update, renderScreen,
      view: (cam, t, shake) => aim(cam, t, shake),
      zoom(k) { tv.zoom = clamp(tv.zoom * k, 0.45, 1.6); },
      set onEvent(f) { M.onEvent = f; },
      pointOf: (u, l) => at(u, l).clone(),
      get clockText() { return clockText(); },
      get standing() { return standing().map((s) => STATE[s][0]); },
    };
  }

  NR.createFootballMatch = createMatch; // (the match on its own, for tests)
  NR.FOOTBALL = { GL, TL0, TL1, MID, GW, GH, HALF, TEAMS };
  NR.buildFootball = buildFootball;
})();
