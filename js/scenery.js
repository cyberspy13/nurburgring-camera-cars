// scenery.js — forests, start/finish complex, Nürburg castle, village, signs, spectator areas.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});

  // ======================= spectators =======================
  // A spectator is built from instanced body parts (torso, head, hair or cap, two arms, two hands,
  // two thighs, two shins with shoes) that are posed every frame from a handful of joint angles.
  // Each crowd area gets its own set of instanced meshes, so areas off screen are culled by the
  // renderer and only crowds near the camera are re-posed.
  function createCrowd(scene) {
    const { col, canvasTex } = NR.world;
    let seed = 0x5eed;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    const pick = (a) => a[(rnd() * a.length) | 0];
    const lerp = (a, b, k) => a + (b - a) * k;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    // ----- part geometry: indexed merge with a grey tint per piece (shoes, chair frames come out darker) -----
    const M = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
      new THREE.Vector3(sx || 1, sy || 1, sz || 1));
    function mergeParts(parts) {
      const pos = [], nor = [], colr = [], uv = [], idx = [];
      const nm = new THREE.Matrix3(), v = new THREE.Vector3();
      parts.forEach(({ geo, m, tint }) => {
        const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, base = pos.length / 3;
        const k = tint == null ? 1 : tint;
        nm.getNormalMatrix(m);
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
          colr.push(k, k, k);
          uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
        }
        if (geo.index) for (let i = 0; i < geo.index.count; i++) idx.push(base + geo.index.getX(i));
        else for (let i = 0; i < P.count; i++) idx.push(base + i);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    }
    const Cyl = (rt, rb, h, n) => new THREE.CylinderGeometry(rt, rb, h, n, 1, true);
    const CylC = (rt, rb, h, n) => new THREE.CylinderGeometry(rt, rb, h, n);
    const Sph = (r, w, h, tl) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, tl || Math.PI);
    const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
    const forearm = (y, extra) => new THREE.Matrix4().multiplyMatrices(M(0, -0.29, 0, -0.22), extra ? M(0, y, 0).multiply(extra) : M(0, y, 0));

    // Pivots: torso at the pelvis, head/hair at the base of the neck, arms at the shoulder,
    // thighs at the hip joint, shins at the knee. Every person faces +z.
    const hairCap = { geo: Sph(0.106, 10, 4, Math.PI * 0.6), m: M(0, 0.182, -0.006, -0.5, 0, 0, 0.93, 1.08, 1.03) };
    const GEO = {
      torso: mergeParts([
        { geo: Cyl(0.158, 0.15, 0.22, 10), m: M(0, 0.13, 0, 0, 0, 0, 1, 1, 0.7) },
        { geo: Cyl(0.194, 0.158, 0.27, 10), m: M(0, 0.37, 0, 0, 0, 0, 1, 1, 0.68) },
        { geo: Sph(0.194, 10, 3, Math.PI / 2), m: M(0, 0.505, 0, 0, 0, 0, 1, 0.33, 0.68) },
      ]),
      head: mergeParts([
        { geo: Cyl(0.05, 0.057, 0.14, 6), m: M(0, 0.04, 0) },
        { geo: Sph(0.1, 10, 7), m: M(0, 0.178, 0.004, 0, 0, 0, 0.88, 1.06, 0.98) },
        { geo: Sph(0.068, 7, 4), m: M(0, 0.118, 0.03, 0, 0, 0, 1, 0.8, 1) },
        { geo: Box(0.024, 0.042, 0.03), m: M(0, 0.162, 0.098, -0.25) },
      ]),
      hair: mergeParts([hairCap]),
      hairLong: mergeParts([hairCap, { geo: Sph(0.1, 7, 5), m: M(0, 0.075, -0.055, 0.12, 0, 0, 0.95, 1.5, 0.5) }]),
      cap: mergeParts([
        { geo: Sph(0.11, 10, 3, Math.PI / 2), m: M(0, 0.19, -0.004, 0, 0, 0, 0.93, 0.92, 1.03) },
        { geo: Box(0.16, 0.014, 0.1), m: M(0, 0.196, 0.132, 0.12) },
      ]),
      beanie: mergeParts([
        { geo: Sph(0.111, 10, 4, Math.PI * 0.56), m: M(0, 0.186, -0.004, -0.12, 0, 0, 0.93, 1.12, 1.03) },
        { geo: Sph(0.032, 5, 3), m: M(0, 0.312, -0.01) },
      ]),
      sleeve: mergeParts([
        { geo: Sph(0.064, 6, 4), m: M(0, -0.012, 0) },
        { geo: Cyl(0.054, 0.046, 0.3, 6), m: M(0, -0.15, 0) },
        { geo: Sph(0.047, 6, 3), m: M(0, -0.29, 0) },
        { geo: Cyl(0.046, 0.037, 0.26, 6), m: forearm(-0.13) },
      ]),
      hand: mergeParts([{ geo: Sph(0.045, 5, 4), m: forearm(-0.3, M(0, 0, 0, 0, 0, 0, 0.72, 1.25, 0.55)) }]),
      thigh: mergeParts([
        { geo: Sph(0.108, 7, 5), m: M(0, -0.005, 0, 0, 0, 0, 1, 0.9, 1.08) },
        { geo: Cyl(0.092, 0.064, 0.42, 7), m: M(0, -0.23, 0) },
      ]),
      shin: mergeParts([
        { geo: Sph(0.066, 6, 4), m: M(0, 0, 0) },
        { geo: Cyl(0.062, 0.045, 0.4, 7), m: M(0, -0.2, 0) },
        { geo: Box(0.094, 0.07, 0.18), m: M(0, -0.455, 0.03), tint: 0.22 },
        { geo: Sph(0.05, 6, 3), m: M(0, -0.462, 0.12, 0, 0, 0, 0.95, 0.62, 1.15), tint: 0.22 },
      ]),
      chair: mergeParts([
        { geo: Box(0.5, 0.035, 0.44), m: M(0, 0.42, 0) },
        { geo: Box(0.5, 0.5, 0.03), m: M(0, 0.69, -0.25, -0.2) },
        ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => ({ geo: CylC(0.012, 0.012, 0.44, 5), m: M(a * 0.23, 0.21, b * 0.19, b * 0.12, 0, 0), tint: 0.25 })),
        ...[-1, 1].map((a) => ({ geo: Box(0.04, 0.03, 0.42), m: M(a * 0.27, 0.62, 0), tint: 0.3 })),
        ...[-1, 1].map((a) => ({ geo: CylC(0.012, 0.012, 0.2, 5), m: M(a * 0.27, 0.52, 0.17), tint: 0.25 })),
      ]),
      seat: mergeParts([
        { geo: Box(0.44, 0.05, 0.38), m: M(0, 0.42, -0.14) },
        { geo: Box(0.44, 0.36, 0.045), m: M(0, 0.63, -0.34, -0.12) },
        { geo: Box(0.07, 0.4, 0.07), m: M(0, 0.2, -0.22), tint: 0.35 },
      ]),
      phone: new THREE.BoxGeometry(0.075, 0.15, 0.012),
      pole: (() => { const g = CylC(0.012, 0.012, 1.15, 5); g.translate(0, 0.35, 0); return g; })(),
      cloth: (() => { const g = new THREE.PlaneGeometry(0.62, 0.4); g.translate(0.31, 0.72, 0); return g; })(),
    };
    const HAND = new THREE.Vector3(0, -0.583, 0.066); // centre of the hand in arm space
    const PHONE_LOCAL = new THREE.Matrix4().makeTranslation(0, -0.6, 0.09);

    const mat = (o) => new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: 0.88, vertexColors: true }, o));
    const MAT = { cloth: mat({}), skin: mat({ roughness: 0.6 }), hair: mat({ roughness: 0.72 }), plastic: mat({ roughness: 0.45 }) };
    // key → geometry, material, instances per person, casts shadow
    const PARTS = [
      ['torso', 'cloth', 1, true], ['head', 'skin', 1, true], ['sleeve', 'cloth', 2, true], ['hand', 'skin', 2, false],
      ['thigh', 'cloth', 2, true], ['shin', 'cloth', 2, true],
    ];
    const HEADWEAR = ['hair', 'hairLong', 'cap', 'beanie'];

    const SKIN = ['#f2d0b5', '#ebc09d', '#dcaa84', '#c4906a', '#a5704b', '#7b4d31', '#5c3a25'];
    const HAIR = ['#1c1510', '#2e2018', '#4a3020', '#6b4a2c', '#8c6a42', '#b8925c', '#d8bf86', '#7c7c7c', '#bdb8ae', '#8a3a1c'];
    // tops include the colours of the cars' liveries, worn by their fans
    const TOPS = ['#ff7a00', '#ff7a00', '#f4f5f6', '#1c3f94', '#c3c8cd', '#00a19b', '#00513f', '#c4d600', '#c8102e', '#c40d0d', '#ffd200', '#8fc31f',
      '#16181b', '#16181b', '#23272e', '#2b3a55', '#3e4a59', '#e8e4da', '#7a1f2b', '#2f6b3a', '#e2621b', '#1f6fb8', '#b9bec4', '#f2c230', '#0d2c5a'];
    const BOTTOMS = ['#1f2a44', '#283247', '#1b1d21', '#33363c', '#4a5a72', '#5f564a', '#2e3a2d', '#55606b', '#3a3f4a', '#6b6255'];
    const CAPS = ['#ff7a00', '#16181b', '#c8102e', '#1c3f94', '#00513f', '#f4f5f6', '#ffd200', '#00a19b', '#c40d0d', '#2b3a55', '#8fc31f'];
    const CHAIRS = ['#1f4f8f', '#2f6b3a', '#b8232a', '#3a3f45', '#d48a1f', '#5a2f6b'];
    const FLAGS = [
      (g, w, h) => ['#111111', '#dd0000', '#ffce00'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, (i * h) / 3, w, h / 3 + 1); }),
      (g, w, h) => ['#ae1c28', '#ffffff', '#21468b'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, (i * h) / 3, w, h / 3 + 1); }),
      (g, w, h) => { for (let x = 0; x < 8; x++) for (let y = 0; y < 5; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f0'; g.fillRect((x * w) / 8, (y * h) / 5, w / 8 + 1, h / 5 + 1); } },
      (g, w, h) => { g.fillStyle = '#ff7a00'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b2533'; g.fillRect(0, h * 0.62, w, h * 0.2); },
      (g, w, h) => { g.fillStyle = '#00513f'; g.fillRect(0, 0, w, h); g.fillStyle = '#c4d600'; g.fillRect(0, h * 0.4, w, h * 0.2); },
      (g, w, h) => ['#111111', '#fdda24', '#ef3340'].forEach((c, i) => { g.fillStyle = c; g.fillRect((i * w) / 3, 0, w / 3 + 1, h); }),
    ];

    // Postures: hip = thigh angle forward from hanging, knee = shin bend back from the thigh, lean = torso pitch.
    const BASE = {
      stand: { hip: 0.02, knee: 0.04, lean: 0.02 },
      seat: { hip: 1.5, knee: 1.5, lean: -0.08 },
      chair: { hip: 1.45, knee: 1.35, lean: -0.12 },
      ground: { hip: 2.3, knee: 1.8, lean: -0.3 }, // on the grass, knees up, leaning back on the hands
    };

    const areas = [], props = { flags: FLAGS.map(() => []), phones: [] };
    let celOn = false, cel = 0, lastT = 0, frame = 0;
    const reactions = [];

    function newArea(name, o) {
      const A = Object.assign({ name, people: [], chairs: [], m: {}, center: new THREE.Vector3(), radius: 10 }, o || {});
      areas.push(A);
      return A;
    }

    // anchor: feet (or seat / chair base) position in world; yaw: facing (rotation about y; 0 faces +z)
    function addPerson(A, anchor, yaw, posture, o) {
      o = o || {};
      const s = 0.9 + rnd() * 0.17;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const at = (fwd, up) => new THREE.Vector3(anchor.x + fx * fwd, anchor.y + up, anchor.z + fz * fwd);
      const p = {
        A, i: A.people.length, posture, yaw, s,
        e: rnd(), ph: rnd() * 6.283, legOff: (rnd() - 0.5) * 0.14, idle: (rnd() * 4) | 0,
        noStand: !!o.noStand, prop: null,
        u: posture === 'stand' ? 1 : 0, act: 'idle', actUntil: 0, standUntil: 0,
        arms: new Float32Array(6), hy: 0, tw: 0, hp: 0, next: 0,
        x: anchor.x, z: anchor.z,
      };
      if (posture === 'stand') p.seat = p.up = at(0, 0.93 * s);
      else if (posture === 'seat') { p.seat = at(-0.15, 0.52); p.up = at(0.2, 0.93 * s); }
      else if (posture === 'chair') { p.seat = at(-0.04, 0.53); p.up = at(0.34, 0.93 * s); }
      else { p.seat = at(0, 0.13); p.up = at(0.15, 0.93 * s); }
      p.hpIdle = o.lookDown || 0.04;
      const r = rnd();
      p.hw = r < 0.36 ? 'hair' : r < 0.52 ? 'hairLong' : r < 0.86 ? 'cap' : 'beanie';
      p.cols = {
        skin: pick(SKIN), top: pick(TOPS), bottom: pick(BOTTOMS),
        hw: p.hw === 'cap' || p.hw === 'beanie' ? pick(CAPS) : pick(HAIR),
      };
      const pr = rnd();
      if (pr < 0.06) { p.prop = 'flag'; p.fd = (rnd() * FLAGS.length) | 0; props.flags[p.fd].push(p); }
      else if (pr < 0.14) { p.prop = 'phone'; props.phones.push(p); }
      if (posture === 'chair') { p.chair = A.chairs.length; A.chairs.push({ pos: anchor.clone(), yaw, color: pick(CHAIRS) }); }
      A.people.push(p);
      return p;
    }

    // ----- build the instanced meshes once every crowd area is filled -----
    const instMesh = (geo, material, count, center, radius, cast) => {
      const g = geo.clone();
      g.boundingSphere = new THREE.Sphere(center.clone(), radius);
      const m = new THREE.InstancedMesh(g, material, count);
      m.castShadow = !!cast; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    };
    function finish() {
      const c = new THREE.Color();
      areas.forEach((A) => {
        const n = A.people.length;
        if (!n) return;
        const box = new THREE.Box3();
        A.people.forEach((p) => box.expandByPoint(p.up));
        box.getCenter(A.center);
        A.radius = box.getSize(new THREE.Vector3()).length() / 2 + 3;
        PARTS.forEach(([key, m, per, cast]) => { A.m[key] = instMesh(GEO[key], MAT[m], n * per, A.center, A.radius, cast && !A.noShadow); });
        HEADWEAR.forEach((key) => {
          const list = A.people.filter((p) => p.hw === key);
          list.forEach((p, j) => { p.hwj = j; });
          if (list.length) A.m[key] = instMesh(GEO[key], MAT.hair, list.length, A.center, A.radius, false);
        });
        A.people.forEach((p) => {
          const i = p.i;
          A.m.torso.setColorAt(i, c.copy(col(p.cols.top)));
          A.m.head.setColorAt(i, c.copy(col(p.cols.skin)));
          A.m[p.hw].setColorAt(p.hwj, c.copy(col(p.cols.hw)));
          for (let k = 0; k < 2; k++) {
            A.m.sleeve.setColorAt(i * 2 + k, c.copy(col(p.cols.top)));
            A.m.hand.setColorAt(i * 2 + k, c.copy(col(p.cols.skin)));
            A.m.thigh.setColorAt(i * 2 + k, c.copy(col(p.cols.bottom)));
            A.m.shin.setColorAt(i * 2 + k, c.copy(col(p.cols.bottom)));
          }
        });
        if (A.chairs.length) {
          const cm = instMesh(GEO.chair, MAT.cloth, A.chairs.length, A.center, A.radius, true);
          const q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), m4 = new THREE.Matrix4();
          A.chairs.forEach((ch, j) => {
            q.setFromAxisAngle(YAX, ch.yaw);
            cm.setMatrixAt(j, m4.compose(ch.pos, q, one));
            cm.setColorAt(j, c.copy(col(ch.color)));
          });
          A.chairMesh = cm;
        }
      });
      // hand-held props are few, so one mesh each for the whole circuit
      const all = (geo, material, count) => {
        const m = new THREE.InstancedMesh(geo, material, Math.max(1, count));
        m.count = count; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(m);
        return m;
      };
      const nFlags = props.flags.reduce((n, l) => n + l.length, 0);
      props.poleMesh = all(GEO.pole, new THREE.MeshStandardMaterial({ color: col('#2a2d31'), roughness: 0.5, metalness: 0.4 }), nFlags);
      let pj = 0;
      props.clothMeshes = props.flags.map((list, d) => {
        const tex = canvasTex(96, 64, FLAGS[d]);
        const m = all(GEO.cloth, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }), list.length);
        list.forEach((p, j) => { p.fj = j; p.pj = pj++; });
        return m;
      });
      props.phoneMesh = all(GEO.phone, new THREE.MeshStandardMaterial({ color: col('#15171a'), roughness: 0.3, metalness: 0.5 }), props.phones.length);
      props.phones.forEach((p, j) => { p.pj = j; });
      // first pose for everyone
      areas.forEach((A) => {
        A.people.forEach((p) => { p.arms.set(idleArms(p, 0)); p.hp = p.hpIdle; writePose(p, 0, 0); });
        markDirty(A);
      });
    }

    // ----- posing -----
    const YAX = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
    const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _a = new THREE.Matrix4(), _th = new THREE.Matrix4(), _o = new THREE.Matrix4();
    const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _h = new THREE.Vector3();
    const loc = (x, y, z, rx, ry, rz, order) => { _e.set(rx, ry, rz, order); _q.setFromEuler(_e); return _m.compose(_v.set(x, y, z), _q, ONE); };
    const P = { x: 0, y: 0, z: 0, hip: 0, knee: 0, lean: 0, legOff: 0, splay: 0 };
    const TMP = new Float32Array(6);
    const A6 = (a, b, c, d, e, f) => { TMP[0] = a; TMP[1] = b; TMP[2] = c; TMP[3] = d; TMP[4] = e; TMP[5] = f; };
    const R3 = (a, b, c) => { TMP[0] = a; TMP[1] = b; TMP[2] = c; }; // right arm only

    // arm targets: [right pitch, right roll-out, right swing-in, left pitch, left roll-out, left swing-in]
    function idleArms(p, t) {
      const sw = 0.03 * Math.sin(t * 0.8 + p.ph);
      if (p.posture === 'ground' && p.u < 0.5) A6(-0.55, 0.18, 0, -0.55, 0.18, 0);
      else if (p.u < 0.5) { // seated: hands on the knees or arms folded
        if (p.idle === 3) A6(1.0, 0, 0.55, 1.05, 0, 0.5);
        else A6(0.72 + sw, -0.1, 0.06, 0.72 - sw, -0.1, 0.06);
      } else if (p.idle === 1) A6(-0.3, 0.05, 0.25, -0.3, 0.05, 0.25); // hands behind the back
      else if (p.idle === 3) A6(1.0, 0, 0.55, 1.05, 0, 0.5); // arms folded
      else A6(0.06 + sw, 0.08, 0, 0.06 - sw, 0.08, 0);
      if (p.prop === 'flag') R3(0.55, 0.1, 0.1); // flag held low
      return TMP;
    }
    function actArms(p, t) {
      const ph = p.ph;
      switch (p.act) {
        case 'cheer': { const k = 0.22 * Math.sin(t * 8.5 + ph); A6(2.75 + k, 0.35, 0, 2.75 - k, 0.35, 0); return TMP; }
        case 'clap': { const k = 0.3 + 0.14 * (1 + Math.sin(t * 14 + ph)); A6(1.2, 0, k, 1.2, 0, k); return TMP; }
        case 'wave': idleArms(p, t); R3(2.45, 0.35 + 0.4 * Math.sin(t * 7 + ph), 0); return TMP;
        case 'flag': idleArms(p, t); R3(2.35 + 0.25 * Math.sin(t * 6 + ph), 0.2, 0); return TMP;
        case 'phone': A6(1.5, 0, 0.42, 1.45, 0, 0.42); return TMP;
        case 'shock': A6(2.95, -0.25, 0.12, 2.95, -0.25, 0.12); return TMP;
        default: return idleArms(p, t);
      }
    }

    function writePose(p, t, jump) {
      const A = p.A, u = p.u, ue = u * u * (3 - 2 * u), mid = Math.sin(Math.PI * ue), b = BASE[p.posture];
      P.hip = lerp(b.hip, BASE.stand.hip, ue);
      P.knee = lerp(b.knee, BASE.stand.knee, ue) + mid * 0.35;
      P.lean = lerp(b.lean, BASE.stand.lean, ue) + mid * 0.4 + 0.015 * Math.sin(t * 0.6 + p.ph) - (p.act === 'cheer' ? 0.08 : 0);
      P.legOff = p.legOff * ue; P.splay = 0.05 * ue;
      P.x = lerp(p.seat.x, p.up.x, ue); P.y = lerp(p.seat.y, p.up.y, ue) + jump; P.z = lerp(p.seat.z, p.up.z, ue);

      _q.setFromAxisAngle(YAX, p.yaw);
      _r.compose(_v.set(P.x, P.y, P.z), _q, _s.set(p.s, p.s, p.s));
      const i2 = p.i * 2;
      // legs only move while getting up, sitting down or jumping
      if (!(jump === 0 && (u === 0 || u === 1) && p.legsU === u)) {
        for (let k = 0; k < 2; k++) {
          const sd = k ? 1 : -1;
          _th.multiplyMatrices(_r, loc(sd * 0.09, 0, 0, -(P.hip + sd * P.legOff), 0, sd * P.splay, 'ZXY'));
          A.m.thigh.setMatrixAt(i2 + k, _th);
          _o.multiplyMatrices(_th, loc(0, -0.44, 0, P.knee + Math.abs(P.legOff) * (sd > 0 ? 0.6 : 0), 0, 0, 'XYZ'));
          A.m.shin.setMatrixAt(i2 + k, _o);
        }
        p.legsU = jump === 0 ? u : -1;
      }
      _t.multiplyMatrices(_r, loc(0, 0, 0, P.lean, p.tw, 0, 'YXZ'));
      A.m.torso.setMatrixAt(p.i, _t);
      _o.multiplyMatrices(_t, loc(0, 0.52, 0, p.hp, p.hy, 0, 'YXZ'));
      A.m.head.setMatrixAt(p.i, _o);
      A.m[p.hw].setMatrixAt(p.hwj, _o);
      const ar = p.arms;
      for (let k = 0; k < 2; k++) {
        const sd = k ? 1 : -1, o = k * 3; // k = 0 is the right arm (the person's right is -x)
        _a.multiplyMatrices(_t, loc(sd * 0.19, 0.45, 0, -ar[o], -sd * ar[o + 2], sd * ar[o + 1], 'YXZ'));
        A.m.sleeve.setMatrixAt(i2 + k, _a);
        A.m.hand.setMatrixAt(i2 + k, _a);
        if (k === 0 && p.prop) placeProp(p, _a, t);
      }
    }
    function placeProp(p, armM, t) {
      if (p.prop === 'phone') {
        props.phoneMesh.setMatrixAt(p.pj, _o.multiplyMatrices(armM, PHONE_LOCAL));
        props.phoneDirty = true;
        return;
      }
      // the pole stays upright in the hand and the flag swings round it
      _h.copy(HAND).applyMatrix4(armM);
      const busy = p.act === 'flag' ? 1 : 0.25;
      _e.set(0.12 * Math.sin(t * 5 + p.ph) * busy, p.yaw + Math.PI * 0.5 + Math.sin(t * (busy > 0.5 ? 6 : 1.4) + p.ph) * 0.9 * busy, 0, 'YXZ');
      _q.setFromEuler(_e);
      _o.compose(_h, _q, _s.set(p.s, p.s, p.s));
      props.poleMesh.setMatrixAt(p.pj, _o);
      props.clothMeshes[p.fd].setMatrixAt(p.fj, _o);
      props.flagDirty = true;
    }
    function markDirty(A) {
      for (const k in A.m) { A.m[k].instanceMatrix.needsUpdate = true; if (A.m[k].instanceColor) A.m[k].instanceColor.needsUpdate = true; }
    }

    // ----- behaviour -----
    const nearCars = [], nearReacts = [];
    function update(t, focusPos, cars) {
      const dt = clamp(t - lastT, 0, 0.1);
      lastT = t; frame++;
      cel += ((celOn ? 1 : 0) - cel) * Math.min(1, dt * 2);
      for (let i = reactions.length - 1; i >= 0; i--) if (t > reactions[i].until) reactions.splice(i, 1);
      reactions.forEach((r) => { if (r.t0 == null) { r.t0 = t; r.until = t + r.len; } });
      let propsTouched = false;

      for (const A of areas) {
        if (!A.people.length) continue;
        // crowds this far away are smaller than a pixel: don't draw them
        const dist = focusPos ? A.center.distanceTo(focusPos) : 0, vis = dist < A.radius + 650;
        if (vis !== A.visible) { A.visible = vis; for (const k in A.m) A.m[k].visible = vis; if (A.chairMesh) A.chairMesh.visible = vis; }
        const near = !focusPos || dist < A.radius + 420;
        const celHere = cel > 0.02 && (near || A.stand);
        if (!near && !celHere) continue;
        nearCars.length = 0;
        if (cars) for (const c of cars) if (!c.hidden && c.world.distanceTo(A.center) < A.radius + 260) nearCars.push(c.world);
        nearReacts.length = 0;
        for (const r of reactions) if (r.pos.distanceTo(A.center) < A.radius + r.r) nearReacts.push(r);
        const busy = nearCars.length > 0 || celHere || nearReacts.length > 0 || (!cars && A.spot && A.spot.excite > 0.05);
        const slot = frame % 6;
        let posed = false;

        const half = frame & 1;
        for (let k = 0; k < A.people.length; k++) {
          const p = A.people[k];
          if (!busy && !p.moving && (k % 6) !== slot) continue;
          // fans far from the camera are re-posed every other frame
          if (busy && focusPos && (k & 1) !== half && Math.abs(p.x - focusPos.x) + Math.abs(p.z - focusPos.z) > 110) continue;
          // time since this fan was last posed (far or idle fans are skipped on some frames)
          const pdt = clamp(t - (p.lt || t - dt), 0, 0.25);
          p.lt = t;
          const kSm = 1 - Math.exp(-pdt * 9), kHead = 1 - Math.exp(-pdt * 5);
          // nearest car
          let d = 1e9, tx = 0, ty = 0, tz = 0;
          for (const w of nearCars) {
            const dx = w.x - p.x, dz = w.z - p.z, dd = dx * dx + dz * dz;
            if (dd < d) { d = dd; tx = w.x; ty = w.y + 0.6; tz = w.z; }
          }
          d = Math.sqrt(d);
          if (!cars && A.spot) d = (1 - A.spot.excite) * 160 + (p.e - 0.5) * 20; // no car list: fall back to the spot's excitement
          // crash nearby
          let rs = 0;
          for (const r of nearReacts) {
            const dd = Math.hypot(r.pos.x - p.x, r.pos.z - p.z), s = (1 - dd / r.r) * r.amount;
            if (s > rs) { rs = s; tx = r.pos.x; ty = r.pos.y + 0.5; tz = r.pos.z; d = Math.min(d, dd); }
          }
          // decide what this fan does
          const canStand = !p.noStand && (p.posture !== 'ground' || p.e > 0.7);
          if (cel > 0.5) {
            p.act = p.e > 0.3 ? (p.prop === 'flag' ? 'flag' : 'cheer') : 'clap';
            p.actUntil = t + 0.8;
            if (p.e > 0.08 && !p.noStand) p.standUntil = t + 0.8;
          } else if (rs > 0.15) {
            if (p.act !== 'shock') p.actUntil = t + 1.6 + p.e * 1.8;
            p.act = 'shock';
            if (canStand) p.standUntil = t + 3;
          } else if (d < 18 + 55 * p.e) {
            if (p.e > 0.55) {
              p.act = p.prop === 'flag' ? 'flag' : p.e > 0.78 ? 'cheer' : 'wave';
              if (canStand) p.standUntil = Math.max(p.standUntil, t + 2 + p.e * 2);
            } else if (p.act === 'idle') p.act = p.u < 0.5 ? 'clap' : 'idle';
            p.actUntil = t + 1.2 + p.e * 1.5;
          } else if (p.prop === 'phone' && d < 170) { p.act = 'phone'; p.actUntil = t + 0.6; }
          else if (p.prop === 'flag' && d < 120) { p.act = 'flag'; p.actUntil = t + 0.6; }
          if (t > p.actUntil) p.act = 'idle';

          const uT = p.posture === 'stand' ? 1 : t < p.standUntil ? 1 : 0;
          const du = clamp(uT - p.u, -pdt * 1.6, pdt * 1.8);
          p.u += du;

          // arms ease towards the pose for the current action
          const tgt = actArms(p, t);
          let moved = Math.abs(du) > 1e-4;
          for (let j = 0; j < 6; j++) { const dv = (tgt[j] - p.arms[j]) * kSm; p.arms[j] += dv; if (Math.abs(dv) > 1e-3) moved = true; }

          // head (and a little of the upper body) follows the car or the crash
          let rel, hpT;
          if (d < 260 || rs > 0.15) {
            rel = clamp(wrap(Math.atan2(tx - p.x, tz - p.z) - p.yaw), -2, 2);
            const hx = Math.hypot(tx - p.x, tz - p.z);
            hpT = clamp(Math.atan2(p.up.y + 0.6 - ty, Math.max(1, hx)), -0.35, 0.6);
          } else {
            rel = 0.35 * Math.sin(t * 0.21 + p.ph * 3);
            hpT = p.hpIdle + 0.05 * Math.sin(t * 0.17 + p.ph);
          }
          if (p.act === 'cheer' || p.act === 'shock') hpT -= 0.15;
          const twT = clamp(rel * 0.3, -0.45, 0.45), hyT = clamp(rel - twT, -1.15, 1.15);
          const dh = (hyT - p.hy) * kHead;
          p.hy += dh; p.tw += (twT - p.tw) * kHead; p.hp += (hpT - p.hp) * kHead;
          if (Math.abs(dh) > 1e-3) moved = true;
          p.moving = moved || p.act !== 'idle';

          let jump = 0;
          if (p.u > 0.95 && (p.act === 'cheer' || (cel > 0.5 && p.e > 0.5))) jump = Math.max(0, Math.sin(t * 7.5 + p.ph)) * (0.05 + 0.07 * p.e);
          writePose(p, t, jump);
          posed = true;
          if (p.prop) propsTouched = true;
        }
        if (posed) markDirty(A);
      }
      if (propsTouched) {
        if (props.flagDirty) { props.poleMesh.instanceMatrix.needsUpdate = true; props.clothMeshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; }); }
        if (props.phoneDirty) props.phoneMesh.instanceMatrix.needsUpdate = true;
        props.flagDirty = props.phoneDirty = false;
      }
    }

    return {
      newArea, addPerson, finish, update, areas, seatGeometry: GEO.seat,
      setCelebration(on) { celOn = !!on; },
      react(pos, amount) {
        const a = clamp(amount == null ? 1 : amount, 0, 1);
        reactions.push({ pos: pos.clone(), amount: 0.5 + 0.5 * a, r: 50 + 150 * a, len: 2.5 + 3 * a, t0: null, until: Infinity });
      },
      get count() { return areas.reduce((n, A) => n + A.people.length, 0); },
    };
  }

  // ======================= scenery =======================
  function build(track, scene) {
    const { col, rand, fbm, canvasTex, TEX } = NR.world;
    const W = track.HALF_W;
    const fr = track.newFrame();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const std = (hex, o) => new THREE.MeshStandardMaterial(Object.assign({ color: col(hex), roughness: 0.8 }, o || {}));
    const add = (mesh, cast, recv) => { mesh.castShadow = cast !== false; mesh.receiveShadow = recv !== false; scene.add(mesh); return mesh; };

    function textTex(text, w, h, bg, fg, font) {
      return canvasTex(w, h, (g) => {
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.strokeStyle = fg; g.lineWidth = h * 0.05; g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = font || `700 ${Math.round(h * 0.46)}px "Saira Condensed", "Arial Narrow", sans-serif`;
        g.fillText(text, w / 2, h / 2 + h * 0.03, w * 0.9);
      });
    }
    // Place an object aligned to the track at distance s, lateral offset lat (local +x = track forward)
    function alignAt(obj, s, lat, yOff) {
      track.frame(s, lat, fr);
      obj.position.copy(fr.pos);
      obj.position.y = NR.groundY(fr.pos.x, fr.pos.z) + (yOff || 0);
      obj.rotation.set(0, Math.atan2(-fr.fwd.z, fr.fwd.x), 0);
      return fr;
    }

    // ---------- spectator areas ----------
    const SPOT_DEFS = [
      { name: 'Start / Finish grandstand', sec: 'Start / Finish', off: 175, side: -1, camLat: 16, camH: 11.3, stand: true }, // hung under the roof, well above the fans when they stand
      { name: 'Flugplatz', sec: 'Flugplatz', off: 25 },
      { name: 'Karussell', sec: 'Karussell', off: 45 },
      { name: 'Brünnchen', sec: 'Brünnchen', off: 20 },
      { name: 'Pflanzgarten', sec: 'Pflanzgarten', off: -10 },
      { name: 'Döttinger Höhe', sec: 'Döttinger Höhe', off: 260, side: 1 },
    ];
    const spots = SPOT_DEFS.map((d) => {
      const s = (track.sOf(d.sec) + d.off + track.L) % track.L;
      const j = Math.floor(s / track.ds) % track.NS;
      const side = d.side || (track.kW[j] > 0 ? -1 : 1); // outside of the corner
      track.frame(s, side * (W + (d.camLat || 8.1)), fr);
      const center = fr.pos.clone();
      const cam = new THREE.Vector3(center.x, NR.groundY(center.x, center.z) + (d.camH || 2.0), center.z);
      return { name: d.name, s, side, center, cam, stand: !!d.stand, excite: 0 };
    });

    const crowd = createCrowd(scene);
    const faceTrack = (f, side) => Math.atan2(-side * f.side.x, -side * f.side.z);
    // keeps every spectator camera's view clear
    function clearOfCams(x, y, z) {
      for (const sp of spots) if (Math.hypot(x - sp.cam.x, z - sp.cam.z) < (sp.stand ? 3.0 : 3.4) && y < sp.cam.y) return false;
      return true;
    }

    const fenceMat = new THREE.MeshStandardMaterial({ map: TEX.fence, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 });
    const poleMat = std('#5d6369', { metalness: 0.6, roughness: 0.4 });
    const tentCols = ['#e6e2d6', '#2d5f9a', '#c43c2c', '#3f7d3a', '#f2c230', '#ffffff'];
    const flagSets = [['#000000', '#dd0000', '#ffce00'], ['#ffffff', '#1f5fa8'], ['#ff7a00', '#ffffff'], ['#00503c', '#c4d600'], ['#c8102e', '#ffffff']];
    const flags = [];

    // Terraced grass bank behind each trackside fence: rows of 1.35 m, each 0.32 m higher than the last,
    // joined by short grassy slopes.
    const BANK0 = 7.95, ROW = 1.35, RISE = 0.32, ROWS = 7, HALF = 62, LIFT = 0.04, SLOPE = 0.4;
    const bankProfile = [[0, 0, 0]]; // [lateral, height, is slope]
    for (let r = 0; r < ROWS; r++) {
      const l0 = 0.2 + r * ROW;
      bankProfile.push([l0 + ROW - (r < ROWS - 1 ? SLOPE : 0), r * RISE, 0]);
      if (r < ROWS - 1) bankProfile.push([l0 + ROW, (r + 1) * RISE, 1]);
    }
    bankProfile.push([0.2 + ROWS * ROW + 3.8, 0, 1]);
    const bankRamp = (ds) => { const k = Math.min(1, Math.max(0, (HALF - Math.abs(ds)) / 10)); return k * k * (3 - 2 * k); };
    const bankTex = TEX.grass.clone(); bankTex.needsUpdate = true; bankTex.repeat.set(1, 1);
    const bankMat = new THREE.MeshStandardMaterial({ map: bankTex, vertexColors: true, roughness: 0.96 });
    function buildBank(sp) {
      const pos = [], uv = [], colr = [], idx = [];
      const top = col('#76844f'), riser = col('#6a7745');
      const nS = Math.round((HALF * 2) / 2);
      for (let seg = 0; seg < bankProfile.length - 1; seg++) {
        const [l0, h0] = bankProfile[seg], [l1, h1, slope] = bankProfile[seg + 1];
        const c = slope ? riser : top, base = pos.length / 3;
        for (let i = 0; i <= nS; i++) {
          const ds = -HALF + i * 2, k = bankRamp(ds);
          [[l0, h0], [l1, h1]].forEach(([l, h], e) => {
            track.frame(sp.s + ds, sp.side * (W + BANK0 + l), fr);
            pos.push(fr.pos.x, NR.groundY(fr.pos.x, fr.pos.z) + h * k + LIFT, fr.pos.z);
            uv.push(ds / 4, (l + h + e * 0.001) / 4);
            colr.push(c.r, c.g, c.b);
          });
          if (i) {
            const a = base + (i - 1) * 2, b = a + 1, cc = a + 2, d = a + 3;
            idx.push(a, b, cc, b, d, cc);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      g.setIndex(idx); g.computeVertexNormals();
      if (g.attributes.normal.getY(nS) < 0) { // wound the wrong way for this side of the track: flip
        for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
        g.setIndex(idx); g.computeVertexNormals();
      }
      const mesh = new THREE.Mesh(g, bankMat);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    spots.forEach((sp, si) => {
      // catch fence
      const fp = [], fu = [], fi = [];
      for (let k = 0, s = sp.s - 70; s <= sp.s + 70; s += 2, k++) {
        track.frame(s, sp.side * (W + 7.4), fr);
        const gy = NR.groundY(fr.pos.x, fr.pos.z);
        fp.push(fr.pos.x, gy, fr.pos.z, fr.pos.x, gy + 3.8, fr.pos.z);
        fu.push(k * 2 / 0.32, 0, k * 2 / 0.32, 3.8 / 0.32);
        if (k > 0) { const a = (k - 1) * 2; fi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        if (k % 3 === 0 && fr.pos.distanceTo(sp.cam) > 3) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.9, 6), poleMat);
          pole.position.set(fr.pos.x, gy + 1.95, fr.pos.z); add(pole, true, false);
        }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
      fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
      fg.setIndex(fi); fg.computeVertexNormals();
      scene.add(new THREE.Mesh(fg, fenceMat));

      // fans on the terraced bank: standing, in camping chairs, or sitting on the grass at the front
      if (!sp.stand) {
        buildBank(sp);
        const A = crowd.newArea(sp.name, { spot: sp });
        for (let s = sp.s - 50; s <= sp.s + 50; s += 0.95) {
          for (let r = 0; r < ROWS; r++) {
            if (rand() < 0.34 + r * 0.06) continue;
            if (Math.abs(s - sp.s) < 2.2 && r >= 1 && r <= 3) continue; // gap where the camera stands
            const l = 0.2 + r * ROW + 0.3 + rand() * 0.6;
            const sj = s + rand() * 0.5;
            track.frame(sj, sp.side * (W + BANK0 + l), fr);
            const y = NR.groundY(fr.pos.x, fr.pos.z) + r * RISE * bankRamp(sj - sp.s) + LIFT;
            if (!clearOfCams(fr.pos.x, y, fr.pos.z)) continue;
            const byCam = Math.abs(sj - sp.s) < 9;
            const posture = r <= 1 ? (byCam || rand() < 0.45 ? 'ground' : 'stand') : rand() < 0.28 ? 'chair' : 'stand';
            crowd.addPerson(A, new THREE.Vector3(fr.pos.x, y, fr.pos.z), faceTrack(fr, sp.side) + (rand() - 0.5) * 0.7, posture, { noStand: byCam && r <= 1 });
          }
        }
      }
      // tents, gazebos and caravans behind the crowd
      for (let n = 0; n < (sp.stand ? 0 : 16); n++) {
        const s = sp.s + (rand() - 0.5) * 150, lat = sp.side * (W + 24 + rand() * 26);
        track.frame(s, lat, fr);
        const gy = NR.groundY(fr.pos.x, fr.pos.z);
        let obj;
        if (rand() < 0.35) {
          obj = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.5, 2.4), std('#eeeeea', { roughness: 0.4 }));
          obj.position.set(fr.pos.x, gy + 1.45, fr.pos.z);
        } else {
          obj = new THREE.Mesh(new THREE.ConeGeometry(2 + rand(), 2.2, 4), std(tentCols[(rand() * tentCols.length) | 0], { roughness: 0.9 }));
          obj.position.set(fr.pos.x, gy + 1.1, fr.pos.z);
        }
        obj.rotation.y = rand() * Math.PI;
        add(obj);
      }
      // flags on poles
      for (let n = 0; n < 5; n++) {
        const s = sp.s + (rand() - 0.5) * 90;
        track.frame(s, sp.side * (W + 10 + rand() * 6), fr);
        const gy = NR.groundY(fr.pos.x, fr.pos.z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.5, 5), poleMat);
        pole.position.set(fr.pos.x, gy + 2.25, fr.pos.z); add(pole, true, false);
        const set = flagSets[(rand() * flagSets.length) | 0];
        const ft = canvasTex(96, 64, (g, w, h) => set.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, (i * h) / set.length, w, h / set.length + 1); }));
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.9 }));
        flag.geometry.translate(0.75, 0, 0);
        flag.position.set(fr.pos.x, gy + 3.9, fr.pos.z);
        flag.userData.ph = rand() * 6;
        add(flag, true, false); flags.push(flag);
      }
    });

    // ---------- start / finish complex ----------
    const sSF = track.sOf('Start / Finish') + 120;
    NR.S_FINISH = sSF;
    const standInfo = { center: new THREE.Vector3(), facing: new THREE.Vector3() };
    (function startFinish() {
      // Grandstand (outside, side -1). Stand space: x along the track, +z towards the track,
      // row r has its tread centred at z = -0.9 r with the top at 0.55 (r + 1).
      const stand = new THREE.Group();
      const concrete = std('#a7a49c', { roughness: 0.95 });
      const NROW = 12, LEN = 150, AISLES = [-45, -15, 15, 45];
      const treadY = (r) => 0.55 * (r + 1), treadZ = (r) => -0.9 * r;
      const box = (w, h, d, x, y, z, m, rx) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || concrete); b.position.set(x, y, z); if (rx) b.rotation.x = rx; stand.add(b); return b; };
      for (let r = 0; r < NROW; r++) box(LEN, treadY(r), 0.9, 0, treadY(r) / 2, treadZ(r));
      box(LEN, 0.55 * (NROW + 1), 1.3, 0, 0.55 * (NROW + 1) / 2, -11.0); // top walkway
      box(LEN + 1, 12.4, 0.4, 0, 6.2, -11.85); // back wall
      [-1, 1].forEach((sd) => box(0.4, 9, 12.6, sd * (LEN / 2 + 0.2), 4.5, -5.55)); // end walls
      box(LEN, 1.5, 0.25, 0, 0.75, 0.58, std('#d9dde0', { roughness: 0.6 })); // front wall
      box(LEN + 2, 0.4, 13.8, 0, 12.6, -5.3, std('#d9dde0', { metalness: 0.4, roughness: 0.4 }), -0.06); // roof
      box(LEN + 2, 0.9, 0.2, 0, 12.75, 1.55, std('#1d4e8f', { roughness: 0.5 })); // roof fascia
      for (let x = -70; x <= 70; x += 20) box(0.5, 12.4, 0.5, x, 6.2, -11.55);
      // aisles: half steps between the rows and a hand rail up the middle
      const rail = std('#8b9298', { metalness: 0.7, roughness: 0.35 });
      AISLES.forEach((ax) => {
        for (let r = 0; r < NROW; r++) box(1.2, 0.275, 0.45, ax, treadY(r) + 0.1375, treadZ(r) - 0.225);
        const a = new THREE.Vector3(ax, treadY(0) + 0.95, treadZ(0) + 0.3), b = new THREE.Vector3(ax, treadY(NROW - 1) + 0.95, treadZ(NROW - 1) - 0.3);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(b), 6), rail);
        tube.position.copy(a).add(b).multiplyScalar(0.5);
        tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        stand.add(tube);
        for (let r = 0; r < NROW; r += 2) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 5), rail); post.position.set(ax, treadY(r) + 0.475, treadZ(r) + 0.25); stand.add(post); }
      });
      stand.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const sfr = alignAt(stand, sSF, -(W + 11), 0);
      const standFace = faceTrack(sfr, -1);
      stand.rotateY(Math.PI); // face the track
      scene.add(stand);
      stand.updateMatrixWorld(true);
      const SM = stand.matrixWorld;
      const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(SM);
      standInfo.center.copy(toWorld(0, treadY(6) + 1, treadZ(6)));
      standInfo.facing.set(0, 0, 1).transformDirection(SM).setY(0).normalize();

      // individual seats, blue with a yellow band, and the fans in them
      const A = crowd.newArea('Start / Finish grandstand', { spot: spots[0], stand: true, noShadow: true }); // under the roof's shadow anyway
      const seatPos = [];
      for (let r = 0; r < NROW; r++) {
        for (let x = -LEN / 2 + 0.6; x <= LEN / 2 - 0.6; x += 0.6) {
          if (AISLES.some((ax) => Math.abs(x - ax) < 0.75)) continue;
          seatPos.push([x, r]);
        }
      }
      const seatGeo = crowd.seatGeometry.clone();
      seatGeo.boundingSphere = new THREE.Sphere(standInfo.center.clone(), LEN / 2 + 8);
      const seatMesh = new THREE.InstancedMesh(seatGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, vertexColors: true }), seatPos.length);
      seatMesh.castShadow = true; seatMesh.receiveShadow = true;
      scene.add(seatMesh);
      const one = new THREE.Vector3(1, 1, 1), sq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), standFace);
      const blue = col('#1b4f93'), yellow = col('#e3b11f');
      const camSp = spots[0];
      seatPos.forEach(([x, r], j) => {
        const p = toWorld(x, treadY(r), treadZ(r));
        seatMesh.setMatrixAt(j, m4.compose(p, sq, one));
        seatMesh.setColorAt(j, r === 5 || r === 6 ? yellow : blue);
        const occ = 0.6 - 0.28 * Math.abs(x) / (LEN / 2);
        if (rand() > occ) return;
        if (!clearOfCams(p.x, p.y, p.z)) return;
        const nearCam = Math.hypot(p.x - camSp.cam.x, p.z - camSp.cam.z) < 4.5;
        crowd.addPerson(A, p, standFace, 'seat', { noStand: nearCam, lookDown: 0.14 });
      });
      seatMesh.instanceMatrix.needsUpdate = true;
      // standing fans along the top walkway and on the aisle steps
      for (let n = 0; n < 46; n++) {
        const p = toWorld((rand() - 0.5) * (LEN - 4), 0.55 * (NROW + 1), -10.85 + rand() * 0.4);
        crowd.addPerson(A, p, standFace + (rand() - 0.5) * 0.5, 'stand', { lookDown: 0.16 });
      }
      AISLES.forEach((ax) => {
        for (let r = 1; r < NROW; r += 3 + ((rand() * 2) | 0)) {
          const p = toWorld(ax + (rand() - 0.5) * 0.5, treadY(r), treadZ(r) + 0.2);
          if (clearOfCams(p.x, p.y, p.z)) crowd.addPerson(A, p, standFace + (rand() - 0.5) * 0.6, 'stand', { lookDown: 0.14 });
        }
      });

      // pit building (infield, side +1)
      const pits = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(180, 9, 16), std('#e9e7e1', { roughness: 0.7 }));
      body.position.set(0, 4.5, -8); pits.add(body);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(178, 3, 0.3), new THREE.MeshPhysicalMaterial({ color: col('#1b2a36'), metalness: 0.2, roughness: 0.05, clearcoat: 1 }));
      glass.position.set(0, 6.6, 0.05); pits.add(glass);
      for (let x = -84; x <= 84; x += 8) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.2), std('#30353a', { roughness: 0.5, metalness: 0.3 }));
        door.position.set(x, 2.1, 0.05); pits.add(door);
      }
      const signT = textTex('NÜRBURGRING', 1024, 128, '#0f1418', '#ffffff');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(60, 7.5), new THREE.MeshStandardMaterial({ map: signT, emissive: col('#ffffff'), emissiveMap: signT, emissiveIntensity: 0.25 }));
      sign.position.set(0, 13.2, 0.25); pits.add(sign);
      const signBack = new THREE.Mesh(new THREE.BoxGeometry(61, 8, 0.4), std('#22282d'));
      signBack.position.set(0, 13.2, -0.2); pits.add(signBack);
      pits.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      alignAt(pits, sSF + 30, W + 14, 0);
      scene.add(pits);

      // gantry over the line
      const gantry = new THREE.Group();
      const steel = std('#2b3036', { metalness: 0.6, roughness: 0.45 });
      [-1, 1].forEach((sd) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), steel); p.position.set(0, 4, sd * (W + 1.8)); gantry.add(p); });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 2 * W + 4.4), steel);
      beam.position.set(0, 7.6, 0); gantry.add(beam);
      const ledT = textTex('NORDSCHLEIFE', 1024, 128, '#06090c', '#ffd23f');
      const led = new THREE.Mesh(new THREE.PlaneGeometry(2 * W + 3.6, 1.3), new THREE.MeshBasicMaterial({ map: ledT, toneMapped: false }));
      led.position.set(-0.62, 7.6, 0); led.rotation.y = -Math.PI / 2; gantry.add(led);
      const led2 = led.clone(); led2.position.x = 0.62; led2.rotation.y = Math.PI / 2; gantry.add(led2);
      gantry.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      track.frame(sSF, 0, fr);
      gantry.position.set(fr.pos.x, fr.pos.y, fr.pos.z);
      gantry.rotation.set(0, Math.atan2(-fr.fwd.z, fr.fwd.x), 0);
      scene.add(gantry);
      // chequered line painted on the road
      const chk = canvasTex(256, 32, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f0'; g.fillRect(x * 16, y * 16, 16, 16); } });
      const line = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 1.6), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7 }));
      line.position.copy(fr.pos).addScaledVector(fr.up, 0.05);
      line.quaternion.setFromRotationMatrix(m4.makeBasis(fr.side.clone().negate(), fr.fwd, fr.up));
      line.receiveShadow = true;
      scene.add(line);
    })();

    // ---------- Nürburg castle & village ----------
    const CASTLE = new THREE.Vector3(-240, 0, 30);
    (function castle() {
      const stoneMat = new THREE.MeshStandardMaterial({ map: TEX.stone, roughness: 0.95 });
      TEX.stone.repeat.set(3, 2);
      const gy = NR.groundY(CASTLE.x, CASTLE.z);
      const g = new THREE.Group();
      const keep = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.2, 26, 20), stoneMat);
      keep.position.y = 13; g.add(keep);
      for (let a = 0; a < 16; a++) {
        if (a % 2) continue;
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.2), stoneMat);
        m.position.set(Math.cos((a / 16) * 6.283) * 6.3, 26.8, Math.sin((a / 16) * 6.283) * 6.3);
        m.rotation.y = -(a / 16) * 6.283; g.add(m);
      }
      const N = 11;
      for (let i = 0; i < N; i++) {
        if (i === 4) continue; // gate
        const a0 = (i / N) * 6.283, a1 = ((i + 1) / N) * 6.283, r = 30;
        const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
        const len = Math.hypot(x1 - x0, z1 - z0);
        const h = 6 + (i % 3) * 1.5;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len + 0.8, h, 1.8), stoneMat);
        wall.position.set((x0 + x1) / 2, h / 2 - 1, (z0 + z1) / 2);
        wall.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        g.add(wall);
      }
      const hall = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 9), stoneMat);
      hall.position.set(-12, 3, 10); g.add(hall);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.position.set(CASTLE.x, gy - 0.5, CASTLE.z);
      scene.add(g);
      CASTLE.y = gy;

      const wallM = std('#ebe4d6', { roughness: 0.85 });
      const roofMs = [std('#7a2f22'), std('#3d4248'), std('#8a3b26')];
      for (let n = 0, tries = 0; n < 34 && tries < 400; tries++) {
        const a = rand() * 6.283, r = 150 + rand() * 140;
        const x = CASTLE.x + Math.cos(a) * r, z = CASTLE.z + Math.sin(a) * r;
        const nr = track.nearest(x, z);
        if (nr && nr.d < W + 30) continue;
        const w = 7 + rand() * 5, d = 8 + rand() * 4, h = 5 + rand() * 2.5;
        const y = NR.groundY(x, z);
        const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM);
        const roofM = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1, 4), roofMs[n % 3]);
        roofM.scale.set(w, 4 + rand() * 1.5, d); roofM.rotation.y = Math.PI / 4;
        roofM.position.set(0, h / 2 + roofM.scale.y / 2 - 0.05, 0);
        const hg = new THREE.Group(); hg.add(house); hg.add(roofM);
        hg.position.set(x, y + h / 2 - 0.4, z); hg.rotation.y = rand() * Math.PI;
        hg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        scene.add(hg); n++;
      }
    })();

    // ---------- section boards ----------
    track.sections.forEach((sec) => {
      const t = textTex(sec.name.toUpperCase(), 512, 96, '#123524', '#f3f1e8');
      const board = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.BoxGeometry(5, 0.95, 0.12), [std('#123524'), std('#123524'), std('#123524'), std('#123524'), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })]);
      panel.position.y = 2.5; board.add(panel);
      [-2, 2].forEach((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), poleMat); p.position.set(x, 1.25, 0); board.add(p); });
      const s = sec.s + 6, j = Math.floor(s / track.ds) % track.NS;
      const side = track.kW[j] > 0 ? -1 : 1;
      alignAt(board, s, side * (W + 7), 0);
      board.rotateY(Math.PI / 2 + 0.35 * side);
      board.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(board);
    });

    // ---------- forests ----------
    const { merge } = NR.world;
    const jitter = (geo, amt, yKeep) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (yKeep != null && p.getY(i) > yKeep) continue;
        const k = 1 + (rand() - 0.5) * amt;
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, p.getY(i) * (1 + (rand() - 0.5) * amt * 0.4));
      }
      geo.computeVertexNormals(); return geo;
    };
    const shade = (y) => Math.min(1.1, 0.55 + y * 0.055);
    const coneGeo = merge([0, 1, 2, 3, 4].map((i) => {
      const r = 3.0 - i * 0.55, h = 3.4 - i * 0.25;
      return { geo: jitter(new THREE.ConeGeometry(r, h, 10, 2), 0.3, h / 2 - 0.01), m: new THREE.Matrix4().makeTranslation(0, 2.4 + i * 1.75 + h / 2, 0), tint: (y) => shade(y + 2.4 + i * 1.75 + h / 2) };
    }));
    const blobGeo = merge([[0, 6.4, 0, 3.1], [1.7, 5.5, 0.9, 2.3], [-1.5, 5.7, -1, 2.4], [0.3, 7.8, -0.6, 2.0]].map(([x, y, z, r]) => ({
      geo: jitter(new THREE.IcosahedronGeometry(r, 1), 0.35), m: new THREE.Matrix4().makeTranslation(x, y, z), tint: (yy) => shade(yy + y),
    })));
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 4, 6); trunkGeo.translate(0, 2, 0);

    const NCON = 3600, NDEC = 1100;
    const conifers = new THREE.InstancedMesh(coneGeo, std('#ffffff', { roughness: 0.92, vertexColors: true }), NCON);
    const decid = new THREE.InstancedMesh(blobGeo, std('#ffffff', { roughness: 0.9, vertexColors: true }), NDEC);
    const trunks = new THREE.InstancedMesh(trunkGeo, std('#4a3727', { roughness: 1 }), NCON + NDEC);
    const conCols = ['#24402a', '#2b4a2f', '#30533a', '#1f3825', '#35503a'], decCols = ['#4a6a2e', '#577636', '#62803c', '#6d8740', '#7a8a45'];
    const sfPos = track.frame(sSF, 0, track.newFrame()).pos.clone();
    let nc = 0, nd = 0, nt = 0;
    for (let tries = 0; tries < 26000 && (nc < NCON || nd < NDEC); tries++) {
      const x = -130 + (rand() - 0.5) * 3300, z = -70 + (rand() - 0.5) * 2700;
      const dens = fbm(x * 0.004 + 11, z * 0.004 - 5, 3);
      if (dens < 0.46 && rand() > 0.06) continue;
      const nr = track.nearest(x, z);
      if (nr && nr.d < W + 12 + rand() * 6) continue;
      let blocked = false;
      for (const sp of spots) if (Math.hypot(x - sp.center.x, z - sp.center.z) < 85) blocked = true;
      if (blocked || Math.hypot(x - sfPos.x, z - sfPos.z) < 160 || Math.hypot(x - CASTLE.x, z - CASTLE.z) < 55) continue;
      const y = NR.groundY(x, z) - 0.3;
      const s = 0.75 + rand() * 0.65;
      q.setFromAxisAngle(v.set(0, 1, 0), rand() * 6.28);
      m4.compose(v.set(x, y, z), q, sc.set(s, s * (0.9 + rand() * 0.3), s));
      const conifer = dens > 0.5 ? rand() < 0.85 : rand() < 0.35;
      if (conifer && nc < NCON) { conifers.setMatrixAt(nc, m4); conifers.setColorAt(nc++, col(conCols[(rand() * 5) | 0])); }
      else if (!conifer && nd < NDEC) { decid.setMatrixAt(nd, m4); decid.setColorAt(nd++, col(decCols[(rand() * 5) | 0])); }
      else continue;
      trunks.setMatrixAt(nt++, m4);
    }
    conifers.count = nc; decid.count = nd; trunks.count = nt;
    [conifers, decid, trunks].forEach((m) => add(m, true, false));

    crowd.finish();

    function update(t, focusPos, cars) {
      // spots get louder as cars approach (cameras.js may also set this)
      if (cars) spots.forEach((sp) => {
        let dmin = 1e9;
        for (const c of cars) if (!c.hidden) dmin = Math.min(dmin, c.world.distanceTo(sp.center));
        sp.excite = Math.max(0, Math.min(1, 1 - dmin / 160));
      });
      crowd.update(t, focusPos, cars);
      flags.forEach((f) => { f.rotation.y = Math.sin(t * 1.6 + f.userData.ph) * 0.5; });
    }

    return {
      spots, update, castle: CASTLE, sfPos, standInfo,
      setCelebration: crowd.setCelebration,
      react: crowd.react,
      get crowdSize() { return crowd.count; },
      get crowdAreas() { return crowd.areas; },
    };
  }

  NR.buildScenery = build;
})();
