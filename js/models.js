// models.js — the 3D models: GT3 cars, the guest bus and the cabin interior.
// A GT3 body is lofted from cross-sections along its length: every model has its own side profile,
// plan shape and flared wheel arches, with a second loft for the glasshouse on top. The livery and
// window graphics are painted on canvases; grilles, intakes and lights are decals projected onto the
// nose and tail. Liveries are team colour schemes only, with no manufacturer logos.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sq = (x) => x * x;

  const WHEEL_RAD = 0.35;
  const ARCH_R = 0.425, ARCH_Y = 0.335;   // wheel arch openings: radius and centre height
  const FONT = '"Saira Condensed", "Arial Narrow", sans-serif';

  // ---------- the eight GT3 models ----------
  // Lengths are along +z (front), heights in metres. belt: the shoulder line where the flanks meet the
  // top; crown: the height along the centre line (below the belt where the fenders stand proud of the
  // bonnet); topP: how quickly the top falls from the centre to the shoulders. nose / tail: length and
  // superellipse power of the rounding in plan view. cabin: windscreen base z0, roof from z1 to z2, rear
  // glass (or the engine cover of a mid-engined car) down to z3.
  const SPECS = {
    McLaren: {
      layout: 'mid', zf: 2.3, zr: -2.25, axF: 1.36, axR: -1.3, track: 0.83, hw: 0.945, tumble: 0.1, flare: [0.07, 0.08],
      nose: [0.62, 2.6], tail: [0.26, 5], topP: 2.2,
      belt: [[2.3, 0.3], [2.12, 0.5], [1.8, 0.68], [1.36, 0.8], [0.9, 0.79], [0.2, 0.8], [-0.6, 0.88], [-1.3, 0.94], [-1.9, 0.96], [-2.25, 0.9]],
      crown: [[2.3, 0.3], [2.12, 0.52], [1.8, 0.62], [1.3, 0.7], [0.95, 0.75], [0.2, 0.8], [-0.6, 0.9], [-1.4, 0.97], [-2.0, 0.97], [-2.25, 0.9]],
      cabin: { z0: 0.95, z1: 0.08, z2: -0.72, z3: -1.75, roof: 1.18, inset: 0.07, tumble: 0.2, back: 'cover' },
      wing: { z: -1.98, y: 1.2, span: 1.8, chord: 0.34 }, doorZ: 0.28,
      rim: ['10', '#2a2d31'], caliper: '#c8102e', exhaust: 'centre',
    },
    BMW: {
      layout: 'front', zf: 2.42, zr: -2.36, axF: 1.46, axR: -1.36, track: 0.83, hw: 0.95, tumble: 0.1, flare: [0.07, 0.08],
      nose: [0.5, 3.4], tail: [0.24, 5], topP: 2.0,
      belt: [[2.42, 0.44], [2.3, 0.62], [2.0, 0.76], [1.46, 0.86], [0.6, 0.88], [-0.4, 0.92], [-1.36, 0.98], [-2.0, 1.02], [-2.36, 0.98]],
      crown: [[2.42, 0.44], [2.3, 0.66], [2.0, 0.79], [1.4, 0.87], [0.6, 0.92], [-0.4, 0.95], [-1.6, 1.02], [-2.1, 1.04], [-2.36, 0.98]],
      cabin: { z0: 0.42, z1: -0.22, z2: -1.0, z3: -1.72, roof: 1.25, inset: 0.07, tumble: 0.2, back: 'glass' },
      wing: { z: -2.06, y: 1.3, span: 1.8, chord: 0.36 }, doorZ: -0.32,
      rim: ['Y', '#b39045'], caliper: '#1c3f94', exhaust: 'side',
    },
    'Mercedes-AMG': {
      layout: 'front', zf: 2.38, zr: -2.3, axF: 1.44, axR: -1.2, track: 0.83, hw: 0.945, tumble: 0.11, flare: [0.07, 0.08],
      nose: [0.55, 3], tail: [0.26, 5], topP: 2.4,
      belt: [[2.38, 0.4], [2.25, 0.58], [1.95, 0.72], [1.44, 0.82], [0.5, 0.84], [-0.4, 0.88], [-1.2, 0.97], [-1.8, 0.99], [-2.3, 0.94]],
      crown: [[2.38, 0.4], [2.25, 0.6], [1.9, 0.74], [1.2, 0.84], [0.4, 0.88], [-0.4, 0.92], [-1.6, 1.0], [-2.1, 1.0], [-2.3, 0.94]],
      cabin: { z0: 0.18, z1: -0.42, z2: -0.95, z3: -2.02, roof: 1.22, inset: 0.08, tumble: 0.22, back: 'glass' },
      wing: { z: -2.02, y: 1.26, span: 1.78, chord: 0.34 }, doorZ: -0.55,
      rim: ['10', '#16181b'], caliper: '#c8102e', exhaust: 'side',
    },
    Audi: {
      layout: 'mid', zf: 2.3, zr: -2.27, axF: 1.36, axR: -1.29, track: 0.83, hw: 0.945, tumble: 0.1, flare: [0.07, 0.08],
      nose: [0.55, 3], tail: [0.24, 6], topP: 2.2,
      belt: [[2.3, 0.36], [2.15, 0.54], [1.8, 0.7], [1.36, 0.8], [0.85, 0.8], [0.2, 0.82], [-0.6, 0.9], [-1.29, 0.96], [-1.9, 0.98], [-2.27, 0.94]],
      crown: [[2.3, 0.36], [2.15, 0.56], [1.8, 0.66], [1.2, 0.74], [0.85, 0.77], [0.2, 0.82], [-0.6, 0.92], [-1.4, 0.98], [-2.0, 0.99], [-2.27, 0.94]],
      cabin: { z0: 0.88, z1: 0.0, z2: -0.72, z3: -1.7, roof: 1.18, inset: 0.07, tumble: 0.2, back: 'cover' },
      wing: { z: -2.0, y: 1.22, span: 1.8, chord: 0.35 }, doorZ: 0.2,
      rim: ['5', '#c4c8cd'], caliper: '#c8102e', exhaust: 'twin',
    },
    'Aston Martin': {
      layout: 'front', zf: 2.36, zr: -2.28, axF: 1.44, axR: -1.26, track: 0.83, hw: 0.945, tumble: 0.1, flare: [0.07, 0.08],
      nose: [0.5, 2.8], tail: [0.24, 5], topP: 2.6,
      belt: [[2.36, 0.4], [2.24, 0.58], [1.95, 0.71], [1.44, 0.81], [0.5, 0.83], [-0.4, 0.87], [-1.26, 0.96], [-1.85, 0.98], [-2.2, 1.0], [-2.28, 0.94]],
      crown: [[2.36, 0.4], [2.24, 0.6], [1.9, 0.72], [1.2, 0.82], [0.4, 0.87], [-0.4, 0.91], [-1.6, 0.99], [-2.15, 1.02], [-2.28, 0.94]],
      cabin: { z0: 0.22, z1: -0.38, z2: -0.92, z3: -1.92, roof: 1.21, inset: 0.08, tumble: 0.22, back: 'glass' },
      wing: { z: -2.02, y: 1.26, span: 1.78, chord: 0.34 }, doorZ: -0.5,
      rim: ['10', '#16181b'], caliper: '#c4d600', exhaust: 'side',
    },
    Porsche: {
      layout: 'rear', zf: 2.27, zr: -2.34, axF: 1.27, axR: -1.23, track: 0.83, hw: 0.945, tumble: 0.12, flare: [0.07, 0.09],
      nose: [0.5, 2.4], tail: [0.32, 4], topP: 3,
      belt: [[2.27, 0.4], [2.15, 0.6], [1.85, 0.74], [1.5, 0.79], [1.0, 0.8], [0.3, 0.82], [-0.5, 0.88], [-1.23, 0.94], [-1.9, 0.93], [-2.34, 0.84]],
      crown: [[2.27, 0.4], [2.15, 0.55], [1.8, 0.64], [1.2, 0.72], [0.55, 0.78], [-0.5, 0.9], [-1.3, 0.97], [-1.9, 0.95], [-2.34, 0.84]],
      cabin: { z0: 0.5, z1: -0.08, z2: -0.62, z3: -1.95, roof: 1.25, inset: 0.09, tumble: 0.22, back: 'glass' },
      wing: { z: -2.06, y: 1.32, span: 1.8, chord: 0.36 }, doorZ: -0.2,
      rim: ['Y', '#16181b'], caliper: '#e8b400', exhaust: 'porsche',
    },
    Ferrari: {
      layout: 'mid', zf: 2.33, zr: -2.28, axF: 1.38, axR: -1.28, track: 0.83, hw: 0.945, tumble: 0.1, flare: [0.07, 0.08],
      nose: [0.6, 2.6], tail: [0.26, 5], topP: 2.2,
      belt: [[2.33, 0.32], [2.16, 0.5], [1.8, 0.67], [1.38, 0.79], [0.9, 0.78], [0.2, 0.8], [-0.6, 0.88], [-1.28, 0.94], [-1.9, 0.95], [-2.28, 0.9]],
      crown: [[2.33, 0.32], [2.16, 0.52], [1.8, 0.62], [1.3, 0.69], [0.95, 0.74], [0.2, 0.8], [-0.6, 0.9], [-1.4, 0.96], [-2.0, 0.96], [-2.28, 0.9]],
      cabin: { z0: 0.92, z1: 0.05, z2: -0.68, z3: -1.65, roof: 1.17, inset: 0.07, tumble: 0.2, back: 'cover' },
      wing: { z: -2.0, y: 1.2, span: 1.8, chord: 0.34 }, doorZ: 0.24,
      rim: ['5', '#c4c8cd'], caliper: '#e8b400', exhaust: 'centre',
    },
    Lamborghini: {
      layout: 'mid', zf: 2.3, zr: -2.24, axF: 1.36, axR: -1.29, track: 0.83, hw: 0.945, tumble: 0.14, flare: [0.07, 0.08],
      nose: [0.6, 2.2], tail: [0.22, 6], topP: 1.6,
      belt: [[2.3, 0.3], [2.1, 0.5], [1.7, 0.66], [1.36, 0.76], [0.9, 0.78], [0.2, 0.81], [-0.6, 0.88], [-1.29, 0.93], [-1.9, 0.95], [-2.24, 0.92]],
      crown: [[2.3, 0.3], [2.1, 0.5], [1.7, 0.62], [1.2, 0.7], [0.95, 0.75], [0.2, 0.81], [-0.6, 0.9], [-1.4, 0.95], [-2.0, 0.95], [-2.24, 0.92]],
      cabin: { z0: 1.0, z1: 0.0, z2: -0.55, z3: -1.85, roof: 1.16, inset: 0.08, tumble: 0.24, back: 'cover', scoop: true },
      wing: { z: -1.98, y: 1.2, span: 1.8, chord: 0.34 }, doorZ: 0.22,
      rim: ['Y', '#16181b'], caliper: '#e8b400', exhaust: 'high',
    },
  };

  // Monotone cubic through [z, value] points (no overshoot between them).
  function curve(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0]);
    const n = p.length, x = p.map((q) => q[0]), y = p.map((q) => q[1]);
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return (z) => {
      if (z <= x[0]) return y[0];
      if (z >= x[n - 1]) return y[n - 1];
      let i = 0;
      while (z > x[i + 1]) i++;
      const h = x[i + 1] - x[i], t = (z - x[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }

  // The body as functions of length z: shoulder and centre heights, the bottom edge (cut by the wheel
  // arches), the half-width at any height, and the height of the top surface across the car.
  function form(S) {
    if (S.F) return S.F;
    const belt = curve(S.belt), crown = curve(S.crown);
    const sill = curve([[S.zf, 0.17], [S.zf - 0.35, 0.125], [S.zr + 0.6, 0.125], [S.zr + 0.18, 0.3], [S.zr, 0.34]]);
    const nearF = (z) => 1 - sm(ARCH_R * 0.7, ARCH_R + 0.62, Math.abs(z - S.axF));
    const nearR = (z) => 1 - sm(ARCH_R * 0.7, ARCH_R + 0.75, Math.abs(z - S.axR));
    const plan = (z) => {
      let t, n;
      if (z > S.zf - S.nose[0]) { t = (z - S.zf + S.nose[0]) / S.nose[0]; n = S.nose[1]; }
      else if (z < S.zr + S.tail[0]) { t = (S.zr + S.tail[0] - z) / S.tail[0]; n = S.tail[1]; }
      else return 1;
      return Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, t), n)), 1 / n);
    };
    const bottom = (z) => {
      let y = sill(z);
      for (const a of [S.axF, S.axR]) { const d = Math.abs(z - a); if (d < ARCH_R) y = Math.max(y, ARCH_Y + Math.sqrt(ARCH_R * ARCH_R - d * d)); }
      return y;
    };
    // tuck-under at the sill, tumblehome above the waist, a rounded shoulder, arches flared out
    const half = (z, y) => {
      const ys = belt(z), h = clamp((y - 0.1) / Math.max(0.05, ys - 0.1), 0, 1);
      const nf = nearF(z), nr = nearR(z), tum = S.tumble * (1 - 0.65 * Math.max(nf, nr));
      let k = h < 0.42 ? 1 - 0.07 * sq((0.42 - h) / 0.42) : 1 - tum * Math.pow((h - 0.42) / 0.58, 1.8);
      k -= 0.045 * sq(sm(0.7, 1, h));
      return plan(z) * (S.hw * k + (S.flare[0] * nf + S.flare[1] * nr) * sm(-0.3, 0.35, h));
    };
    const topY = (z, x) => {
      const ys = belt(z), yc = crown(z), xs = half(z, ys);
      const u = xs > 1e-4 ? Math.min(1, Math.abs(x) / xs) : 1;
      return yc + (ys - yc) * Math.pow(u, S.topP);
    };
    const inside = (x, y, z) => {
      if (z > S.zf || z < S.zr || y < bottom(z)) return false;
      const ys = belt(z);
      if (y <= ys) return Math.abs(x) <= half(z, y);
      return Math.abs(x) <= half(z, ys) && y <= topY(z, x);
    };
    return (S.F = { belt, crown, sill, bottom, half, topY, inside, plan });
  }

  // The glasshouse: its base runs along the body just inside the shoulders; roofline through the
  // windscreen, the roof and the rear glass.
  function cabinForm(S, F) {
    if (S.G) return S.G;
    const C = S.cabin;
    const gb = (z) => Math.min(C.base || 0.8, F.half(z, F.belt(z)) - C.inset);
    const yb = (z) => Math.min(F.topY(z, gb(z)), F.crown(z)) - 0.012;
    const y0 = yb(C.z0), y3 = yb(C.z3), rr = C.roof - 0.025;
    const line = curve([[C.z0, y0], [lerp(C.z0, C.z1, 0.5), lerp(y0, C.roof, 0.58)], [C.z1, C.roof], [C.z2, rr],
      [lerp(C.z2, C.z3, 0.5), lerp(rr, y3, C.back === 'glass' ? 0.45 : 0.55)], [C.z3, y3]]);
    return (S.G = { gb, yb, line, height: (z) => Math.max(0, line(z) - yb(z)) });
  }

  // ---------- geometry helpers ----------
  function quads(n, w, base, flip, out) {
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < w - 1; j++) {
      const a = base + i * w + j, b = a + w, c = a + 1, d = b + 1;
      if (flip) out.push(a, b, c, c, b, d); else out.push(a, c, b, c, d, b);
    }
    return out;
  }
  // Loft rings of [x, y] points (one ring per z) into a mesh. Normals come from the welded surface, so
  // the uv seams between segments [j0, j1] stay smooth.
  function loft(rings, zs, segs, uvOf) {
    const n = rings.length, M = rings[0].length;
    const wp = new Float32Array(n * M * 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < M; j++) { const o = (i * M + j) * 3; wp[o] = rings[i][j][0]; wp[o + 1] = rings[i][j][1]; wp[o + 2] = zs[i]; }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    wg.setIndex(quads(n, M, 0, false, []));
    wg.computeVertexNormals();
    const wn = wg.attributes.normal.array;
    const pos = [], nor = [], uv = [], index = [];
    for (const [j0, j1, id] of segs) {
      const base = pos.length / 3, w = j1 - j0 + 1;
      for (let i = 0; i < n; i++) for (let j = j0; j <= j1; j++) {
        const o = (i * M + j) * 3;
        pos.push(wp[o], wp[o + 1], wp[o + 2]); nor.push(wn[o], wn[o + 1], wn[o + 2]);
        const t = uvOf(id, wp[o], wp[o + 1], wp[o + 2], i, j); uv.push(t[0], t[1]);
      }
      quads(n, w, base, false, index);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    return g;
  }
  // Merge geometries, each with an optional matrix and vertex colour, into one non-indexed geometry.
  function mergeGeos(parts, tint) {
    const pos = [], nor = [], uv = [], colr = [];
    const nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
    for (const { geo, m, color } of parts) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (!g.attributes.normal) g.computeVertexNormals();
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      if (m) nm.getNormalMatrix(m);
      c.copy(NR.world.col(color || tint || '#ffffff'));
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i); if (m) v.applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i); if (m) v.applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
        colr.push(c.r, c.g, c.b);
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    return out;
  }
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const mat4 = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(_p.set(x, y, z),
    _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0)), _s.set(sx || 1, sy || sx || 1, sz || sx || 1));
  const tubeMat = (a, b) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    return new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, len, 1));
  };
  // a flat plate from a 2D outline in the (z, y) side plane, `t` thick, centred on x
  function sidePlate(pts, t, x) {
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -t / 2); g.rotateY(-Math.PI / 2); g.translate(x, 0, 0);
    return g;
  }

  // ---------- body, glasshouse, underside ----------
  const KS = 9, KT = 10;   // ring points: flank (sill to shoulder) and top (shoulder to centre line)
  const AX = (z) => ((z + 2.5) / 5) * 1024;                          // livery canvas: length -> px
  const ROW_TOP = (f) => 128 - f * 122;                              // top view: x / shoulder width -> px
  const ROW_SIDE = (sd, y) => (sd > 0 ? 508 : 764) - (y / 1.3) * 246; // side views (+x, -x): height -> px

  function bodyZs(S) {
    const zs = [];
    const push = (z) => { if (z >= S.zr && z <= S.zf) zs.push(z); };
    for (let z = S.zr; z <= S.zf; z += 0.045) push(z);
    for (let k = 0; k <= 20; k++) {
      const c = Math.cos((k / 20) * Math.PI / 2);
      push(S.zf - S.nose[0] + S.nose[0] * Math.pow(c, 2 / S.nose[1]));
      push(S.zr + S.tail[0] - S.tail[0] * Math.pow(c, 2 / S.tail[1]));
    }
    push(S.zf); push(S.zr);
    const edges = [];
    for (const a of [S.axF, S.axR]) {
      for (let k = 1; k < 16; k++) push(a - ARCH_R * Math.cos((k / 16) * Math.PI));
      edges.push(a - ARCH_R - 6e-4, a - ARCH_R + 6e-4, a + ARCH_R - 6e-4, a + ARCH_R + 6e-4);
    }
    const all = zs.filter((z) => edges.every((e) => Math.abs(z - e) > 0.012)).concat(edges).sort((a, b) => a - b);
    return all.filter((z, i) => i === 0 || z - all[i - 1] > 4e-4);
  }

  const geoCache = {};
  function bodyGeos(S, key) {
    if (geoCache[key]) return geoCache[key];
    const F = form(S), zs = bodyZs(S), rings = [], xsOf = [];
    for (const z of zs) {
      const ys = F.belt(z), yb = Math.min(F.bottom(z), ys - 0.012);
      const side = [];
      for (let k = 0; k <= KS; k++) { const y = yb + (ys - yb) * (k / KS); side.push([F.half(z, y), y]); }
      const xs = side[KS][0], top = [];
      for (let k = 1; k <= KT; k++) { const x = k === KT ? 0 : xs * Math.cos((k / KT) * Math.PI / 2); top.push([x, F.topY(z, x)]); }
      const ring = side.concat(top);
      for (let k = KT - 2; k >= 0; k--) ring.push([-top[k][0], top[k][1]]);
      ring.push([-xs, ys]);
      for (let k = KS - 1; k >= 0; k--) ring.push([-side[k][0], side[k][1]]);
      rings.push(ring); xsOf.push(xs);
    }
    const M = rings[0].length;
    const body = loft(rings, zs, [[0, KS, 0], [KS, KS + 2 * KT, 1], [KS + 2 * KT, M - 1, 2]], (id, x, y, z, i) => {
      if (id === 1) { const f = xsOf[i] > 1e-4 ? x / xsOf[i] : 0; return [AX(z) / 1024, 1 - ROW_TOP(f) / 768]; }
      return id === 0 ? [1 - AX(z) / 1024, 1 - ROW_SIDE(1, y) / 768] : [AX(z) / 1024, 1 - ROW_SIDE(-1, y) / 768];
    });

    // glasshouse, painted with its own window graphics (u along the car, v round from the -x base to the +x base)
    const C = S.cabin, G = cabinForm(S, F), KG = 6, KR = 8, czs = [], crings = [], tops = [];
    for (let k = 0; k <= 60; k++) czs.push(lerp(C.z3, C.z0, k / 60));
    for (const z of czs) {
      const h = G.height(z), b = G.gb(z), t = b - C.tumble * Math.min(1, h / 0.38), cr = 0.05 * Math.min(1, h / 0.3), y0 = G.yb(z);
      const side = [];
      for (let k = 0; k <= KG; k++) { const f = k / KG; side.push([lerp(b, t, Math.pow(f, 1.3)), y0 + (h - cr) * f]); }
      const roof = [];
      for (let k = 1; k <= KR; k++) { const x = k === KR ? 0 : t * Math.cos((k / KR) * Math.PI / 2); roof.push([x, y0 + h - cr * sq(x / t)]); }
      const ring = side.concat(roof);
      for (let k = KR - 2; k >= 0; k--) ring.push([-roof[k][0], roof[k][1]]);
      for (let k = KG; k >= 0; k--) ring.push([-side[k][0], side[k][1]]);
      crings.push(ring); tops.push(t);
    }
    const CM = crings[0].length;
    const cabin = loft(crings, czs, [[0, CM - 1, 0]], (id, x, y, z, i, j) => {
      const u = (z - C.z3) / (C.z0 - C.z3);
      if (j <= KG) return [u, 1 - 0.25 * (j / KG)];
      if (j >= CM - 1 - KG) return [u, 0.25 * ((CM - 1 - j) / KG)];
      return [u, 0.5 + 0.25 * (x / tops[i])];
    });

    // underside with the wheel wells (a roof over each wheel out to an inner liner, kept under the
    // bodywork), and the exhausts: one dark mesh with vertex colours
    const under = [], uidx = [];
    rings.forEach((r, i) => {
      const z = zs[i], [x0, yb] = r[0], floor = Math.min(yb, F.sill(z)), xi = Math.min(S.track - 0.2, x0), half = [[x0, yb]];
      for (let k = 1; k <= 3; k++) { const x = lerp(x0, xi, k / 3); half.push([x, yb > floor ? Math.max(floor, Math.min(yb, F.topY(z, x) - 0.025)) : yb]); }
      half.push([xi, floor]);
      half.concat(half.slice().reverse().map(([x, y]) => [-x, y])).forEach(([x, y]) => under.push(x, y, z));
    });
    quads(rings.length, 10, 0, true, uidx);
    const ug = new THREE.BufferGeometry();
    ug.setAttribute('position', new THREE.Float32BufferAttribute(under, 3)); ug.setIndex(uidx); ug.computeVertexNormals();
    const parts = [{ geo: ug, color: '#0d0e10' }];
    // exhaust tips: out of the tail, or out of the flanks ahead of the rear wheels (sd)
    const tip = (x, y, z, sd) => {
      const along = sd ? mat4(x, y, z, 0, 0, Math.PI / 2) : mat4(x, y, z, Math.PI / 2);
      parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.054, 0.14, 16, 1, true), m: along, color: '#8a8f96' });
      parts.push({ geo: new THREE.CircleGeometry(0.047, 16), m: mat4(x, y, z, 0, sd ? -sd * Math.PI / 2 : Math.PI), color: '#050505' });
    };
    const zt = S.zr + 0.02;
    if (S.exhaust === 'centre') [-0.07, 0.07].forEach((x) => tip(x, 0.44, zt));
    if (S.exhaust === 'porsche') [-0.1, 0.1].forEach((x) => tip(x, 0.4, zt));
    if (S.exhaust === 'twin') [-0.42, 0.42].forEach((x) => tip(x, 0.36, zt + 0.03));
    if (S.exhaust === 'high') [-0.1, 0.1].forEach((x) => tip(x, 0.8, zt + 0.06));
    if (S.exhaust === 'side') [1, -1].forEach((sd) => { const z = S.axR + ARCH_R + 0.22; tip(sd * (F.half(z, 0.19) + 0.02), 0.19, z, sd); });
    const chassis = mergeGeos(parts);

    return (geoCache[key] = { body, cabin, chassis, F, G, decals: { front: decalGrid(S, F, true), rear: decalGrid(S, F, false) } });
  }

  // ---------- decals on the nose and tail ----------
  // A grid of rays marched straight along the car into the body; cells that miss it or straddle a
  // step in depth are dropped. The decal canvas maps x across and height up, as seen from that end.
  const FACE_BOX = { x0: -1.05, x1: 1.05, y0: 0.06, y1: 0.86 }, REAR_BOX = { x0: -1.05, x1: 1.05, y0: 0.25, y1: 1.05 };
  function decalGrid(S, F, front) {
    const box = front ? FACE_BOX : REAR_BOX, nu = 72, nv = 30, step = 0.015;
    const z0 = front ? S.zf + 0.02 : S.zr - 0.02, dz = front ? -1 : 1, maxD = front ? 0.95 : 0.7;
    const hit = new Float32Array((nu + 1) * (nv + 1));
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const a = i / nu, x = front ? lerp(box.x0, box.x1, a) : lerp(box.x1, box.x0, a), y = lerp(box.y0, box.y1, j / nv);
      let d = -1;
      for (let t = 0; t <= maxD; t += step) if (F.inside(x, y, z0 + dz * t)) { d = t; break; }
      if (d > 0) {
        let lo = d - step, hi = d;
        for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2; if (F.inside(x, y, z0 + dz * m)) hi = m; else lo = m; }
        d = hi;
      }
      hit[j * (nu + 1) + i] = d;
    }
    return { nu, nv, hit, box, z0, dz, front };
  }
  function decalGeo(D, lift, tex) {
    const { nu, nv, hit, box, z0, dz, front } = D, W = nu + 1, pos = [], uv = [], idx = [];
    // keep only the cells where the decal's canvas paints something
    const cv = tex.image, cw = cv.width, ch = cv.height, px = cv.getContext('2d').getImageData(0, 0, cw, ch).data;
    const painted = (i, j) => {
      const x0 = Math.floor((i / nu) * cw), x1 = Math.min(cw, Math.ceil(((i + 1) / nu) * cw));
      const y0 = Math.floor((1 - (j + 1) / nv) * ch), y1 = Math.min(ch, Math.ceil((1 - j / nv) * ch));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (px[(y * cw + x) * 4 + 3] > 8) return true;
      return false;
    };
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const a = i / nu, b = j / nv, d = hit[j * W + i];
      pos.push(front ? lerp(box.x0, box.x1, a) : lerp(box.x1, box.x0, a), lerp(box.y0, box.y1, b), z0 + dz * Math.max(0, d - lift));
      uv.push(a, b);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1, q = [hit[a], hit[b], hit[c], hit[d]];
      if (Math.min(...q) < 0 || Math.max(...q) - Math.min(...q) > 0.1 || !painted(i, j)) continue;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  // Drawing on a decal canvas in metres: shapes given for x > 0 are mirrored to the other side by pair().
  const DARK = '#08090b';
  function decalPainter(g, box, w, h, mirror) {
    const X = (x) => (mirror ? (box.x1 - x) : (x - box.x0)) / (box.x1 - box.x0) * w;
    const Y = (y) => (1 - (y - box.y0) / (box.y1 - box.y0)) * h;
    const path = (pts, s) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(s * x), Y(y)) : g.moveTo(X(s * x), Y(y)))); g.closePath(); };
    const mesh = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 6;
      const p = c.getContext('2d'); p.fillStyle = '#050607'; p.fillRect(0, 0, 6, 6);
      p.strokeStyle = '#30343a'; p.lineWidth = 1; p.beginPath(); p.moveTo(0, 0); p.lineTo(6, 6); p.moveTo(6, 0); p.lineTo(0, 6); p.stroke();
      return g.createPattern(c, 'repeat');
    })();
    const P = {
      X, Y, mesh,
      one(pts, fill) { path(pts, 1); g.fillStyle = fill; g.fill(); },
      pair(pts, fill) { [1, -1].forEach((s) => { path(pts, s); g.fillStyle = fill; g.fill(); }); },
      edge(pts, color, lw, pair) { (pair ? [1, -1] : [1]).forEach((s) => { path(pts, s); g.strokeStyle = color; g.lineWidth = lw; g.stroke(); }); },
      ell(x, y, rx, ry, fill, pair) {
        (pair ? [1, -1] : [1]).forEach((s) => {
          g.beginPath(); g.ellipse(X(s * x), Y(y), Math.abs(X(rx) - X(0)), Math.abs(Y(ry) - Y(0)), 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
        });
      },
      // slats across a shape: vertical (dir 'v') or horizontal bars, clipped to it
      slats(pts, dir, gap, color, lw, pair) {
        (pair ? [1, -1] : [1]).forEach((s) => {
          g.save(); path(pts, s); g.clip(); g.strokeStyle = color; g.lineWidth = lw; g.beginPath();
          if (dir === 'v') for (let x = -1.1; x < 1.1; x += gap) { g.moveTo(X(x), 0); g.lineTo(X(x), h); }
          else for (let y = box.y0; y < box.y1; y += gap) { g.moveTo(0, Y(y)); g.lineTo(w, Y(y)); }
          g.stroke(); g.restore();
        });
      },
    };
    return P;
  }

  // Brand faces: fascia (grilles, intakes, lamp housings), lamps (glowing), rear fascia and tail lamps.
  const LAMP = '#fffaf0', LENS = '#c9ced4', RED = '#ff2a22', RED_DIM = '#6a0a08';
  const FACES = {
    McLaren: {
      face(P) {
        P.pair([[0.4, 0.5], [0.62, 0.55], [0.86, 0.55], [0.93, 0.47], [0.78, 0.35], [0.56, 0.23], [0.44, 0.23], [0.4, 0.34]], DARK);
        P.one([[-0.34, 0.3], [0.34, 0.3], [0.28, 0.15], [-0.28, 0.15]], P.mesh);
      },
      lamps(P) { P.pair([[0.47, 0.505], [0.84, 0.54], [0.86, 0.522], [0.5, 0.49]], LAMP); P.ell(0.6, 0.462, 0.034, 0.02, LENS, true); P.ell(0.72, 0.474, 0.034, 0.02, LENS, true); },
      rear(P) { P.one([[-0.78, 0.68], [0.78, 0.68], [0.82, 0.4], [-0.82, 0.4]], P.mesh); },
      tail(P) { P.pair([[0.52, 0.8], [0.94, 0.81], [0.94, 0.77], [0.56, 0.765]], RED); },
    },
    BMW: {
      face(P) {
        const kid = [[0.04, 0.6], [0.3, 0.62], [0.33, 0.56], [0.34, 0.24], [0.3, 0.17], [0.05, 0.17], [0.03, 0.24]];
        P.pair(kid, DARK); P.slats(kid, 'v', 0.035, '#3a3f45', 3, true); P.edge(kid, '#5d636b', 4, true);
        P.pair([[0.5, 0.33], [0.88, 0.38], [0.92, 0.16], [0.52, 0.15]], P.mesh);
        P.pair([[0.4, 0.6], [0.88, 0.66], [0.93, 0.56], [0.44, 0.52]], DARK);
      },
      lamps(P) {
        P.pair([[0.45, 0.59], [0.86, 0.645], [0.88, 0.628], [0.47, 0.574]], LAMP);
        P.pair([[0.5, 0.57], [0.53, 0.57], [0.53, 0.53], [0.5, 0.53]], LAMP);
        P.ell(0.62, 0.56, 0.042, 0.026, LENS, true); P.ell(0.76, 0.58, 0.042, 0.026, LENS, true);
      },
      rear(P) { P.pair([[0.55, 0.56], [0.9, 0.58], [0.92, 0.42], [0.58, 0.42]], P.mesh); },
      tail(P) {
        P.pair([[0.5, 0.87], [0.93, 0.87], [0.93, 0.74], [0.84, 0.74], [0.84, 0.81], [0.5, 0.81]], RED_DIM);
        P.pair([[0.52, 0.85], [0.91, 0.85], [0.91, 0.76], [0.86, 0.76], [0.86, 0.83], [0.52, 0.83]], RED);
      },
    },
    'Mercedes-AMG': {
      face(P) {
        const gr = [[-0.36, 0.5], [0.36, 0.5], [0.44, 0.2], [-0.44, 0.2]];
        P.one(gr, DARK); P.slats(gr, 'v', 0.06, '#9aa1a8', 4, false); P.edge(gr, '#6d737a', 3, false);
        P.pair([[0.56, 0.3], [0.9, 0.36], [0.93, 0.15], [0.58, 0.15]], P.mesh);
        P.pair([[0.46, 0.56], [0.88, 0.62], [0.93, 0.53], [0.54, 0.49]], DARK);
      },
      lamps(P) { P.pair([[0.5, 0.548], [0.86, 0.6], [0.88, 0.585], [0.53, 0.534]], LAMP); [0.64, 0.72, 0.8].forEach((x, i) => P.ell(x, 0.54 + i * 0.012, 0.026, 0.018, LENS, true)); },
      rear(P) { P.pair([[0.48, 0.6], [0.92, 0.62], [0.94, 0.42], [0.5, 0.42]], P.mesh); },
      tail(P) { P.pair([[0.42, 0.84], [0.94, 0.84], [0.94, 0.78], [0.47, 0.785]], RED_DIM); P.pair([[0.45, 0.825], [0.92, 0.825], [0.92, 0.8], [0.48, 0.8]], RED); },
    },
    Audi: {
      face(P) {
        const sf = [[-0.36, 0.5], [0.36, 0.5], [0.48, 0.38], [0.44, 0.15], [-0.44, 0.15], [-0.48, 0.38]];
        P.one(sf, P.mesh); P.edge(sf, '#41454b', 6, false);
        P.pair([[0.58, 0.34], [0.9, 0.38], [0.93, 0.15], [0.6, 0.15]], P.mesh);
        P.pair([[0.5, 0.52], [0.87, 0.58], [0.92, 0.5], [0.55, 0.45]], DARK);
      },
      lamps(P) {
        for (let k = 0; k < 6; k++) { const x = 0.54 + k * 0.055; P.pair([[x, 0.5 + k * 0.009], [x + 0.04, 0.506 + k * 0.009], [x + 0.04, 0.492 + k * 0.009], [x, 0.487 + k * 0.009]], LAMP); }
        P.ell(0.66, 0.475, 0.04, 0.022, LENS, true); P.ell(0.78, 0.49, 0.04, 0.022, LENS, true);
      },
      rear(P) { P.one([[-0.46, 0.8], [0.46, 0.8], [0.46, 0.66], [-0.46, 0.66]], P.mesh); P.pair([[0.6, 0.58], [0.9, 0.6], [0.92, 0.42], [0.62, 0.42]], P.mesh); },
      tail(P) { P.pair([[0.5, 0.8], [0.93, 0.82], [0.93, 0.72], [0.52, 0.72]], RED_DIM); P.slats([[0.52, 0.79], [0.91, 0.81], [0.91, 0.73], [0.54, 0.73]], 'h', 0.025, RED, 3, true); },
    },
    'Aston Martin': {
      face(P) {
        const gr = [[-0.5, 0.46], [0.5, 0.46], [0.62, 0.34], [0.56, 0.15], [-0.56, 0.15], [-0.62, 0.34]];
        P.one(gr, DARK); P.slats(gr, 'h', 0.045, '#3b4046', 4, false); P.edge(gr, '#6d737a', 3, false);
        P.pair([[0.56, 0.55], [0.9, 0.62], [0.94, 0.55], [0.64, 0.49]], DARK);
      },
      lamps(P) { P.pair([[0.6, 0.535], [0.88, 0.595], [0.9, 0.58], [0.63, 0.522]], LAMP); P.ell(0.72, 0.535, 0.036, 0.02, LENS, true); P.ell(0.82, 0.555, 0.036, 0.02, LENS, true); },
      rear(P) { P.pair([[0.5, 0.56], [0.88, 0.58], [0.9, 0.42], [0.52, 0.42]], P.mesh); },
      tail(P) { P.pair([[0.28, 0.875], [0.95, 0.875], [0.95, 0.83], [0.28, 0.845]], RED); },
    },
    Porsche: {
      face(P) {
        P.one([[-0.34, 0.32], [0.34, 0.32], [0.3, 0.15], [-0.3, 0.15]], P.mesh);
        P.pair([[0.5, 0.36], [0.86, 0.38], [0.88, 0.16], [0.5, 0.15]], P.mesh);
        P.ell(0.66, 0.635, 0.155, 0.105, DARK, true);
      },
      lamps(P) {
        P.ell(0.66, 0.635, 0.14, 0.092, LENS, true);
        [[-0.06, 0.03], [0.06, 0.03], [-0.06, -0.03], [0.06, -0.03]].forEach(([dx, dy]) => P.ell(0.66 + dx, 0.635 + dy, 0.03, 0.018, LAMP, true));
      },
      rear(P) { P.one([[-0.8, 0.66], [0.8, 0.66], [0.84, 0.42], [-0.84, 0.42]], P.mesh); },
      tail(P) { P.one([[-0.88, 0.79], [0.88, 0.79], [0.88, 0.772], [-0.88, 0.772]], RED); P.pair([[0.6, 0.81], [0.9, 0.81], [0.9, 0.75], [0.62, 0.755]], RED); },
    },
    Ferrari: {
      face(P) {
        const gr = [[-0.6, 0.31], [0.6, 0.31], [0.55, 0.15], [-0.55, 0.15]];
        P.one(gr, P.mesh); P.one([[-0.56, 0.245], [0.56, 0.245], [0.56, 0.225], [-0.56, 0.225]], '#1d2024');
        P.pair([[0.48, 0.52], [0.87, 0.57], [0.93, 0.5], [0.62, 0.46], [0.52, 0.43]], DARK);
      },
      lamps(P) { P.pair([[0.5, 0.5], [0.85, 0.55], [0.87, 0.535], [0.62, 0.493], [0.52, 0.476]], LAMP); P.ell(0.72, 0.505, 0.04, 0.02, LENS, true); },
      rear(P) { P.one([[-0.82, 0.7], [0.82, 0.7], [0.86, 0.42], [-0.86, 0.42]], P.mesh); },
      tail(P) { P.pair([[0.42, 0.83], [0.86, 0.83], [0.86, 0.785], [0.42, 0.785]], RED); },
    },
    Lamborghini: {
      face(P) {
        P.one([[-0.26, 0.3], [0.26, 0.3], [0.3, 0.15], [-0.3, 0.15]], P.mesh);
        P.pair([[0.38, 0.38], [0.9, 0.46], [0.93, 0.15], [0.42, 0.15]], P.mesh);
        P.pair([[0.66, 0.42], [0.62, 0.15], [0.6, 0.15], [0.64, 0.42]], '#202327');
        P.pair([[0.48, 0.5], [0.88, 0.56], [0.92, 0.49], [0.52, 0.44]], DARK);
      },
      lamps(P) {
        P.pair([[0.5, 0.48], [0.86, 0.54], [0.88, 0.52], [0.52, 0.465]], LAMP);
        P.pair([[0.64, 0.5], [0.7, 0.48], [0.76, 0.52], [0.76, 0.5], [0.7, 0.46], [0.64, 0.48]], LAMP);
      },
      rear(P) { P.one([[-0.84, 0.66], [0.84, 0.66], [0.88, 0.42], [-0.88, 0.42]], P.mesh); },
      tail(P) {
        P.pair([[0.5, 0.78], [0.92, 0.8], [0.92, 0.66], [0.5, 0.7]], RED_DIM);
        P.pair([[0.56, 0.75], [0.7, 0.72], [0.86, 0.78], [0.86, 0.75], [0.7, 0.69], [0.56, 0.72]], RED);
        P.pair([[0.69, 0.72], [0.72, 0.72], [0.74, 0.67], [0.71, 0.67]], RED);
      },
    },
  };

  const faceCache = {};
  function faceTextures(brand) {
    if (faceCache[brand]) return faceCache[brand];
    const { canvasTex } = NR.world, B = FACES[brand];
    const front = (draw) => canvasTex(512, 256, (g, w, h) => draw(decalPainter(g, FACE_BOX, w, h, false), g));
    const back = (draw) => canvasTex(512, 256, (g, w, h) => draw(decalPainter(g, REAR_BOX, w, h, true), g));
    return (faceCache[brand] = {
      face: front((P) => B.face(P)),
      lamps: front((P) => B.lamps(P)),
      // every tail: a dark diffuser exit along the bottom, the brand's vents, a mesh under the wing
      rear: back((P) => { P.one([[-1.0, 0.4], [1.0, 0.4], [1.0, 0.25], [-1.0, 0.25]], DARK); B.rear(P); }),
      tail: back((P) => { B.tail(P); P.one([[-0.07, 0.5], [0.07, 0.5], [0.07, 0.445], [-0.07, 0.445]], RED); }),   // and the FIA rain light
    });
  }

  // ---------- liveries ----------
  // Painted in three bands of one canvas: the top view, then the +x and -x sides (each laid out so its
  // lettering reads the right way round). Styles paint by height on the flanks and by fraction of the
  // width on top; the same top pattern carries on over the roof.
  const poly = (g, pts, X, Y, fill) => { g.beginPath(); pts.forEach(([z, y], i) => (i ? g.lineTo(X(z), Y(y)) : g.moveTo(X(z), Y(y)))); g.closePath(); g.fillStyle = fill; g.fill(); };
  const band = (g, Y, y0, y1, fill) => { g.fillStyle = fill; g.fillRect(0, Y(y1), 4096, Y(y0) - Y(y1)); };
  const stripe = (g, T, f0, f1, fill) => { g.fillStyle = fill; g.fillRect(0, Math.min(T(f0), T(f1)), 4096, Math.abs(T(f0) - T(f1))); };
  const zrect = (g, X, Y, z0, z1, y0, y1, fill) => poly(g, [[z0, y0], [z1, y0], [z1, y1], [z0, y1]], X, Y, fill);
  const STYLES = {
    lower: {
      side(g, X, Y, A, B) { poly(g, [[2.6, 0], [2.6, 0.42], [-0.4, 0.58], [-2.6, 0.6], [-2.6, 0]], X, Y, A); band(g, Y, 0.62, 0.645, B); },
      top(g, X, T, A) { stripe(g, T, 0.86, 0.92, A); stripe(g, T, -0.92, -0.86, A); },
    },
    mstripes: {
      side(g, X, Y, A) {
        ['#3fa9f5', '#1c3f94', '#e4002b'].forEach((c, i) => { const z = 0.9 - i * 0.28; poly(g, [[z, 0], [z + 0.2, 0], [z - 0.6, 1.4], [z - 0.8, 1.4]], X, Y, c); });
        zrect(g, X, Y, -2.4, 0.6, 0.18, 0.35, A);
      },
      top(g, X, T) { ['#3fa9f5', '#1c3f94', '#e4002b'].forEach((c, i) => stripe(g, T, 0.16 + i * 0.1, 0.23 + i * 0.1, c)); },
    },
    line: {
      side(g, X, Y, A, B) { band(g, Y, 0, 0.36, B); band(g, Y, 0.52, 0.6, A); },
      top(g, X, T, A) { stripe(g, T, -0.06, 0.06, A); },
    },
    front: {
      side(g, X, Y, A, B) { poly(g, [[2.6, 0], [0.7, 0], [1.2, 1.4], [2.6, 1.4]], X, Y, A); band(g, Y, 0, 0.3, B); },
      top(g, X, T, A) { g.fillStyle = A; g.fillRect(X(1.0), 0, X(2.6) - X(1.0), 4096); },
    },
    sc: {
      side(g, X, Y, A, B) {
        for (let z = -2.6, k = 0; z < 2.6; z += 0.32, k++) { zrect(g, X, Y, z, z + 0.32, 0.46, 0.62, k % 2 ? A : B); zrect(g, X, Y, z, z + 0.32, 0.3, 0.46, k % 2 ? B : A); }
      },
      top(g, X, T, A, B) { stripe(g, T, -0.12, 0.12, B); },
    },
    stripe: {
      side(g, X, Y, A, B) { band(g, Y, 0.42, 0.5, A); band(g, Y, 0, 0.25, B); },
      top(g, X, T, A) { stripe(g, T, 0.08, 0.2, A); stripe(g, T, -0.2, -0.08, A); },
    },
  };
  const styleOf = (e) => STYLES[e.style] || STYLES.stripe;

  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // a race-number panel centred at (cx, cy), w x h px in the reading frame, turned by rot
  function numberPanel(g, cx, cy, w, h, num, rot) {
    g.save(); g.translate(cx, cy); if (rot) g.rotate(rot);
    g.fillStyle = '#ffffff'; roundRect(g, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.2); g.fill();
    const s = String(num);
    g.fillStyle = '#111111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(h * (s.length > 2 ? 0.74 : 0.9))}px ${FONT}`;
    g.fillText(s, 0, h * 0.05, w * 0.9);
    g.restore();
  }

  function liveryTex(e, S, F) {
    return NR.world.canvasTex(1024, 768, (g) => {
      const A = e.accent, B = e.accent2 || e.accent, st = styleOf(e), C = S.cabin;
      g.fillStyle = e.base; g.fillRect(0, 0, 1024, 768);
      // top view
      g.save(); g.beginPath(); g.rect(0, 0, 1024, 256); g.clip();
      st.top(g, AX, ROW_TOP, A, B);
      const dark = 'rgba(8,9,11,0.92)', line = 'rgba(0,0,0,0.38)';
      const slats = (z0, z1, f0, f1, n) => {
        zrect(g, AX, ROW_TOP, z0, z1, f0, f1, dark);
        g.strokeStyle = 'rgba(120,126,134,0.55)'; g.lineWidth = 2; g.beginPath();
        for (let k = 1; k < n; k++) { const x = AX(lerp(z0, z1, k / n)); g.moveTo(x, ROW_TOP(f0)); g.lineTo(x, ROW_TOP(f1)); }
        g.stroke();
      };
      if (!e.road) {
        // louvres over the front wheels, a bonnet vent, and on the front-engined cars a pair more
        [1, -1].forEach((s) => slats(S.axF - 0.22, S.axF + 0.24, s * 0.58, s * 0.88, 7));
        if (S.layout === 'front') [1, -1].forEach((s) => slats(C.z0 + 0.32, C.z0 + 0.78, s * 0.12, s * 0.4, 6));
        else slats(S.axF - 0.12, S.axF + 0.3, -0.3, 0.3, 6);
      }
      // bonnet shut line and pins
      g.strokeStyle = line; g.lineWidth = 2;
      g.strokeRect(AX(S.layout === 'front' ? C.z0 + 0.06 : S.axF - 0.32), ROW_TOP(0.62), AX(S.zf - 0.12) - AX(S.layout === 'front' ? C.z0 + 0.06 : S.axF - 0.32), ROW_TOP(-0.62) - ROW_TOP(0.62));
      [0.5, -0.5].forEach((f) => { g.fillStyle = '#1a1c1f'; g.beginPath(); g.arc(AX(S.zf - 0.3), ROW_TOP(f), 5, 0, Math.PI * 2); g.fill(); });
      g.restore();

      // the two sides
      [1, -1].forEach((sd) => {
        const X = sd > 0 ? (z) => 1024 - AX(z) : AX, Y = (y) => ROW_SIDE(sd, y);
        g.save(); g.beginPath(); g.rect(0, sd > 0 ? 256 : 512, 1024, 256); g.clip();
        st.side(g, X, Y, A, B);
        band(g, Y, 0, 0.19, '#121416');
        // door shut lines
        const d0 = S.doorZ + 0.62, d1 = S.doorZ - 0.6;
        g.strokeStyle = line; g.lineWidth = 2; g.beginPath();
        g.moveTo(X(d0), Y(0.2)); g.lineTo(X(d0 + 0.04), Y(F.belt(d0) - 0.01));
        g.moveTo(X(d1), Y(0.2)); g.lineTo(X(d1 - 0.05), Y(F.belt(d1) - 0.01));
        g.moveTo(X(d0), Y(0.2)); g.lineTo(X(d1), Y(0.2));
        g.stroke();
        if (!e.road) {
          // a vent behind the front wheel; a side intake ahead of the rear wheel on the mid-engined cars
          const v0 = S.axF - ARCH_R - 0.36, v1 = S.axF - ARCH_R - 0.06;
          poly(g, [[v0, 0.44], [v1, 0.44], [v1 + 0.05, 0.68], [v0 + 0.05, 0.68]], X, Y, dark);
          g.strokeStyle = 'rgba(120,126,134,0.5)'; g.lineWidth = 2; g.beginPath();
          for (let k = 1; k < 5; k++) { const y = lerp(0.44, 0.68, k / 5); g.moveTo(X(v0 + 0.05 * k / 5), Y(y)); g.lineTo(X(v1 + 0.05 * k / 5), Y(y)); }
          g.stroke();
          if (S.layout === 'mid') {
            const a = S.axR;
            const grd = g.createLinearGradient(X(a + 1.2), 0, X(a + 0.5), 0);
            grd.addColorStop(0, 'rgba(10,11,13,0.55)'); grd.addColorStop(1, 'rgba(6,7,8,0.97)');
            poly(g, [[a + 1.22, 0.7], [a + 0.62, 0.76], [a + 0.5, 0.36], [a + 0.98, 0.4]], X, Y, grd);
          }
        }
        // the number panel on the door (the safety car carries its name), and the class plate above it
        if (e.sc) {
          g.fillStyle = '#1a3a7a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 50px ${FONT}`;
          g.fillText('SAFETY CAR', X(S.doorZ), Y(0.72));
        } else {
          numberPanel(g, X(S.doorZ), Y(0.5), 0.62 * 204.8, 0.44 * 189.2, e.num);
          g.fillStyle = '#111111'; g.fillRect(X(S.doorZ) - 30, Y(0.79), 60, 22);
          g.fillStyle = '#ffd200'; g.font = `700 20px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('SP9', X(S.doorZ), Y(0.79) + 12);
        }
        g.restore();
      });
    });
  }

  // windows, pillars, roof (in body colour, with the top stripes), number and windscreen banner
  function cabinTex(e, S) {
    const C = S.cabin, st = styleOf(e);
    return NR.world.canvasTex(512, 512, (g, w, h) => {
      const U = (z) => ((z - C.z3) / (C.z0 - C.z3)) * w, V = (v) => (1 - v) * h;
      const A = e.accent, B = e.accent2 || e.accent, paint = e.base;
      g.fillStyle = '#0b1016'; g.fillRect(0, 0, w, h);
      const rect = (z0, z1, v0, v1, fill) => { g.fillStyle = fill; g.fillRect(U(z0), V(v1), U(z1) - U(z0), V(v0) - V(v1)); };
      // roof panel, or roof and engine cover on the mid-engined cars
      const roofBack = C.back === 'glass' ? C.z2 + 0.03 : C.z3;
      g.save(); g.beginPath(); g.rect(U(roofBack), V(0.75), U(C.z1 - 0.02) - U(roofBack), V(0.25) - V(0.75)); g.clip();
      g.fillStyle = paint; g.fillRect(0, 0, w, h);
      st.top(g, U, (f) => V(0.5 + 0.25 * f), A, B);
      g.restore();
      if (C.back === 'cover') {
        rect(C.z2 - 0.26, C.z2 + 0.02, 0.27, 0.73, '#0b1016');     // the small rear window
        g.fillStyle = 'rgba(8,9,11,0.9)';
        for (let z = C.z3 + 0.12; z < C.z2 - 0.4; z += 0.07) g.fillRect(U(z), V(0.66), U(z + 0.035) - U(z), V(0.34) - V(0.66));
      }
      // flanks: body colour along the waist, behind the side window and up the A-pillars
      rect(C.z3, C.z0, 0, 0.03, paint); rect(C.z3, C.z0, 0.97, 1, paint);
      const zq = C.back === 'glass' ? C.z2 - 0.32 : C.z2 - 0.05;
      [[0, 0.25, 1], [1, 0.75, -1]].forEach(([vb, vt, s]) => {
        g.beginPath(); g.moveTo(U(C.z3 - 0.05), V(vb)); g.lineTo(U(C.z3 - 0.05), V(vt)); g.lineTo(U(C.z2 + 0.06), V(vt));
        g.lineTo(U(zq), V(vb + s * 0.03)); g.closePath(); g.fillStyle = paint; g.fill();
        rect(C.z1 - 0.04, C.z0 + 0.05, vt - 0.02, vt + 0.02, paint);
      });
      // windscreen banner, read from the front
      const b0 = C.z1 - 0.01, b1 = C.z1 + 0.2 * (C.z0 - C.z1);
      rect(b0, b1, 0.26, 0.74, '#14161a');
      g.save(); g.translate((U(b0) + U(b1)) / 2, V(0.5)); g.rotate(-Math.PI / 2);
      g.fillStyle = '#f4f4f4'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 ${Math.round((U(b1) - U(b0)) * 0.72)}px ${FONT}`; g.fillText(e.sc ? 'SAFETY CAR' : 'NÜRBURGRING', 0, 1, (V(0.26) - V(0.74)) * 0.92);
      g.restore();
      // roof number, read from behind the car
      if (!e.sc) numberPanel(g, U((C.z1 + C.z2) / 2), V(0.5), (V(0.36) - V(0.64)), (0.4 / (C.z0 - C.z3)) * w, e.num, Math.PI / 2);
    });
  }

  // ---------- wheels ----------
  const RIM_R = 0.236;
  const rimCache = {}, wheelCache = {}, caliperMats = {};
  function rimMats(style, color, nut) {
    const key = style + color + nut;
    if (rimCache[key]) return rimCache[key];
    const { canvasTex, col } = NR.world;
    const draw = (blur) => canvasTex(256, 256, (g, w) => {
      const R = w / 2 - 2;
      g.translate(w / 2, w / 2);
      g.fillStyle = color; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.arc(0, 0, R * 0.87, 0, Math.PI * 2, true); g.fill('evenodd');
      if (blur) {
        const grd = g.createRadialGradient(0, 0, R * 0.24, 0, 0, R * 0.87);
        grd.addColorStop(0, color); grd.addColorStop(0.4, 'rgba(60,62,66,0.75)'); grd.addColorStop(1, 'rgba(40,42,45,0.55)');
        g.fillStyle = grd; g.beginPath(); g.arc(0, 0, R * 0.87, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'butt';
        const spoke = (a, w0, w1, r0, r1) => {
          g.save(); g.rotate(a); g.beginPath(); g.moveTo(r0, -w0 / 2); g.lineTo(r1, -w1 / 2); g.lineTo(r1, w1 / 2); g.lineTo(r0, w0 / 2); g.closePath(); g.fill(); g.restore();
        };
        const n = { '10': 5, Y: 6, '5': 5 }[style] || 5;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          if (style === '10') { spoke(a - 0.12, R * 0.14, R * 0.08, R * 0.2, R * 0.9); spoke(a + 0.12, R * 0.14, R * 0.08, R * 0.2, R * 0.9); }
          else if (style === 'Y') {
            spoke(a, R * 0.17, R * 0.12, R * 0.2, R * 0.56);
            g.lineWidth = R * 0.085;
            [-0.24, 0.24].forEach((da) => { g.beginPath(); g.moveTo(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52); g.lineTo(Math.cos(a + da) * R * 0.9, Math.sin(a + da) * R * 0.9); g.stroke(); });
          } else spoke(a, R * 0.3, R * 0.22, R * 0.2, R * 0.9);
        }
        // depth: the spokes darken towards the hub
        g.globalCompositeOperation = 'source-atop';
        const grd = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 0.9);
        grd.addColorStop(0, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0.08)');
        g.fillStyle = grd; g.fillRect(-R, -R, 2 * R, 2 * R);
        g.globalCompositeOperation = 'source-over';
      }
      g.fillStyle = color; g.beginPath(); g.arc(0, 0, R * 0.26, 0, Math.PI * 2); g.fill();
      g.fillStyle = nut; g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.lineTo(Math.cos(a) * R * 0.14, Math.sin(a) * R * 0.14); }
      g.closePath(); g.fill();
      g.fillStyle = '#1b1d20'; g.beginPath(); g.arc(0, 0, R * 0.05, 0, Math.PI * 2); g.fill();
    });
    return (rimCache[key] = {
      sharp: new THREE.MeshStandardMaterial({ map: draw(false), alphaTest: 0.5, metalness: 0.75, roughness: 0.3 }),
      blur: new THREE.MeshStandardMaterial({ map: draw(true), transparent: true, metalness: 0.6, roughness: 0.4, color: col('#ffffff') }),
    });
  }
  // tyre with rounded shoulders, rim barrel, brake disc and hub, in one vertex-coloured mesh per width and side
  function wheelGeos(w, sd) {
    const key = w + ':' + sd;
    if (wheelCache[key]) return wheelCache[key];
    const R = WHEEL_RAD, h = w / 2, r0 = RIM_R;
    const prof = [[r0 + 0.004, h - 0.02], [R - 0.07, h + 0.002], [R - 0.03, h - 0.008], [R - 0.008, h - 0.03], [R, h - 0.06],
      [R, -h + 0.06], [R - 0.008, -h + 0.03], [R - 0.03, -h + 0.008], [R - 0.07, -h - 0.002], [r0 + 0.004, -h + 0.02]];
    const tyre = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32);
    const rz = mat4(0, 0, 0, 0, 0, Math.PI / 2);
    const dark = mergeGeos([
      { geo: tyre, m: rz, color: '#151515' },
      { geo: new THREE.CylinderGeometry(r0 - 0.004, r0 - 0.004, w - 0.05, 28, 1, true), m: rz, color: '#2c2e32' },
      { geo: new THREE.CylinderGeometry(0.19, 0.19, 0.032, 28), m: mat4(sd * (h - 0.11), 0, 0, 0, 0, Math.PI / 2), color: '#55585d' },
      { geo: new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), m: mat4(sd * (h - 0.07), 0, 0, 0, 0, Math.PI / 2), color: '#1d1f22' },
    ]);
    const face = new THREE.CircleGeometry(r0 - 0.002, 40);
    face.rotateY(sd * Math.PI / 2); face.translate(sd * (h - 0.035), 0, 0);
    return (wheelCache[key] = { dark, face });
  }
  function buildWheels(S, root, mats) {
    const M = sharedMats(), wheels = [], rims = [];
    const rm = rimMats(S.rim[0], S.rim[1], '#c8102e'), rmB = rimMats(S.rim[0], S.rim[1], '#1c5fd1');
    const cal = caliperMats[S.caliper] || (caliperMats[S.caliper] = new THREE.MeshStandardMaterial({ color: NR.world.col(S.caliper), roughness: 0.4, metalness: 0.2 }));
    [[S.axF, 1], [S.axF, -1], [S.axR, 1], [S.axR, -1]].forEach(([z, sd], i) => {
      const w = i < 2 ? 0.29 : 0.31, G = wheelGeos(w, sd);
      const pivot = new THREE.Group(); pivot.position.set(sd * S.track, WHEEL_RAD, z);
      const spin = new THREE.Group(); pivot.add(spin);
      const dark = new THREE.Mesh(G.dark, M.wheel); dark.castShadow = true; spin.add(dark);
      const pair = sd > 0 ? rm : rmB;   // centre-lock nuts colour-coded left and right
      const face = new THREE.Mesh(G.face, pair.sharp); face.userData.mats = pair; spin.add(face); rims.push(face);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.15, 0.085), cal);
      c.position.set(sd * (w / 2 - 0.085), 0.155 * Math.cos(0.6), -0.155 * Math.sin(0.6)); c.rotation.x = Math.PI / 2 - 0.6;
      pivot.add(c);
      root.add(pivot);
      wheels.push({ pivot, spin, front: i < 2 });
    });
    mats.rims = rims;
    return wheels;
  }

  // ---------- aero: wing, splitter, canards, skirts, diffuser ----------
  function wingGeo(S, F) {
    const W = S.wing, c = W.chord, parts = [];
    // inverted cambered aerofoil, trailing edge up
    const N = 14, up = [], lo = [];
    for (let i = 0; i <= N; i++) {
      const s = 0.5 - 0.5 * Math.cos((i / N) * Math.PI);
      const yt = 0.5 * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s * s * s - 0.1036 * s * s * s * s);
      const yc = -0.07 * (s < 0.45 ? (2 * 0.45 * s - s * s) / 0.2025 : (1 - 2 * 0.45 + 2 * 0.45 * s - s * s) / 0.3025);
      up.push(new THREE.Vector2(s * c, (yc + yt) * c)); lo.push(new THREE.Vector2(s * c, (yc - yt) * c));
    }
    const foil = new THREE.Shape(up.concat(lo.reverse().slice(1, -1)));
    const plane = new THREE.ExtrudeGeometry(foil, { depth: W.span, bevelEnabled: false, curveSegments: 1 });
    const aoa = 0.2;
    plane.translate(-c / 2, 0, -W.span / 2); plane.rotateZ(aoa); plane.rotateY(Math.PI / 2); plane.translate(0, W.y, W.z);
    parts.push({ geo: plane });
    const teZ = W.z - (c / 2) * Math.cos(aoa), teY = W.y + (c / 2) * Math.sin(aoa);
    parts.push({ geo: new THREE.BoxGeometry(W.span, 0.03, 0.006), m: mat4(0, teY + 0.012, teZ + 0.004) });   // gurney flap
    [1, -1].forEach((sd) => {
      parts.push({ geo: sidePlate([[W.z + c / 2 + 0.05, W.y - 0.07], [W.z + c / 2 + 0.03, W.y + 0.05], [W.z - c / 2 - 0.05, W.y + 0.12], [W.z - c / 2 - 0.07, W.y - 0.12], [W.z, W.y - 0.13]], 0.012, sd * (W.span / 2 + 0.006)) });
      // swan-neck pylon from the deck up, over and down onto the wing
      const zb = W.z + 0.32, deck = F.topY(zb, 0.32) - 0.03;
      const curvePts = new THREE.CubicBezierCurve(new THREE.Vector2(zb, deck), new THREE.Vector2(zb - 0.03, W.y + 0.12),
        new THREE.Vector2(W.z + 0.1, W.y + 0.13), new THREE.Vector2(W.z + 0.02, W.y - 0.005)).getPoints(16);
      const outl = [], inl = [];
      curvePts.forEach((p, i) => {
        const q = curvePts[Math.min(i + 1, 16)], r = curvePts[Math.max(i - 1, 0)], tx = q.x - r.x, ty = q.y - r.y, l = Math.hypot(tx, ty) || 1;
        const half = lerp(0.035, 0.018, i / 16);
        outl.push([p.x - (ty / l) * half, p.y + (tx / l) * half]); inl.push([p.x + (ty / l) * half, p.y - (tx / l) * half]);
      });
      parts.push({ geo: sidePlate(outl.concat(inl.reverse()), 0.016, sd * 0.32) });
    });
    return mergeGeos(parts);
  }
  function splitterGeo(S, F) {
    // the nose's outline at bumper height, 3 cm wider and reaching 5 cm further forward
    const zb = S.axF + ARCH_R + 0.05, right = [];
    let x0 = 0;
    for (let k = 0; k <= 30; k++) {
      const z = lerp(zb, S.zf, 1 - Math.pow(1 - k / 30, 2.2)), x = k < 30 ? F.half(z, F.bottom(z) + 0.004) : 0;
      if (!k) x0 = x;
      const p = [x + 0.03, z + 0.05 * (1 - x / x0)];
      if (!right.length || Math.hypot(p[0] - right[right.length - 1][0], p[1] - right[right.length - 1][1]) > 1e-3) right.push(p);
    }
    right[right.length - 1][0] = 0;
    const outline = right.concat(right.slice(0, -1).reverse().map(([x, z]) => [-x, z]));
    const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.024, bevelEnabled: false, curveSegments: 2 });
    g.rotateX(Math.PI / 2); g.translate(0, 0.122, 0);
    return g;
  }
  function aeroGeo(S, F, G, road) {
    const parts = [], C = S.cabin;
    // side skirts between the arches
    const s0 = S.axR + ARCH_R + 0.06, s1 = S.axF - ARCH_R - 0.06, sm0 = (s0 + s1) / 2;
    [1, -1].forEach((sd) => parts.push({ geo: new THREE.BoxGeometry(0.05, 0.07, s1 - s0), m: mat4(sd * (F.half(sm0, 0.15) + 0.012), 0.105, sm0) }));
    // diffuser: a floor sweeping up to the tail, with strakes
    const d0 = S.zr + 0.02, d1 = S.zr + 0.72, ang = Math.atan2(0.2, d1 - d0);
    parts.push({ geo: new THREE.BoxGeometry(1.5, 0.012, d1 - d0), m: mat4(0, 0.22, (d0 + d1) / 2, ang) });
    [-0.55, -0.2, 0.2, 0.55].forEach((x) => parts.push({ geo: sidePlate([[d0 + 0.04, 0.18], [d0 + 0.04, 0.33], [d1, 0.13]], 0.012, x) }));
    // mirrors' stalks and glass
    const zm = C.z0 - 0.24;
    [1, -1].forEach((sd) => {
      const b = G.gb(zm), y = G.yb(zm);
      parts.push({ geo: new THREE.CylinderGeometry(0.012, 0.012, 1, 6), m: tubeMat(new THREE.Vector3(sd * (b + 0.02), y + 0.02, zm + 0.03), new THREE.Vector3(sd * (b + 0.17), y + 0.11, zm)) });
      parts.push({ geo: new THREE.CircleGeometry(1, 16), m: mat4(sd * (b + 0.22), y + 0.13, zm - 0.068, 0, Math.PI, 0, 0.085, 0.045, 1), color: '#30353b' });
    });
    if (!road) {
      // dive planes on the front corners
      [1, -1].forEach((sd) => [[0.34, 0.36], [0.26, 0.47]].forEach(([back, y]) => {
        const z = S.zf - back;
        parts.push({ geo: new THREE.BoxGeometry(0.16, 0.008, 0.2), m: mat4(sd * (F.half(z, y) + 0.03), y, z, 0, sd * 0.55, -sd * 0.22) });
      }));
    }
    return mergeGeos(parts, '#15171a');
  }
  function mirrorGeo(S, G) {
    const C = S.cabin, zm = C.z0 - 0.24, parts = [];
    [1, -1].forEach((sd) => parts.push({ geo: new THREE.SphereGeometry(1, 16, 10), m: mat4(sd * (G.gb(zm) + 0.22), G.yb(zm) + 0.13, zm, 0, 0, 0, 0.1, 0.055, 0.07) }));
    return mergeGeos(parts);
  }

  // ---------- shared materials ----------
  let MAT = null;
  function sharedMats() {
    if (MAT) return MAT;
    const { col, TEX } = NR.world;
    MAT = {
      glass: new THREE.MeshPhysicalMaterial({ color: col('#0b1015'), metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 }),
      carbon: new THREE.MeshStandardMaterial({ color: col('#15171a'), roughness: 0.42, metalness: 0.35 }),
      carbonV: new THREE.MeshStandardMaterial({ color: col('#ffffff'), vertexColors: true, roughness: 0.7, metalness: 0.1, envMapIntensity: 0.35 }),
      aero: new THREE.MeshStandardMaterial({ color: col('#121417'), roughness: 0.6, metalness: 0.15, envMapIntensity: 0.45 }),
      chassis: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }),
      wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.25, side: THREE.DoubleSide }),
      tire: new THREE.MeshStandardMaterial({ color: col('#161616'), roughness: 0.93 }),
      rim: new THREE.MeshStandardMaterial({ color: col('#b9bec4'), roughness: 0.28, metalness: 0.9 }),
      rimDark: new THREE.MeshStandardMaterial({ color: col('#2a2d31'), roughness: 0.35, metalness: 0.8 }),
      head: new THREE.MeshStandardMaterial({ color: col('#ffffff'), emissive: col('#fff6dd'), emissiveIntensity: 1.2, roughness: 0.1 }),
      blob: new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, color: 0xffffff }),
      dash: new THREE.MeshStandardMaterial({ color: col('#1b1d20'), roughness: 0.85 }),
      cage: new THREE.MeshStandardMaterial({ color: col('#2d3136'), roughness: 0.5, metalness: 0.5 }),
      screen: new THREE.MeshBasicMaterial({ color: col('#0b2a3a') }),
    };
    MAT.lamps = [MAT.head];   // every headlamp material; weather.js brightens them at night and in rain
    return MAT;
  }
  const decalMat = (o) => new THREE.MeshStandardMaterial(Object.assign({ alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, o));
  const lampCache = {};
  function lampMat(brand) {
    if (lampCache[brand]) return lampCache[brand];
    const t = faceTextures(brand).lamps, m = decalMat({ map: t, emissive: NR.world.col('#fff6dd'), emissiveMap: t, emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.1 });
    sharedMats().lamps.push(m);
    return (lampCache[brand] = m);
  }
  const fasciaCache = {};
  function fasciaMats(brand) {
    if (fasciaCache[brand]) return fasciaCache[brand];
    const T = faceTextures(brand);
    return (fasciaCache[brand] = { face: decalMat({ map: T.face, roughness: 0.5, metalness: 0.3 }), rear: decalMat({ map: T.rear, roughness: 0.5, metalness: 0.3 }) });
  }

  // ---------- a GT3 car ----------
  function buildModel(e) {
    const { col } = NR.world;
    const M = sharedMats();
    const brand = e.body || e.brand, S = SPECS[brand], C = S.cabin;
    const road = !!e.road, geo = bodyGeos(S, brand), F = geo.F, G = geo.G;
    const root = new THREE.Group();   // placed on the road
    const body = new THREE.Group();   // rolls / pitches on suspension
    root.add(body);
    const mesh = (g, m, parent, shadow) => { const o = new THREE.Mesh(g, m); if (shadow) o.castShadow = true; (parent || body).add(o); return o; };

    const paint = new THREE.MeshPhysicalMaterial({ map: liveryTex(e, S, F), metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
    const shell = mesh(geo.body, paint, body, true);
    mesh(geo.chassis, M.chassis, body, true);
    const glass = new THREE.Group(); body.add(glass);
    mesh(geo.cabin, new THREE.MeshPhysicalMaterial({ map: cabinTex(e, S), metalness: 0.3, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.2 }), glass, true);

    // nose and tail decals: fascia, lamps and the tail lamps (whose glow brakes and night turn up)
    const FM = fasciaMats(brand), T = faceTextures(brand);
    if (!geo.dFace) {
      geo.dFace = decalGeo(geo.decals.front, 0.005, T.face); geo.dLamp = decalGeo(geo.decals.front, 0.009, T.lamps);
      geo.dRear = decalGeo(geo.decals.rear, 0.005, T.rear); geo.dTail = decalGeo(geo.decals.rear, 0.009, T.tail);
      geo.wing = wingGeo(S, F); geo.splitter = splitterGeo(S, F);
      geo.mirrors = mirrorGeo(S, G);
    }
    const aeroKey = road ? 'aeroRoad' : 'aero';
    if (!geo[aeroKey]) geo[aeroKey] = aeroGeo(S, F, G, road);
    mesh(geo.dFace, FM.face); mesh(geo.dLamp, lampMat(brand)); mesh(geo.dRear, FM.rear);
    const tail = decalMat({ map: T.tail, color: col('#ffffff'), emissive: col('#ff1a1a'), emissiveMap: T.tail, emissiveIntensity: 0.5, roughness: 0.3 });
    mesh(geo.dTail, tail);
    mesh(geo[aeroKey], M.carbonV, body, true);
    const solid = new THREE.MeshPhysicalMaterial({ color: col(e.base), metalness: 0.35, roughness: 0.32, clearcoat: 1 });
    mesh(geo.mirrors, solid, body, true);
    const wing = mesh(geo.wing, M.aero, body, true);
    const splitter = mesh(geo.splitter, M.aero, body, true);

    // on the roof: an aerial, and the Lamborghini's air scoop
    const roof = new THREE.Group(); body.add(roof);
    const rz = (C.z1 + C.z2) / 2, ry = G.line(rz);
    mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.3, 5), M.aero, roof).position.set(0, G.line(C.z2 + 0.1) + 0.14, C.z2 + 0.1);
    if (C.scoop) {
      const sc = mesh(new THREE.BoxGeometry(0.34, 0.09, 0.55), solid, roof, true); sc.position.set(0, ry + 0.03, C.z2 + 0.1);
      mesh(new THREE.PlaneGeometry(0.3, 0.07), M.aero, roof).position.set(0, ry + 0.035, C.z2 + 0.376);
    }

    const rims = {};
    const wheels = buildWheels(S, root, rims);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 5.4), M.blob);
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; root.add(blob);

    // cabin view: the cockpit's dash and pillars meet this windscreen
    const off = new THREE.Vector3(0, G.yb(C.z0) - 0.88, C.z0 - 0.78);
    const a = C.z1 - 0.05, b = C.z2 + 0.05;
    return {
      root, body, shell, glass, roof, wheels, tail, blob, wing, splitter, screenZ: C.z0,
      nose: S.zf, rearZ: S.axR, wheelR: WHEEL_RAD, rims: rims.rims,
      engineZ: S.layout === 'front' ? S.axF + 0.3 : S.layout === 'mid' ? S.axR + 0.4 : S.axR - 0.45,
      eye: new THREE.Vector3(0.36, 1.06, -0.3).add(off), cockpitAt: off,
      roofTop: { y: ry - 0.02, z: rz, pitch: -Math.atan2(G.line(a) - G.line(b), a - b) },
    };
  }

  // ---------- the bus ----------
  // A double-decker on the same rig as the cars: the wing slot holds the roof flag (a heavy hit tears it
  // off), the splitter slot the front bumper and plate. Everything but the red shell sits in `glass`, so
  // the cabin view hides it and clips the shell away behind the windscreen, as it does for the cars.
  const BUS = { len: 10.2, wid: 2.5, high: 4.3, wheelR: 0.5, axleF: 2.9, axleR: -2.3 };
  function numberTex(e) {
    return NR.world.canvasTex(256, 200, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.46, h * 0.44, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111111'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${String(e.num).length > 2 ? 104 : 136}px ${FONT}`;
      g.fillText(String(e.num), w / 2, h / 2 + 8);
    });
  }
  function signTex(text, w, h, bg, ink, size, border) {
    return NR.world.canvasTex(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      if (border) { g.fillStyle = border; g.fillRect(0, 0, w, h * 0.1); g.fillRect(0, h * 0.9, w, h * 0.1); }
      g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 ${size}px ${FONT}`;
      g.fillText(text, w / 2, h / 2 + size * 0.06);
    });
  }
  // the Parkroyal Community School crest, in a unit box: a crown of two uprights either side of a diamond
  // standing on a wide triangle
  const CREST = [
    [[0, 0], [0.16, 0], [0.36, 0.41], [0.05, 1], [0, 1]],
    [[1, 0], [0.84, 0], [0.64, 0.41], [0.95, 1], [1, 1]],
    [[0.5, 0], [0.64, 0.4], [0.5, 0.57], [0.36, 0.4]],
    [[0.5, 0.56], [0.94, 1], [0.06, 1]],
  ];
  function drawCrest(g, x, y, w, h) {
    CREST.forEach((poly) => {
      g.beginPath();
      poly.forEach(([u, v], i) => (i ? g.lineTo(x + u * w, y + v * h) : g.moveTo(x + u * w, y + v * h)));
      g.closePath(); g.fill();
    });
  }
  // the school's name between the decks, crest first, on a clear canvas so the red paint shows through
  function schoolSideTex(cream) {
    return NR.world.canvasTex(2048, 112, (g, w, h) => {
      g.fillStyle = cream; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
      const text = 'PARKROYAL COMMUNITY SCHOOL', ch = 80, cw = ch * 1.29, gap = 28;
      g.font = `800 92px ${FONT}`; g.textBaseline = 'middle';
      const x0 = (w - (cw + gap + g.measureText(text).width)) / 2;
      g.fillStyle = '#ffffff';
      drawCrest(g, x0, (h - ch) / 2, cw, ch);
      g.fillText(text, x0 + cw + gap, h / 2 + 5);
    });
  }
  // the crest over the name, laid out as on the school's bag, for the back of the bus
  function schoolBackTex() {
    return NR.world.canvasTex(512, 320, (g, w) => {
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      drawCrest(g, (w - 190) / 2, 14, 190, 148);
      g.font = `800 78px ${FONT}`; g.fillText('PARKROYAL', w / 2, 212, w * 0.94);
      g.font = `700 50px ${FONT}`; g.fillText('COMMUNITY SCHOOL', w / 2, 280, w * 0.94);
    });
  }
  function buildBusModel(e) {
    const { col } = NR.world;
    const M = sharedMats();
    const { len: BL, wid: BW, high: H, wheelR: WR } = BUS;
    const ZF = BL / 2, XS = BW / 2, FLOOR = 0.42;
    const root = new THREE.Group(), body = new THREE.Group(), glass = new THREE.Group();
    root.add(body); body.add(glass);
    const add = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (parent || body).add(m); return m; };
    const box = (w, h, d, x, y, z, mat, parent) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
    const sign = (w, h, map, x, y, z, ry, parent) => { const m = add(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: 0.5 }), x, y, z, parent || glass); m.rotation.y = ry; return m; };

    const paint = new THREE.MeshPhysicalMaterial({ color: col(e.base), metalness: 0.2, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
    const shell = box(BW, H - FLOOR, BL, 0, (H + FLOOR) / 2, 0, paint);
    const roof = box(BW - 0.12, 0.08, BL - 0.16, 0, H + 0.04, 0, paint);
    const numMat = new THREE.MeshStandardMaterial({ map: numberTex(e), transparent: true, roughness: 0.4 });
    add(new THREE.PlaneGeometry(1.5, 1.16), numMat, 0, 0.045, 0.6, roof).rotation.set(-Math.PI / 2, 0, Math.PI); // reads from behind, like the cars'

    // windows on both decks, window pillars, the school's name between the decks, race numbers, wheel arches
    const school = new THREE.MeshStandardMaterial({ map: schoolSideTex(e.accent), transparent: true, roughness: 0.4 });
    const LOW = [1.36, 2.12], UP = [2.72, 3.62], LY = (LOW[0] + LOW[1]) / 2, UY = (UP[0] + UP[1]) / 2;
    [-1, 1].forEach((sd) => {
      const x = sd * (XS + 0.012);
      // the door is on the +x side, ahead of the front axle
      if (sd > 0) {
        box(0.02, LOW[1] - LOW[0], 7.9, x, LY, -0.75, M.glass, glass);
        box(0.02, LOW[1] - 0.55, 1.0, x, (LOW[1] + 0.55) / 2, 4.25, M.glass, glass);
      } else box(0.02, LOW[1] - LOW[0], 9.3, x, LY, -0.05, M.glass, glass);
      box(0.02, UP[1] - UP[0], BL - 0.7, x, UY, 0, M.glass, glass);
      for (let z = -3.9; z < 4.6; z += 1.3) {
        box(0.03, UP[1] - UP[0] + 0.02, 0.1, sd * (XS + 0.02), UY, z, paint);
        if (sd < 0 || z < 3.2) box(0.03, LOW[1] - LOW[0] + 0.02, 0.1, sd * (XS + 0.02), LY, z, paint);
      }
      add(new THREE.PlaneGeometry(BL - 0.4, (BL - 0.4) * 112 / 2048), school, sd * (XS + 0.016), 2.42, 0, glass).rotation.y = sd * Math.PI / 2;
      add(new THREE.PlaneGeometry(0.95, 0.74), numMat, sd * (XS + 0.016), 0.95, 1.0, glass).rotation.y = sd * Math.PI / 2;
      [BUS.axleF, BUS.axleR].forEach((z) => { add(new THREE.CircleGeometry(0.66, 20, 0, Math.PI), M.tire, sd * (XS + 0.008), WR, z, glass).rotation.y = sd * Math.PI / 2; });
    });

    // front: windscreen, destination blind, upper windows, lamps, grille, mirrors
    const zf = ZF + 0.012;
    box(BW - 0.24, 1.3, 0.02, 0, 1.62, zf, M.glass, glass);
    sign(BW - 0.5, 0.3, signTex('NORDSCHLEIFE', 512, 64, '#141414', '#ffb300', 46), 0, 2.45, zf + 0.012, 0);
    [-1, 1].forEach((sd) => {
      box(1.08, 0.86, 0.02, sd * 0.6, UY, zf, M.glass, glass);
      box(0.36, 0.2, 0.04, sd * 0.92, 0.72, zf, M.head, glass);
      box(0.04, 0.04, 0.55, sd * (XS - 0.06), 2.3, ZF + 0.25, M.carbon, glass);
      box(0.08, 0.4, 0.22, sd * (XS + 0.02), 2.08, ZF + 0.5, M.carbon, glass);
    });
    box(1.1, 0.3, 0.03, 0, 0.68, zf, M.carbon, glass);
    const splitter = box(BW + 0.04, 0.26, 0.16, 0, 0.36, ZF + 0.07, M.carbon);
    sign(0.72, 0.155, signTex(e.reg, 256, 56, '#f4f4ef', '#111111', 46), 0, 0, 0.082, 0, splitter);

    // rear: upper window, engine grille, lamps, bumper and the yellow plate
    const tail = new THREE.MeshStandardMaterial({ color: col('#5a0000'), emissive: col('#ff1a1a'), emissiveIntensity: 0.5, roughness: 0.3 });
    const zr = -(ZF + 0.012);
    box(BW - 0.5, 0.8, 0.02, 0, UY, zr, M.glass, glass);
    box(BW - 0.6, 0.5, 0.03, 0, 1.05, zr, M.carbon, glass);
    [-1, 1].forEach((sd) => box(0.2, 0.42, 0.04, sd * (XS - 0.18), 0.95, zr, tail, glass));
    box(BW + 0.04, 0.24, 0.14, 0, 0.36, -(ZF + 0.06), M.carbon, glass);
    sign(0.72, 0.155, signTex(e.reg, 256, 56, '#f7c600', '#111111', 46), 0, 0.64, zr - 0.012, Math.PI);
    const crest = new THREE.MeshStandardMaterial({ map: schoolBackTex(), transparent: true, roughness: 0.4 });
    add(new THREE.PlaneGeometry(1.6, 1.0), crest, 0, 2.0, zr - 0.012, glass).rotation.y = Math.PI;

    // the roof flag on its pole, streaming backwards; the far side carries a mirrored copy so it reads both ways
    const wing = new THREE.Group(); body.add(wing);
    const poleZ = -ZF + 0.9;
    add(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8), M.rim, 0, H + 1.0, poleZ, wing);
    const flagGeo = new THREE.PlaneGeometry(1.5, 0.95, 12, 1);
    flagGeo.translate(0.75, 0, 0);
    const front = signTex(e.reg, 256, 160, '#ffffff', '#111111', 76, e.base);
    const back = front.clone(); back.wrapS = THREE.RepeatWrapping; back.repeat.x = -1; back.needsUpdate = true;
    [[front, THREE.FrontSide], [back, THREE.BackSide]].forEach(([map, side]) => {
      add(flagGeo, new THREE.MeshStandardMaterial({ map, side, roughness: 0.8 }), 0, H + 1.5, poleZ, wing).rotation.y = Math.PI / 2;
    });
    body.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    const wheels = [];
    [[BUS.axleF, 1], [BUS.axleF, -1], [BUS.axleR, 1], [BUS.axleR, -1]].forEach(([z, sd], i) => {
      const tw = i < 2 ? 0.3 : 0.42; // twin tyres at the back
      const pivot = new THREE.Group();
      pivot.position.set(sd * (XS + 0.05 - tw / 2), WR, z);
      const spin = new THREE.Group(); pivot.add(spin);
      add(new THREE.CylinderGeometry(WR, WR, tw, 24), M.tire, 0, 0, 0, spin).rotation.z = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.3, 0.3, tw + 0.01, 18), M.rim, 0, 0, 0, spin).rotation.z = Math.PI / 2;
      for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.02, 0.58, 0.07), M.rimDark, sd * (tw / 2 + 0.006), 0, 0, spin).rotation.x = (k / 3) * Math.PI;
      pivot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      root.add(pivot);
      wheels.push({ pivot, spin, front: i < 2 });
    });

    const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 11.6), M.blob);
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; root.add(blob);

    return {
      root, body, shell, glass, roof, wheels, tail, blob, wing, splitter, screenZ: ZF - 0.05,
      len: BL - 0.5, wid: BW - 0.05, wheelR: WR, rearZ: BUS.axleR, nose: ZF, frame: 11, aimY: 1.9, engineZ: -ZF + 0.8,
      eye: new THREE.Vector3(0.6, 2.25, ZF - 1.0), cockpitAt: new THREE.Vector3(0.24, 1.19, ZF - 0.7), // the cars' cockpit, raised and moved forward
      flag: { geo: flagGeo, rest: flagGeo.attributes.position.array.slice(), t: 0 },
    };
  }

  // ---------- the cockpit (cabin camera) ----------
  const tube = (a, b, r, mat) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  function buildCockpit() {
    const M = sharedMats();
    const g = new THREE.Group();
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const box = (w, h, d, x, y, z, mat, rx) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); if (rx) m.rotation.x = rx; g.add(m); return m;
    };
    box(1.6, 0.04, 1.35, 0, 0.8, -0.3, M.dash);              // cockpit floor / seat area
    [-1, 1].forEach((sd) => box(0.08, 0.12, 1.55, sd * 0.78, 0.9, -0.12, M.dash)); // door cards
    box(1.6, 0.1, 0.4, 0, 0.82, 0.6, M.dash);                // dashboard (top at 0.87)
    box(0.3, 0.06, 0.12, 0.36, 0.89, 0.44, M.dash, -0.25);   // instrument binnacle
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), M.screen);
    scr.position.set(0.36, 0.895, 0.375); scr.rotation.set(0.25, Math.PI, 0); g.add(scr);
    const wheel = new THREE.Group();
    wheel.position.set(0.36, 0.84, 0.13); wheel.rotation.x = -0.32;
    const rimW = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.018, 8, 28, Math.PI * 1.55), M.dash);
    rimW.rotation.z = -Math.PI * 0.275; wheel.add(rimW);
    const flat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.028, 0.028), M.dash);
    flat.position.y = -0.09; wheel.add(flat);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.04), M.cage); wheel.add(hub);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.045), M.screen);
    disp.position.set(0, 0.012, -0.025); disp.rotation.y = Math.PI; wheel.add(disp);
    g.add(wheel);
    // A-pillars, windscreen header, roof liner, cage tubes, mirror
    g.add(tube(V(0.72, 0.88, 0.76), V(0.58, 1.16, -0.02), 0.024, M.cage));
    g.add(tube(V(-0.72, 0.88, 0.76), V(-0.58, 1.16, -0.02), 0.024, M.cage));
    g.add(tube(V(-0.58, 1.16, -0.02), V(0.58, 1.16, -0.02), 0.014, M.cage));
    g.add(tube(V(0.74, 0.97, 0.55), V(0.76, 0.99, -0.9), 0.026, M.cage));
    g.add(tube(V(0.6, 1.12, -0.95), V(-0.6, 1.12, -0.95), 0.03, M.cage));
    box(1.2, 0.025, 1.0, 0, 1.19, -0.52, M.dash);            // roof liner
    box(0.26, 0.06, 0.025, 0, 1.09, 0.04, M.cage);            // rear-view mirror
    return { group: g, wheel };
  }

  NR.buildCarModel = (e) => (e.type === 'bus' ? buildBusModel(e) : buildModel(e));
  NR.carMaterials = sharedMats;
  NR.buildCockpit = buildCockpit;
  NR.drawCrest = drawCrest; // the fans' Parkroyal flags carry it too
})();
