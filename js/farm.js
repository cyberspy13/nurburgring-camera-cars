// farm.js — five fenced fields beside the road with cows and sheep that graze, wander, lie down (more of them at
// night) and lift their heads to watch the cars go by, calves and lambs keeping close to their mothers, and a farm
// (house, red barn, tractor, hay bales) at Metzgesfeld. Each part of an animal (body, head, legs, tail) is one
// instanced mesh shared by every animal of its kind, filled only with the animals in fields near the camera.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrap = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
  const TAU = Math.PI * 2;

  // where the fields are, what grazes there, how many (and how many young), half-length along the road and
  // half-depth away from it
  const FIELDS = [
    { sec: 'Quiddelbacher Höhe', kind: 'cow', n: 11, young: 3, hx: 42, hz: 26 },
    { sec: 'Metzgesfeld', kind: 'cow', n: 10, young: 3, hx: 42, hz: 26, farm: true },
    { sec: 'Kesselchen', kind: 'sheep', n: 24, young: 6, hx: 36, hz: 22 },
    { sec: 'Wippermann', kind: 'sheep', n: 22, young: 5, hx: 36, hz: 22 },
    { sec: 'Eschbach', kind: 'cow', n: 12, young: 2, hx: 42, hz: 26 },
  ];
  const GAP = 12;      // the near fence stands this far beyond the road edge (the Armco is at 5.2)
  const AWAKE = 400;   // fields further than this from the camera and the action are not drawn or moved (an animal is 2 px)
  const CALL_R = 230;  // you hear the animals when the camera is this close to their field

  // How each kind is put together (metres, +z forward, ground at y = 0): the neck joint, the hips (left fore, right
  // fore, left hind, right hind), the tail root, how far the body sinks lying down, the head's grazing pitch, walking
  // speed and stride, half the body length (for the slope underneath), how close a car must come to be watched, the
  // spacing in a herd, and how much higher the head is carried when not grazing.
  const PLAN = {
    cow: {
      neck: [0, 1.2, 0.78], hips: [[-0.25, 0.88, 0.66], [0.25, 0.88, 0.66], [-0.25, 0.88, -0.68], [0.25, 0.88, -0.68]],
      tail: [0, 1.38, -0.96], drop: 0.6, graze: 1.33, walk: 0.6, stride: 1.5, half: 0.95, lookR: 80, gap: 2.4, lift: 0,
    },
    sheep: {
      neck: [0, 0.62, 0.52], hips: [[-0.14, 0.47, 0.33], [0.14, 0.47, 0.33], [-0.14, 0.47, -0.35], [0.14, 0.47, -0.35]],
      tail: null, drop: 0.32, graze: 1.12, walk: 0.65, stride: 0.9, half: 0.6, lookR: 65, gap: 1.4, lift: -0.38,
    },
  };
  const LEG_PHASE = [0.25, 0.75, 0, 0.5]; // a walk: left hind, left fore, right hind, right fore

  // ---------- shapes ----------
  // A box with rounded edges and corners, with smooth normals all round.
  function roundBox(w, h, d, r, seg) {
    const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
    const P = g.attributes.position, N = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
      v.sub(c).normalize();
      N.setXYZ(i, v.x, v.y, v.z);
      v.multiplyScalar(r).add(c);
      P.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }
  // A lumpy ball for fleece. The bumps come from the position, so corners shared by faces stay joined.
  function fluff(r, amt) {
    const g = new THREE.IcosahedronGeometry(r, 1), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = Math.sin(x * 129.9 + y * 783.3 + z * 377.2) * 43758.5453;
      const k = 1 + (n - Math.floor(n) - 0.5) * (amt || 0.35);
      P.setXYZ(i, x * k, y * k, z * k);
    }
    g.computeVertexNormals();
    return g;
  }
  // Join parts into one geometry with a colour per part: [geometry, position, rotation, scale, colour]
  function shape(parts) {
    const pos = [], nor = [], colr = [], m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
    const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), c = new THREE.Color();
    parts.forEach(([geo, p, rot, sc, hex]) => {
      e.set(...(rot || [0, 0, 0])); q.setFromEuler(e); s.set(...(sc || [1, 1, 1]));
      m.compose(v.set(...p), q, s); nm.getNormalMatrix(m);
      c.set(hex || '#ffffff').convertSRGBToLinear();
      const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        colr.push(c.r, c.g, c.b);
      }
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    return out;
  }

  function cowShapes() {
    const eye = '#111111', horn = '#efe6cc';
    return {
      body: shape([
        [roundBox(0.78, 0.8, 1.9, 0.36, 5), [0, 1.08, 0]],
        [roundBox(0.7, 0.24, 0.5, 0.12, 3), [0, 1.33, -0.62]],     // the hips
        [roundBox(0.6, 0.22, 0.45, 0.11, 3), [0, 1.33, 0.56]],     // the withers
        [new THREE.SphereGeometry(0.19, 10, 8), [0, 0.66, -0.48], null, [1, 0.8, 1.25], '#f0b8b0'], // udder
      ]),
      head: shape([
        [roundBox(0.42, 0.5, 0.6, 0.18, 3), [0, -0.02, 0.22]],                         // neck
        [roundBox(0.38, 0.42, 0.46, 0.14, 3), [0, -0.08, 0.66]],                       // skull
        [roundBox(0.34, 0.26, 0.26, 0.08, 3), [0, -0.2, 0.95], null, null, '#e8c4ba'],  // muzzle
        [new THREE.BoxGeometry(0.05, 0.05, 0.05), [-0.19, 0, 0.72], null, null, eye],
        [new THREE.BoxGeometry(0.05, 0.05, 0.05), [0.19, 0, 0.72], null, null, eye],
        [roundBox(0.24, 0.05, 0.13, 0.02, 1), [-0.29, 0.04, 0.56], [0, 0, 0.25]],     // ears
        [roundBox(0.24, 0.05, 0.13, 0.02, 1), [0.29, 0.04, 0.56], [0, 0, -0.25]],
        [new THREE.ConeGeometry(0.035, 0.14, 6), [-0.14, 0.17, 0.58], [0, 0, 0.5], null, horn],
        [new THREE.ConeGeometry(0.035, 0.14, 6), [0.14, 0.17, 0.58], [0, 0, -0.5], null, horn],
      ]),
      leg: shape([
        [roundBox(0.17, 0.62, 0.2, 0.07, 2), [0, -0.3, 0]],
        [roundBox(0.13, 0.3, 0.14, 0.05, 2), [0, -0.7, 0.01]],
        [roundBox(0.15, 0.1, 0.17, 0.03, 1), [0, -0.83, 0.02], null, null, '#2a2522'], // hoof
      ]),
      tail: shape([
        [new THREE.CylinderGeometry(0.025, 0.035, 0.75, 5), [0, -0.38, -0.03], [0.08, 0, 0]],
        [roundBox(0.09, 0.22, 0.09, 0.04, 1), [0, -0.8, -0.06], null, null, '#2b2623'],   // the switch
      ]),
    };
  }
  function sheepShapes() {
    const wool = '#f3eee2', parts = [[fluff(1, 0.25), [0, 0.7, 0], null, [0.4, 0.36, 0.62], wool]];
    // fleece lumps over the back, the sides, the rump and round the neck
    [[0, 0.98, 0.15, 0.2], [0, 0.97, -0.25, 0.21], [-0.27, 0.78, 0.2, 0.19], [0.27, 0.78, 0.2, 0.19],
      [-0.27, 0.8, -0.25, 0.2], [0.27, 0.8, -0.25, 0.2], [0, 0.74, -0.5, 0.25], [0, 0.84, 0.44, 0.22],
      [-0.2, 0.55, 0, 0.18], [0.2, 0.55, 0, 0.18]].forEach(([x, y, z, r]) => parts.push([fluff(r), [x, y, z], null, null, wool]));
    return {
      body: shape(parts),
      head: shape([
        [roundBox(0.16, 0.2, 0.34, 0.08, 2), [0, 0, 0.12], [0.25, 0, 0]],      // neck
        [roundBox(0.19, 0.22, 0.26, 0.09, 2), [0, -0.03, 0.36]],               // skull
        [roundBox(0.14, 0.15, 0.13, 0.06, 2), [0, -0.07, 0.5]],                // nose
        [new THREE.BoxGeometry(0.035, 0.035, 0.035), [-0.095, 0.01, 0.41], null, null, '#111111'],
        [new THREE.BoxGeometry(0.035, 0.035, 0.035), [0.095, 0.01, 0.41], null, null, '#111111'],
        [roundBox(0.1, 0.03, 0.055, 0.012, 1), [-0.1, 0.05, 0.27], [0, -1.3, 0.2]],  // small ears, laid back
        [roundBox(0.1, 0.03, 0.055, 0.012, 1), [0.1, 0.05, 0.27], [0, 1.3, -0.2]],
      ]),
      leg: shape([
        [roundBox(0.075, 0.44, 0.085, 0.03, 2), [0, -0.22, 0]],
        [roundBox(0.08, 0.06, 0.09, 0.02, 1), [0, -0.44, 0.01], null, null, '#1d1a18'],
      ]),
    };
  }

  // Black-and-white Holstein patches, different on every cow: noise over the part's own shape, offset by a seed
  // per animal. Only white parts of white animals get patches (not the udder, muzzle or a brown cow).
  function patchMaterial() {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSeed; varying float vSeed; varying vec3 vLoc;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position; vSeed = aSeed;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vSeed; varying vec3 vLoc;
          float pHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          float pNoise(vec3 x) {
            vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(pHash(i), pHash(i + vec3(1, 0, 0)), f.x), mix(pHash(i + vec3(0, 1, 0)), pHash(i + vec3(1, 1, 0)), f.x), f.y),
                       mix(mix(pHash(i + vec3(0, 0, 1)), pHash(i + vec3(1, 0, 1)), f.x), mix(pHash(i + vec3(0, 1, 1)), pHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 p = vLoc * 2.1 + vec3(vSeed * 3.1, vSeed * 1.7, vSeed * 2.3);
            float n = 0.65 * pNoise(p) + 0.35 * pNoise(p * 2.3 + 7.0);
            float white = step(0.97, min(vColor.r, min(vColor.g, vColor.b)));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), white * smoothstep(0.5, 0.53, n));
          }`);
    };
    return m;
  }

  function buildFarm(ctx) {
    const { track, scene, W, std } = ctx;
    const { col, rand, canvasTex, TEX, bake } = NR.world;
    const pick = (a) => a[(rand() * a.length) | 0];
    const fr = track.newFrame();
    const sf = track.frame(track.S_FINISH, 0, track.newFrame()).pos.clone();

    // field coordinates: u along the road, w away from it, from the field's centre
    const toWorld = (f, u, w, out) => out.set(f.C.x + f.ax.x * u + f.az.x * w, 0, f.C.z + f.ax.z * u + f.az.z * w);
    const local = (f, x, z) => { const dx = x - f.C.x, dz = z - f.C.z; return [dx * f.ax.x + dz * f.ax.z, dx * f.az.x + dz * f.az.z]; };
    const taken = ctx.clearings.slice(); // the school's and the pools' ground (not the clearings the farm makes)
    // Ground the farm may use: off every road, clear of the stands, the pools and school, the village, the
    // paddock and the other fields (`own` is the field a farm building belongs to).
    function free(x, z, own) {
      const nr = track.nearest(x, z);
      if (nr && nr.d < W + 9) return false;
      if (ctx.spots.some((sp) => Math.hypot(x - sp.center.x, z - sp.center.z) < 75)) return false;
      if (taken.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 6)) return false;
      if (fields.some((g) => { if (g === own) return false; const [u, w] = local(g, x, z); return Math.abs(u) < g.hx + 10 && Math.abs(w) < g.hz + 10; })) return false;
      return Math.hypot(x - ctx.castle.x, z - ctx.castle.z) > 330 && Math.hypot(x - sf.x, z - sf.z) > 260;
    }

    // ---------- the fields ----------
    const fields = [];
    FIELDS.forEach((def) => {
      const at = ctx.site(track.sOf(def.sec), 20, 420, GAP, GAP + 2 * def.hz, def.hx, def.hx + 20);
      let got = null;
      for (const side of [at.side, -at.side]) {
        for (const k of [1, 0.8, 0.62]) {
          const hx = def.hx * (k < 1 ? 0.85 : 1), hz = def.hz * k;
          track.frame(at.s, side * (W + GAP + hz), fr);
          const C = new THREE.Vector3(fr.pos.x, 0, fr.pos.z);
          const ax = new THREE.Vector3(fr.fwd.x, 0, fr.fwd.z).normalize();
          const az = new THREE.Vector3(side * fr.side.x, 0, side * fr.side.z).normalize();
          let ok = true;
          for (let u = -hx; u <= hx + 0.1 && ok; u += hx / 6) for (let w = -hz; w <= hz + 0.1 && ok; w += hz / 4) {
            if (!free(C.x + ax.x * u + az.x * w, C.z + ax.z * u + az.z * w)) ok = false;
          }
          if (ok) { got = { C, ax, az, hx, hz, side }; break; }
        }
        if (got) break;
      }
      if (!got) return; // nowhere to put it near this corner
      ctx.clear(got.C.x, got.C.z, Math.hypot(got.hx, got.hz) + 6);
      fields.push(Object.assign(got, { name: def.sec, kind: def.kind, def, s: at.s, animals: [], active: false, nextCall: 0, lastCall: 0, calm: 0 }));
    });
    // ---------- fences, gates and hay bales (all fields in one merged mesh per material) ----------
    const wood = std('#7a5b3c', { roughness: 0.95 });
    const galv = std('#a9b0b5', { metalness: 0.6, roughness: 0.4 });
    const netTex = canvasTex(64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(150,156,160,1)'; g.lineWidth = 3;
      g.strokeRect(0, 0, w, h);
    }, true);
    netTex.repeat.set(10, 4);
    const net = new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 });
    const straw = new THREE.MeshStandardMaterial({
      map: canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#cfa94f'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
          g.strokeStyle = rand() < 0.5 ? 'rgba(120,90,30,0.35)' : 'rgba(250,225,150,0.4)'; g.lineWidth = 1;
          const x = rand() * w, y = rand() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 18, y + (rand() - 0.5) * 4); g.stroke();
        }
      }, true),
      roughness: 1,
    });
    const fence = new THREE.Group();
    const at3 = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
    function post(p, h, s) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), wood);
      m.position.set(p.x, NR.groundY(p.x, p.z) - 0.25 + h / 2, p.z);
      fence.add(m);
    }
    // a bar from one post to the next, liftA and liftB metres above the ground at its ends
    function bar(a, b, liftA, liftB, th, deep, mat) {
      const ya = NR.groundY(a.x, a.z) + liftA, yb = NR.groundY(b.x, b.z) + liftB;
      at3.set(b.x - a.x, yb - ya, b.z - a.z);
      const len = at3.length();
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, th, deep), mat);
      m.position.set((a.x + b.x) / 2, (ya + yb) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(X, at3.divideScalar(len));
      fence.add(m);
    }
    function netting(a, b) {
      const ya = NR.groundY(a.x, a.z), yb = NR.groundY(b.x, b.z);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.85), net);
      m.position.set((a.x + b.x) / 2, (ya + yb) / 2 + 0.48, (a.z + b.z) / 2);
      m.rotation.set(0, -Math.atan2(b.z - a.z, b.x - a.x), Math.atan2(yb - ya, len), 'YXZ');
      fence.add(m);
    }
    function bale(x, y, z, yaw) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16), straw);
      m.position.set(x, y, z); m.rotation.set(0, yaw, Math.PI / 2, 'YXZ');
      fence.add(m);
    }
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    fields.forEach((f) => {
      const cow = f.kind === 'cow';
      const corners = [[-f.hx, -f.hz], [f.hx, -f.hz], [f.hx, f.hz], [-f.hx, f.hz]];
      for (let e = 0; e < 4; e++) {
        const [u0, w0] = corners[e], [u1, w1] = corners[(e + 1) % 4];
        const n = Math.ceil(Math.hypot(u1 - u0, w1 - w0) / 3);
        const gateAt = e === 2 ? Math.floor(n / 2) : -1; // a gate in the middle of the far side
        for (let i = 0; i < n; i++) {
          toWorld(f, u0 + ((u1 - u0) * i) / n, w0 + ((w1 - w0) * i) / n, A);
          toWorld(f, u0 + ((u1 - u0) * (i + 1)) / n, w0 + ((w1 - w0) * (i + 1)) / n, B);
          post(A, 1.35, i === gateAt || i === gateAt + 1 ? 0.18 : 0.12);
          if (i === gateAt) { // a five-bar gate with its brace
            [0.25, 0.45, 0.65, 0.85, 1.05].forEach((y) => bar(A, B, y, y, 0.05, 0.05, galv));
            bar(A, B, 0.25, 1.05, 0.05, 0.05, galv);
          } else if (cow) {
            [0.45, 0.8, 1.1].forEach((y) => bar(A, B, y, y, 0.11, 0.05, wood));
          } else {
            bar(A, B, 1.05, 1.05, 0.1, 0.05, wood);
            netting(A, B);
          }
        }
      }
      // round bales stacked outside a far corner
      const nb = cow ? 5 : 3;
      for (let i = 0; i < nb; i++) {
        toWorld(f, f.hx - 3 - i * 1.35, f.hz + 2.6, A);
        bale(A.x, NR.groundY(A.x, A.z) + 0.7, A.z, Math.atan2(f.ax.x, f.ax.z) + Math.PI / 2);
      }
      if (cow) { toWorld(f, f.hx - 3.7, f.hz + 2.6, A); bale(A.x, NR.groundY(A.x, A.z) + 2.0, A.z, Math.atan2(f.ax.x, f.ax.z) + Math.PI / 2); }
    });
    fence.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== net; o.receiveShadow = true; } }); // the netting's holes would cast a solid shadow
    scene.add(bake(fence));

    // ---------- the farm at Metzgesfeld ----------
    const yard = fields.find((f) => f.def.farm);
    const farmGroup = yard ? buildYard(yard) : null;

    function buildYard(f) {
      const g = new THREE.Group();
      const m = new THREE.Matrix4(), lm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
      const faceField = Math.atan2(-f.az.x, -f.az.z); // a building's front (+z) looks back over the field to the road
      let base = null;
      // put a part on the building whose frame is in `base`
      const put = (geo, mat, x, y, z, rx, ry, rz) => {
        const mesh = new THREE.Mesh(geo, mat);
        e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e);
        lm.compose(v.set(x, y, z), q, s.set(1, 1, 1));
        m.multiplyMatrices(base, lm).decompose(mesh.position, mesh.quaternion, mesh.scale);
        g.add(mesh);
        return mesh;
      };
      // A level plot for a building wid by dep at field coordinates (u, w), if the ground there is free: sets its
      // frame, standing on the highest ground, with a stone plinth down to the lowest.
      const plinthMat = new THREE.MeshStandardMaterial({ map: TEX.stone, roughness: 0.95 });
      function plot(u, w, wid, dep) {
        const c = toWorld(f, u, w, new THREE.Vector3()), p = new THREE.Vector3();
        let hi = -1e9, lo = 1e9;
        for (let a = -0.5; a <= 0.5; a += 0.25) for (let b = -0.5; b <= 0.5; b += 0.25) {
          toWorld(f, u + a * wid, w + b * dep, p);
          if (!free(p.x, p.z, f)) return false;
          const y = NR.groundY(p.x, p.z);
          hi = Math.max(hi, y); lo = Math.min(lo, y);
        }
        base = new THREE.Matrix4().compose(v.set(c.x, hi + 0.15, c.z), q.setFromEuler(e.set(0, faceField, 0)), s.set(1, 1, 1));
        const ph = hi - lo + 0.8;
        put(new THREE.BoxGeometry(wid + 0.3, ph, dep + 0.3), plinthMat, 0, 0.02 - ph / 2, 0);
        ctx.clear(c.x, c.z, Math.hypot(wid, dep) / 2 + 6);
        return true;
      }
      const tri = (b, h) => { const sh = new THREE.Shape(); sh.moveTo(-b / 2, 0); sh.lineTo(b / 2, 0); sh.lineTo(0, h); sh.lineTo(-b / 2, 0); return new THREE.ShapeGeometry(sh); };
      const baleGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16);

      // red barn, gable end to the field, with big doors, a hay loft door and hay stacked beside it
      (function barn() {
        if (!plot(f.hx * 0.42, f.hz + 17, 10.6, 16.6)) return;
        const boards = canvasTex(256, 128, (gg, w, h) => {
          gg.fillStyle = '#9c2a1f'; gg.fillRect(0, 0, w, h);
          for (let x = 0; x < w; x += 16) { gg.fillStyle = 'rgba(40,8,5,0.45)'; gg.fillRect(x, 0, 2, h); }
          for (let i = 0; i < 500; i++) { gg.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,200,180,0.05)'; gg.fillRect(rand() * w, rand() * h, 3, 10); }
        }, true);
        boards.repeat.set(3, 1);
        const red = new THREE.MeshStandardMaterial({ map: boards, roughness: 0.85 });
        const doors = new THREE.MeshStandardMaterial({
          map: canvasTex(128, 128, (gg, w, h) => {
            gg.fillStyle = '#7d1f17'; gg.fillRect(0, 0, w, h);
            gg.strokeStyle = '#f3efe6'; gg.lineWidth = 9;
            gg.strokeRect(5, 5, w - 10, h - 10);
            gg.beginPath(); gg.moveTo(8, 8); gg.lineTo(w - 8, h - 8); gg.moveTo(w - 8, 8); gg.lineTo(8, h - 8); gg.stroke();
            gg.beginPath(); gg.moveTo(w / 2, 6); gg.lineTo(w / 2, h - 6); gg.stroke();
          }),
          roughness: 0.8,
        });
        const white = std('#f3efe6', { roughness: 0.7 }), roof = std('#55595e', { roughness: 0.7, metalness: 0.2 });
        put(new THREE.BoxGeometry(10, 6, 16), red, 0, 3, 0);
        put(tri(10, 4), red, 0, 6, 8);
        put(tri(10, 4), red, 0, 6, -8, 0, Math.PI, 0);
        const slope = Math.hypot(5.4, 4), pitch = Math.atan2(4, 5.4);
        put(new THREE.BoxGeometry(slope, 0.25, 16.8), roof, 2.65, 8.05, 0, 0, 0, -pitch);
        put(new THREE.BoxGeometry(slope, 0.25, 16.8), roof, -2.65, 8.05, 0, 0, 0, pitch);
        put(new THREE.PlaneGeometry(4.4, 4.6), doors, 0, 2.3, 8.02);
        put(new THREE.PlaneGeometry(1.8, 1.6), doors, 0, 7.4, 8.02);
        [[-5, 8], [5, 8], [-5, -8], [5, -8]].forEach(([x, z]) => put(new THREE.BoxGeometry(0.28, 6, 0.28), white, x, 3, z));
        for (let i = 0; i < 4; i++) put(baleGeo, straw, 6.6, 0.75, 5 - i * 1.6, Math.PI / 2, 0, 0);
        for (let i = 0; i < 3; i++) put(baleGeo, straw, 6.6, 2.05, 4.2 - i * 1.6, Math.PI / 2, 0, 0);
      })();

      // white farmhouse with a tiled roof, windows, a door and a chimney
      (function house() {
        if (!plot(-f.hx * 0.4, f.hz + 15, 11.4, 8.4)) return;
        const win = new THREE.MeshStandardMaterial({
          map: canvasTex(64, 64, (gg, w, h) => {
            const gr = gg.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#5b7287'); gr.addColorStop(1, '#22303c');
            gg.fillStyle = gr; gg.fillRect(0, 0, w, h);
            gg.fillStyle = '#f6f3ec'; gg.fillRect(0, 0, w, 6); gg.fillRect(0, h - 6, w, 6); gg.fillRect(0, 0, 6, h); gg.fillRect(w - 6, 0, 6, h);
            gg.fillRect(w / 2 - 2, 0, 4, h); gg.fillRect(0, h / 2 - 2, w, 4);
          }),
          roughness: 0.3, metalness: 0.1,
        });
        const plaster = std('#eee7d8', { roughness: 0.9 }), tiles = std('#8a3b26', { roughness: 0.8 });
        const door = std('#5a3a22', { roughness: 0.8 }), brick = std('#8c4a35', { roughness: 0.9 });
        put(new THREE.BoxGeometry(11, 5.6, 8), plaster, 0, 2.8, 0);
        put(tri(8, 3.2), plaster, 5.5, 5.6, 0, 0, Math.PI / 2, 0);
        put(tri(8, 3.2), plaster, -5.5, 5.6, 0, 0, -Math.PI / 2, 0);
        const slope = Math.hypot(4.6, 3.2), pitch = Math.atan2(3.2, 4.4);
        put(new THREE.BoxGeometry(11.8, 0.22, slope), tiles, 0, 7.25, 2.15, pitch, 0, 0);
        put(new THREE.BoxGeometry(11.8, 0.22, slope), tiles, 0, 7.25, -2.15, -pitch, 0, 0);
        put(new THREE.BoxGeometry(0.7, 2.6, 0.7), brick, 3, 7.6, -1.2);
        [-3.6, -1.5, 1.5, 3.6].forEach((x) => [1.7, 4.2].forEach((y) => {
          if (Math.abs(x) < 2 && y < 3) return; // the door goes there
          put(new THREE.PlaneGeometry(1.1, 1.3), win, x, y, 4.02);
          put(new THREE.PlaneGeometry(1.1, 1.3), win, x, y, -4.02, 0, Math.PI, 0);
        }));
        put(new THREE.PlaneGeometry(1.1, 2.2), door, 0, 1.1, 4.02);
        [-1, 1].forEach((sd) => put(new THREE.PlaneGeometry(1.1, 1.3), win, sd * 5.52, 4.2, 0, 0, sd * Math.PI / 2, 0));
      })();

      // a green tractor parked in the yard by the gate
      (function tractor() {
        const c = toWorld(f, f.hx * 0.02, f.hz + 8, new THREE.Vector3());
        if (!free(c.x, c.z, f)) return;
        ctx.clear(c.x, c.z, 8);
        base = new THREE.Matrix4().compose(v.set(c.x, NR.groundY(c.x, c.z) - 0.05, c.z), q.setFromEuler(e.set(0, faceField + 0.5, 0)), s.set(1, 1, 1));
        const paint = std('#2f7d32', { roughness: 0.45, metalness: 0.25 }), rubber = std('#1b1b1b', { roughness: 0.95 });
        const hub = std('#e8c21c', { roughness: 0.5, metalness: 0.3 }), black = std('#222426', { roughness: 0.6 });
        const glass = std('#33444f', { roughness: 0.12, metalness: 0.4 });
        put(new THREE.BoxGeometry(0.9, 0.8, 1.9), paint, 0, 1.15, 0.65);                      // bonnet
        put(new THREE.BoxGeometry(0.8, 0.3, 0.25), black, 0, 0.7, 1.68);                      // front weight
        put(new THREE.PlaneGeometry(0.78, 0.6), black, 0, 1.15, 1.61);                         // grille
        put(new THREE.BoxGeometry(1.2, 0.25, 1.3), paint, 0, 1.05, -0.65);                    // cab floor
        [[-0.62, -0.08], [0.62, -0.08], [-0.62, -1.25], [0.62, -1.25]].forEach(([x, z]) => put(new THREE.BoxGeometry(0.07, 1.45, 0.07), black, x, 1.9, z));
        put(new THREE.BoxGeometry(1.42, 0.1, 1.35), paint, 0, 2.66, -0.66);                   // cab roof
        put(new THREE.PlaneGeometry(1.2, 1.1), glass, 0, 1.95, -0.06);                        // windows
        put(new THREE.PlaneGeometry(1.2, 1.1), glass, 0, 1.95, -1.27, 0, Math.PI, 0);
        [-1, 1].forEach((sd) => put(new THREE.PlaneGeometry(1.1, 1.0), glass, sd * 0.63, 2.0, -0.66, 0, sd * Math.PI / 2, 0));
        put(new THREE.BoxGeometry(0.5, 0.5, 0.45), black, 0, 1.45, -0.8);                     // seat
        put(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), black, 0.3, 2.0, 1.25);          // exhaust
        [-1, 1].forEach((sd) => {
          put(new THREE.CylinderGeometry(0.82, 0.82, 0.5, 20), rubber, sd * 0.88, 0.82, -0.7, 0, 0, Math.PI / 2);
          put(new THREE.CylinderGeometry(0.42, 0.42, 0.52, 14), hub, sd * 0.88, 0.82, -0.7, 0, 0, Math.PI / 2);
          put(new THREE.BoxGeometry(0.56, 0.08, 1.5), paint, sd * 0.88, 1.72, -0.7);         // mudguard
          put(new THREE.CylinderGeometry(0.48, 0.48, 0.32, 16), rubber, sd * 0.72, 0.48, 1.25, 0, 0, Math.PI / 2);
          put(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 12), hub, sd * 0.72, 0.48, 1.25, 0, 0, Math.PI / 2);
        });
      })();

      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(bake(g));
      return g;
    }

    // ---------- the animals ----------
    const cowMat = patchMaterial();
    const woolMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const herd = { cow: [], sheep: [] };
    const HOLSTEIN = '#ffffff', BROWNS = ['#5e3d26', '#6b4a33', '#4f3322'];
    const FACES = ['#1f1c1a', '#1f1c1a', '#1f1c1a', '#2a2420', '#efe7da', '#e9dfcf'];

    function spawn(f, kind, mom) {
      const plan = PLAN[kind], young = !!mom;
      let x = 0, z = 0;
      for (let tries = 0; tries < 60; tries++) {
        let u, w;
        if (mom) { const [mu, mw] = local(f, mom.x, mom.z), a = rand() * TAU; u = mu + Math.cos(a) * 1.8; w = mw + Math.sin(a) * 1.8; }
        else if (kind === 'sheep') { u = f.flock[0] + (rand() + rand() - 1) * f.hx * 0.55; w = f.flock[1] + (rand() + rand() - 1) * f.hz * 0.55; }
        else { u = (rand() - 0.5) * 2 * (f.hx - 5); w = (rand() - 0.5) * 2 * (f.hz - 5); }
        u = clamp(u, -f.hx + 3, f.hx - 3); w = clamp(w, -f.hz + 3, f.hz - 3);
        toWorld(f, u, w, A); x = A.x; z = A.z;
        if (mom || !f.animals.some((o) => Math.hypot(o.x - x, o.z - z) < plan.gap * 1.6)) break;
      }
      // Holsteins (patched by the shader) or browns, calves like their mothers; sheep mostly with black faces
      let cBody, cHead, brown = false;
      if (kind === 'cow') {
        brown = mom ? mom.brown : rand() < 0.28;
        cBody = cHead = mom ? mom.cBody : col(brown ? pick(BROWNS) : HOLSTEIN);
      } else {
        const blackSheep = !mom && f.blackLeft-- > 0;
        cBody = col(blackSheep ? '#47423e' : young ? '#ffffff' : pick(['#ffffff', '#ffffff', '#f2ede2', '#e1dbcd']));
        cHead = mom && rand() < 0.7 ? mom.cHead : col(pick(FACES));
      }
      const a = {
        kind, plan, f, mom, young, brown, x, z, y: NR.groundY(x, z), yaw: rand() * TAU, sc: young ? (kind === 'cow' ? 0.58 : 0.56) : 0.94 + rand() * 0.12,
        state: 'graze', until: 0, tx: x, tz: z, spd: 0, ph: rand() * TAU, hp: 0, hy: 0, lie: 0, lieT: 0, looking: false,
        seed: rand() * 50, cBody, cHead, cLegs: kind === 'cow' ? cBody : cHead, slot: -1,
      };
      if (mom) a.yaw = mom.yaw + (rand() - 0.5);
      f.animals.push(a); herd[kind].push(a);
      return a;
    }
    fields.forEach((f) => {
      f.flock = [(rand() - 0.5) * f.hx * 0.6, (rand() - 0.5) * f.hz * 0.6];
      f.blackLeft = 1; // one black sheep in every flock
      const moms = [];
      for (let i = 0; i < f.def.n; i++) moms.push(spawn(f, f.kind, null));
      for (let i = 0; i < f.def.young; i++) spawn(f, f.kind, moms[i * 3 % moms.length]);
    });

    // instanced parts, sized for every animal of the kind (the counts drop to the fields that are awake)
    function parts(kind, geos, mats) {
      const n = herd[kind].length, out = {};
      Object.keys(geos).forEach((k) => {
        const per = k === 'leg' ? 4 : 1, geo = geos[k];
        if (kind === 'cow') geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(n * per), 1));
        const m = new THREE.InstancedMesh(geo, mats[k], Math.max(1, n * per));
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.setColorAt(0, new THREE.Color(1, 1, 1)); // the colour attribute must exist before the first draw
        m.count = 0; m.visible = false; m.castShadow = true; m.frustumCulled = false; m.per = per;
        scene.add(m); out[k] = m;
      });
      return out;
    }
    const mesh = {
      cow: parts('cow', cowShapes(), { body: cowMat, head: cowMat, leg: cowMat, tail: cowMat }),
      sheep: parts('sheep', sheepShapes(), { body: woolMat, head: skinMat, leg: skinMat }),
    };

    // Number the animals in the fields that are awake, and give each slot its colours (and patch seed).
    function relayout() {
      ['cow', 'sheep'].forEach((kind) => {
        const M = mesh[kind];
        let i = 0;
        for (const f of fields) if (f.kind === kind && f.active) for (const a of f.animals) {
          a.slot = i++;
          M.body.setColorAt(a.slot, a.cBody); M.head.setColorAt(a.slot, a.cHead);
          if (M.tail) M.tail.setColorAt(a.slot, a.cBody);
          for (let k = 0; k < 4; k++) M.leg.setColorAt(a.slot * 4 + k, a.cLegs);
          if (kind === 'cow') Object.values(M).forEach((m) => { for (let k = 0; k < m.per; k++) m.geometry.attributes.aSeed.array[a.slot * m.per + k] = a.seed + k * 0.37; });
        }
        Object.values(M).forEach((m) => {
          m.count = i * m.per; m.visible = i > 0;
          m.instanceColor.needsUpdate = true;
          if (m.geometry.attributes.aSeed) m.geometry.attributes.aSeed.needsUpdate = true;
        });
      });
    }

    // ---------- behaviour ----------
    // choose what to do next; at night more of them lie down
    function decide(a, t, nightK) {
      const f = a.f;
      if (a.mom) {
        // the young keep close to their mother, and otherwise do as she does
        const m = a.mom, d = Math.hypot(m.x - a.x, m.z - a.z);
        if (d > 4) { a.state = d > 9 ? 'trot' : 'walk'; aim(a, m.x + Math.sin(m.yaw + 2) * 1.6, m.z + Math.cos(m.yaw + 2) * 1.6); a.until = t + 12; a.lieT = 0; return; }
        a.state = m.state === 'lie' ? 'lie' : m.state === 'walk' || m.state === 'trot' ? 'stand' : m.state;
        a.lieT = a.state === 'lie' ? 1 : 0;
        a.until = t + 2 + Math.random() * 4;
        return;
      }
      const r = Math.random(), lieP = 0.1 + 0.45 * nightK;
      a.lieT = 0;
      if (r < lieP) { a.state = 'lie'; a.lieT = 1; a.until = t + 25 + Math.random() * 45; }
      else if (r < lieP + 0.3) {
        a.state = 'walk'; a.until = t + 40;
        // a short stroll; sheep drift back towards their flock
        const [u, w] = local(f, a.x, a.z);
        let tu = u + (Math.random() - 0.5) * 24, tw = w + (Math.random() - 0.5) * 16;
        if (a.kind === 'sheep') { tu = (tu + f.flock[0]) / 2; tw = (tw + f.flock[1]) / 2; }
        toWorld(f, clamp(tu, -f.hx + 3, f.hx - 3), clamp(tw, -f.hz + 3, f.hz - 3), A);
        aim(a, A.x, A.z);
      } else if (r < lieP + 0.42) { a.state = 'stand'; a.until = t + 4 + Math.random() * 7; }
      else { a.state = 'graze'; a.until = t + 8 + Math.random() * 20; }
    }
    function aim(a, x, z) {
      const f = a.f, [u, w] = local(f, x, z);
      toWorld(f, clamp(u, -f.hx + 2.5, f.hx - 2.5), clamp(w, -f.hz + 2.5, f.hz - 2.5), A);
      a.tx = A.x; a.tz = A.z;
    }

    const eB = new THREE.Euler(), qB = new THREE.Quaternion(), vB = new THREE.Vector3(), sB = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const mB = new THREE.Matrix4(), mL = new THREE.Matrix4(), mO = new THREE.Matrix4();
    function live(a, dt, t, cars, nightK, f) {
      const P = a.plan;
      if (t > a.until) decide(a, t, nightK);
      a.lie += clamp(a.lieT - a.lie, -dt * 0.6, dt * 0.6);
      const up = clamp(1 - a.lie * 1.5, 0, 1);

      // the nearest car close enough to watch
      let cx = 0, cz = 0, best = P.lookR;
      for (const c of cars) { const d = Math.hypot(c.x - a.x, c.z - a.z); if (d < best) { best = d; cx = c.x; cz = c.z; } }
      const look = best < P.lookR;
      a.looking = look;
      // sheep near the road trot away from a car going by
      if (look && a.kind === 'sheep' && best < 38 && a.lie < 0.1 && a.state !== 'trot') {
        const [u, w] = local(f, a.x, a.z);
        if (w < -f.hz + 12) { a.state = 'trot'; a.until = t + 6; toWorld(f, u + (Math.random() - 0.5) * 6, w + 8 + Math.random() * 6, A); aim(a, A.x, A.z); }
      }

      // walking
      let want = 0;
      if (a.state === 'walk' || a.state === 'trot') {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.8) { a.state = a.mom ? 'stand' : 'graze'; a.until = t + 5 + Math.random() * 12; }
        else {
          const turn = wrap(Math.atan2(dx, dz) - a.yaw);
          a.yaw += clamp(turn, -dt * 1.1, dt * 1.1);
          want = (a.state === 'trot' ? 1.9 : P.walk * (a.mom ? 1.3 : 1)) * up * Math.max(0, Math.cos(turn));
        }
      } else if (a.state === 'graze') {
        want = 0.06 * up; // grazing creeps forward
        a.yaw += Math.sin(t * 0.13 + a.seed) * dt * 0.12;
      }
      a.spd += (want - a.spd) * Math.min(1, dt * 3);
      if (a.spd > 0.001) {
        a.x += Math.sin(a.yaw) * a.spd * dt; a.z += Math.cos(a.yaw) * a.spd * dt;
        const [u, w] = local(f, a.x, a.z), lim = 2.2;
        if (Math.abs(u) > f.hx - lim || Math.abs(w) > f.hz - lim) {
          toWorld(f, clamp(u, -f.hx + lim, f.hx - lim), clamp(w, -f.hz + lim, f.hz - lim), A); a.x = A.x; a.z = A.z;
          if (a.state === 'graze') { a.state = 'walk'; aim(a, f.C.x, f.C.z); a.until = t + 20; }
        }
        a.ph += (a.spd / (P.stride * a.sc)) * TAU * dt;
      }

      // where the head goes
      let hp, hy;
      if (look) {
        const rel = wrap(Math.atan2(cx - a.x, cz - a.z) - a.yaw);
        hy = clamp(rel, -1.25, 1.25); hp = -0.12 + P.lift;
        // standing still, turn the body to keep a car behind in view
        if (Math.abs(rel) > 1.25 && a.spd < 0.1 && a.lie < 0.1) a.yaw += clamp(rel - Math.sign(rel) * 1.25, -dt * 0.5, dt * 0.5);
      } else if (a.state === 'graze') { hp = P.graze + 0.06 * Math.sin(t * 5 + a.seed); hy = 0.25 * Math.sin(t * 0.4 + a.seed); }
      else if (a.state === 'walk' || a.state === 'trot') { hp = 0.32 + P.lift; hy = 0; }
      else if (a.state === 'lie') { hp = -0.15 + P.lift; hy = 0.45 * Math.sin(t * 0.2 + a.seed); } // head up, chewing the cud
      else { hp = 0.12 + P.lift; hy = 0.6 * Math.sin(t * 0.3 + a.seed); }
      const k = 1 - Math.exp(-dt * 2.6);
      a.hp += (hp - a.hp) * k; a.hy += (hy - a.hy) * k;
    }

    // write the animal's parts into its instance slots
    function pose(a, t) {
      const P = a.plan, s = a.sc, M = mesh[a.kind], drop = P.drop * a.lie * a.lie * (3 - 2 * a.lie);
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), hl = P.half * s;
      const yF = NR.groundY(a.x + fx * hl, a.z + fz * hl), yB = NR.groundY(a.x - fx * hl, a.z - fz * hl);
      a.y = (yF + yB) / 2;
      qB.setFromEuler(eB.set(-Math.atan2(yF - yB, 2 * hl), a.yaw, 0, 'YXZ'));
      mB.compose(vB.set(a.x, a.y, a.z), qB, sB.set(s, s, s));
      let bob = Math.abs(Math.sin(a.ph)) * Math.min(1, a.spd) * 0.03;
      if (a.mom && a.kind === 'sheep' && a.state === 'trot') bob += Math.abs(Math.sin(a.ph)) * 0.12; // lambs skip
      mL.makeTranslation(0, bob - drop, 0); M.body.setMatrixAt(a.slot, mO.multiplyMatrices(mB, mL));
      qB.setFromEuler(eB.set(a.hp, a.hy, 0, 'YXZ'));
      mL.compose(vB.set(P.neck[0], P.neck[1] + bob - drop, P.neck[2]), qB, one);
      M.head.setMatrixAt(a.slot, mO.multiplyMatrices(mB, mL));
      const swing = Math.min(1, a.spd / 0.4) * (a.state === 'trot' ? 0.6 : 0.38) * (1 - a.lie);
      for (let k = 0; k < 4; k++) {
        const h = P.hips[k], fold = (k < 2 ? 1.45 : -1.45) * a.lie; // lying, the legs fold under the body
        qB.setFromEuler(eB.set(swing * Math.sin(a.ph + LEG_PHASE[k] * TAU) + fold, 0, 0));
        mL.compose(vB.set(h[0], h[1] - drop, h[2]), qB, sB.set(1, 1 - 0.5 * a.lie, 1));
        M.leg.setMatrixAt(a.slot * 4 + k, mO.multiplyMatrices(mB, mL));
      }
      if (M.tail) {
        const sw = 0.28 * Math.sin(t * 1.7 + a.seed) * (0.5 + 0.5 * Math.sin(t * 0.23 + a.seed));
        qB.setFromEuler(eB.set(0.08 + 0.45 * a.lie, 0, sw * (1 - a.lie))); // lying, it lies along the ground behind
        mL.compose(vB.set(P.tail[0], P.tail[1] - drop, P.tail[2]), qB, sB.set(1, 1 - 0.25 * a.lie, 1));
        M.tail.setMatrixAt(a.slot, mO.multiplyMatrices(mB, mL));
      }
    }

    const api = { fields, onCall: null, yard: farmGroup, fence };
    let lastT = null;
    const near = [];
    // t in seconds; focusPos is what the camera follows, camPos where it is; nightK 0 by day, 1 at night
    api.update = function (t, focusPos, cars, nightK, camPos) {
      const dt = lastT == null ? 0 : clamp(t - lastT, 0, 0.1);
      lastT = t;
      let changed = false;
      for (const f of fields) {
        const r = Math.hypot(f.hx, f.hz) + AWAKE;
        const dFocus = focusPos ? Math.hypot(focusPos.x - f.C.x, focusPos.z - f.C.z) : 0;
        const dCam = camPos ? Math.hypot(camPos.x - f.C.x, camPos.z - f.C.z) : dFocus;
        const on = Math.min(dFocus, dCam) < r;
        if (on !== f.active) { f.active = on; changed = true; }
        f.dCam = dCam;
      }
      if (changed) relayout();
      const touched = { cow: false, sheep: false };
      for (const f of fields) {
        if (!f.active) continue;
        near.length = 0;
        if (cars) for (const c of cars) if (!c.hidden && (c.v || 0) > 6 && Math.hypot(c.world.x - f.C.x, c.world.z - f.C.z) < f.hx + 110) near.push(c.world);
        let watching = false;
        for (const a of f.animals) { live(a, dt, t, near, nightK || 0, f); pose(a, t); watching = watching || a.looking; }
        const startled = watching && !f.watching && t - f.lastWatch > 8; // heads come up after a quiet spell
        f.watching = watching;
        if (watching) f.lastWatch = t;
        touched[f.kind] = true;
        // now and then one of them calls out, and sometimes when a car roars by
        if (api.onCall && f.dCam < CALL_R && f.animals.length) {
          const startle = startled && Math.random() < 0.35 && t - f.lastCall > 3;
          if (t > f.nextCall || startle) {
            const a = f.animals[(Math.random() * f.animals.length) | 0];
            api.onCall(f.kind, vB.set(a.x, a.y + 1, a.z), a.young);
            f.lastCall = t;
            f.nextCall = t + (f.kind === 'sheep' ? 5 : 7) + Math.random() * 10;
          }
        }
      }
      ['cow', 'sheep'].forEach((kind) => { if (touched[kind]) Object.values(mesh[kind]).forEach((m) => { m.instanceMatrix.needsUpdate = true; }); });
      if (farmGroup) farmGroup.visible = yard.dCam < 1300;
    };
    fields.forEach((f) => { f.watching = false; f.lastWatch = -1e9; });
    Object.defineProperty(api, 'count', { get: () => herd.cow.length + herd.sheep.length });
    api.herd = herd; api.mesh = mesh;
    return api;
  }

  NR.buildFarm = buildFarm;
})();
