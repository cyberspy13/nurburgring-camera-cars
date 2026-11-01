// track.js — Nordschleife-inspired layout: spline, sampled frames, speed profile, sections.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});

  const HALF_W = 6.2;   // road half-width (m)
  const STEP = 2;       // target sample spacing (m)
  const V_TOP = 79;     // m/s  (~285 km/h)
  const A_LAT = 17.5;   // m/s² lateral grip incl. aero
  const A_BRAKE = 13.5; // m/s² planning deceleration

  // [x, z, elevation, bank magnitude (rad), section name]
  const PTS = [
    [-900, 420, 10, 0, 'Start / Finish'],
    [-700, 440, 10, 0],
    [-520, 450, 9, 0],
    [-420, 420, 7, 0, 'Hatzenbach'],
    [-350, 470, 5, 0],
    [-270, 420, 3, 0],
    [-190, 470, 2, 0],
    [-110, 430, 4, 0],
    [0, 460, 8, 0, 'Hocheichen'],
    [120, 470, 14, 0, 'Quiddelbacher Höhe'],
    [200, 462, 20, 0],
    [232, 456, 22.5, 0, 'Flugplatz'],
    [262, 450, 19, 0],
    [310, 440, 13, 0],
    [420, 420, 10, 0, 'Schwedenkreuz'],
    [560, 380, 8, 0],
    [660, 300, 6, 0, 'Aremberg'],
    [690, 200, 2, 0],
    [650, 110, -8, 0, 'Fuchsröhre'],
    [630, 30, -16, 0],
    [660, -50, -8, 0],
    [720, -120, -2, 0, 'Adenauer Forst'],
    [690, -200, 0, 0],
    [600, -240, 2, 0, 'Metzgesfeld'],
    [500, -220, 0, 0, 'Kallenhard'],
    [420, -290, -4, 0, 'Wehrseifen'],
    [320, -310, -8, 0, 'Breidscheid'],
    [220, -260, -6, 0, 'Ex-Mühle'],
    [130, -330, 0, 0, 'Bergwerk'],
    [0, -370, 10, 0, 'Kesselchen'],
    [-160, -380, 20, 0],
    [-300, -360, 28, 0, 'Klostertal'],
    [-370, -365, 30, 0.28, 'Karussell'],
    [-410, -390, 31, 0.36],
    [-428, -430, 31, 0.36],
    [-425, -480, 32, 0.12],
    [-420, -540, 40, 0, 'Hohe Acht'],
    [-500, -600, 36, 0, 'Wippermann'],
    [-600, -610, 30, 0, 'Eschbach'],
    [-700, -560, 22, 0, 'Brünnchen'],
    [-735, -512, 26.2, 0],
    [-755, -485, 27.2, 0, 'Pflanzgarten'],
    [-778, -458, 23.5, 0],
    [-805, -432, 19, 0],
    [-840, -410, 17, 0.1, 'Schwalbenschwanz'],
    [-900, -330, 16, 0, 'Galgenkopf'],
    [-950, -230, 14, 0, 'Döttinger Höhe'],
    [-955, 0, 12, 0],
    [-950, 250, 10, 0],
    [-935, 370, 10, 0, 'Tiergarten'],
  ];

  const smooth01 = (t) => t * t * (3 - 2 * t);
  const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function build() {
    const N = PTS.length;
    const ctrl = PTS.map((p) => new THREE.Vector3(p[0], p[2], p[1]));
    const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');

    // Arc-length table over the spline parameter
    const M = 30000;
    const lens = new Float64Array(M + 1);
    const prev = curve.getPoint(0);
    const tmp = new THREE.Vector3();
    let acc = 0;
    for (let k = 1; k <= M; k++) {
      curve.getPoint(k / M, tmp);
      acc += tmp.distanceTo(prev);
      prev.copy(tmp);
      lens[k] = acc;
    }
    const L = acc;
    const NS = Math.round(L / STEP);
    const ds = L / NS;

    const P = new Float32Array(NS * 3);
    const U = new Float32Array(NS); // spline parameter per sample
    let k = 0;
    for (let j = 0; j < NS; j++) {
      const target = j * ds;
      while (k < M && lens[k + 1] < target) k++;
      const seg = lens[k + 1] - lens[k] || 1;
      const u = (k + (target - lens[k]) / seg) / M;
      curve.getPoint(u, tmp);
      P[j * 3] = tmp.x; P[j * 3 + 1] = tmp.y; P[j * 3 + 2] = tmp.z;
      U[j] = u;
    }

    // Tangents, heading, curvature
    const F = new Float32Array(NS * 3);
    const head = new Float32Array(NS);
    for (let j = 0; j < NS; j++) {
      const a = ((j - 1 + NS) % NS) * 3, b = ((j + 1) % NS) * 3;
      let fx = P[b] - P[a], fy = P[b + 1] - P[a + 1], fz = P[b + 2] - P[a + 2];
      const l = Math.hypot(fx, fy, fz) || 1;
      fx /= l; fy /= l; fz /= l;
      F[j * 3] = fx; F[j * 3 + 1] = fy; F[j * 3 + 2] = fz;
      head[j] = Math.atan2(fx, fz);
    }
    const kRaw = new Float32Array(NS);
    for (let j = 0; j < NS; j++) {
      const a = (j - 1 + NS) % NS, b = (j + 1) % NS;
      kRaw[j] = wrapAng(head[b] - head[a]) / (2 * ds);
    }
    const boxSmooth = (src, w) => {
      const out = new Float32Array(NS);
      for (let j = 0; j < NS; j++) {
        let s = 0;
        for (let o = -w; o <= w; o++) s += src[(j + o + NS) % NS];
        out[j] = s / (2 * w + 1);
      }
      return out;
    };
    const kS = boxSmooth(kRaw, 6);   // ±12 m
    const kW = boxSmooth(kRaw, 20);  // ±40 m

    // Named sections
    const sections = [];
    PTS.forEach((p, i) => { if (p[4]) sections.push({ name: p[4], ctrl: i, s: 0 }); });
    const secOf = new Uint8Array(NS);
    const bankMag = new Float32Array(NS);
    const bank = new Float32Array(NS);
    for (let j = 0; j < NS; j++) {
      const c = U[j] * N;
      const i0 = Math.floor(c) % N, f = c - Math.floor(c);
      bankMag[j] = PTS[i0][3] + (PTS[(i0 + 1) % N][3] - PTS[i0][3]) * smooth01(f);
      bank[j] = -bankMag[j] * Math.sign(kW[j]);
      let si = sections.length - 1;
      for (let q = 0; q < sections.length; q++) if (sections[q].ctrl <= Math.floor(c)) si = q;
      secOf[j] = si;
    }
    for (let j = NS - 1; j >= 0; j--) sections[secOf[j]].s = j * ds;

    // Side and up vectors with banking
    const S = new Float32Array(NS * 3), Up = new Float32Array(NS * 3);
    const f3 = new THREE.Vector3(), s0 = new THREE.Vector3(), u0 = new THREE.Vector3();
    const s1 = new THREE.Vector3(), u1 = new THREE.Vector3(), worldUp = new THREE.Vector3(0, 1, 0);
    for (let j = 0; j < NS; j++) {
      f3.set(F[j * 3], F[j * 3 + 1], F[j * 3 + 2]);
      s0.crossVectors(worldUp, f3).normalize();
      u0.crossVectors(f3, s0).normalize();
      const b = bank[j];
      s1.copy(s0).multiplyScalar(Math.cos(b)).addScaledVector(u0, Math.sin(b)).normalize();
      u1.crossVectors(f3, s1).normalize();
      S[j * 3] = s1.x; S[j * 3 + 1] = s1.y; S[j * 3 + 2] = s1.z;
      Up[j * 3] = u1.x; Up[j * 3 + 1] = u1.y; Up[j * 3 + 2] = u1.z;
    }

    // Target speed profile (corner limit + backward braking pass)
    const vProf = new Float32Array(NS);
    for (let j = 0; j < NS; j++) {
      const grip = A_LAT * (1 + 1.6 * bankMag[j]);
      vProf[j] = Math.min(V_TOP, Math.sqrt(grip / Math.max(Math.abs(kS[j]), 1e-5)));
    }
    for (let n = 2 * NS - 1; n >= 0; n--) {
      const j = n % NS, j1 = (j + 1) % NS;
      vProf[j] = Math.min(vProf[j], Math.sqrt(vProf[j1] * vProf[j1] + 2 * A_BRAKE * ds));
    }

    // Racing line: drift to the inside through corners
    const line = new Float32Array(NS);
    for (let j = 0; j < NS; j++) {
      line[j] = Math.max(-(HALF_W - 1.7), Math.min(HALF_W - 1.7, 3.8 * Math.tanh(75 * kW[j])));
    }

    // Spatial hash for nearest-sample lookups (terrain, scenery placement)
    const CELL = 36;
    const grid = new Map();
    const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
    for (let j = 0; j < NS; j++) {
      const kk = key(Math.floor(P[j * 3] / CELL), Math.floor(P[j * 3 + 2] / CELL));
      let arr = grid.get(kk);
      if (!arr) grid.set(kk, (arr = []));
      arr.push(j);
    }
    // Returns {d, j, lat, surfY} for the nearest sample within ~72 m, else null.
    const nearRes = { d: 0, j: 0, lat: 0, surfY: 0 };
    function nearest(x, z) {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      let best = Infinity, bj = -1;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const arr = grid.get(key(cx + a, cz + b));
        if (!arr) continue;
        for (let q = 0; q < arr.length; q++) {
          const j = arr[q], dx = x - P[j * 3], dz = z - P[j * 3 + 2];
          const d2 = dx * dx + dz * dz;
          if (d2 < best) { best = d2; bj = j; }
        }
      }
      if (bj < 0) return null;
      const sx = S[bj * 3], sy = S[bj * 3 + 1], sz = S[bj * 3 + 2];
      const h = Math.hypot(sx, sz) || 1;
      const lat = ((x - P[bj * 3]) * sx + (z - P[bj * 3 + 2]) * sz) / h;
      const lc = Math.max(-HALF_W, Math.min(HALF_W, lat));
      nearRes.d = Math.sqrt(best); nearRes.j = bj; nearRes.lat = lat;
      nearRes.surfY = P[bj * 3 + 1] + lc * (sy / h);
      return nearRes;
    }

    // Interpolated frame at distance s and lateral offset lat
    function frame(s, lat, out) {
      s = ((s % L) + L) % L;
      const x = s / ds, j = Math.floor(x) % NS, t = x - Math.floor(x), j1 = (j + 1) % NS;
      const lp = (arr, o) => arr[j * 3 + o] + (arr[j1 * 3 + o] - arr[j * 3 + o]) * t;
      out.fwd.set(lp(F, 0), lp(F, 1), lp(F, 2)).normalize();
      out.side.set(lp(S, 0), lp(S, 1), lp(S, 2)).normalize();
      out.up.set(lp(Up, 0), lp(Up, 1), lp(Up, 2)).normalize();
      out.pos.set(lp(P, 0), lp(P, 1), lp(P, 2)).addScaledVector(out.side, lat || 0);
      out.j = j; out.t = t;
      return out;
    }
    const newFrame = () => ({
      pos: new THREE.Vector3(), fwd: new THREE.Vector3(), side: new THREE.Vector3(),
      up: new THREE.Vector3(), j: 0, t: 0,
    });
    const lerpArr = (arr, s) => {
      s = ((s % L) + L) % L;
      const x = s / ds, j = Math.floor(x) % NS, t = x - Math.floor(x);
      return arr[j] + (arr[(j + 1) % NS] - arr[j]) * t;
    };
    const sOf = (name) => (sections.find((q) => q.name === name) || sections[0]).s;

    // The start/finish line, and the pit lane on the inside (+lat) of the straight. Pit distances `d` are
    // measured from the line; lats from the road's centre. The entry road leaves the track at the exit of
    // the last corner, the 60 km/h lane runs past thirteen boxes (one per car, in entry order) behind the pit
    // wall, and the exit road rejoins before Hatzenbach.
    const S_FINISH = sOf('Start / Finish') + 120;
    const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    const PIT = {
      entry: -170, laneIn: -90, laneOut: 150, exit: 232, // entry road / speed limit on / speed limit off / back on the track
      wall: HALF_W + 4.8, fast: HALF_W + 8.4, box: HALF_W + 13.4, garage: HALF_W + 17.5, half: 3, // lats; `half`: half a lane's width
      boxes: Array.from({ length: 12 }, (_, i) => -48 + i * 13).concat(114), // the last, longer box is the bus's
      limit: 16.7, // m/s
      // the centre of a car's path through the pits at distance d
      path(d) {
        const on = HALF_W - 1.6;
        if (d < PIT.entry || d > PIT.exit) return on;
        if (d < PIT.laneIn) return on + (PIT.fast - on) * sm((d - PIT.entry) / (PIT.laneIn - PIT.entry));
        if (d > PIT.laneOut) return PIT.fast + (on - PIT.fast) * sm((d - PIT.laneOut) / (PIT.exit - PIT.laneOut));
        return PIT.fast;
      },
    };

    return {
      HALF_W, L, NS, ds, P, F, S, Up, kS, kW, bank, bankMag, vProf, line, secOf,
      sections, nearest, frame, newFrame, lerpArr, sOf, ctrl: PTS, S_FINISH, PIT,
    };
  }

  NR.buildTrack = build;
})();
