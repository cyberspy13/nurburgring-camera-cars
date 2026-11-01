// pits.js — the pit crews and their kit. Each car has a box in the pit lane with its garage board, box
// markings and fuel rig, and a ten-strong crew in team colours who run a GT3 endurance stop: the lollipop
// man, the air-jack man, a refueller with a fire marshal beside him, four wheel men, and the two drivers
// swapping over. The race (cars.js) decides when the car stops and for how long; this file acts it out.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});

  NR.createPits = function (race, track, scene) {
    const { col, canvasTex } = NR.world;
    const PIT = track.PIT, cars = race.cars;
    const FONT = '"Saira Condensed", "Arial Narrow", sans-serif';
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    const lerp = (a, b, k) => a + (b - a) * k;
    const GARAGE_X = PIT.garage - PIT.box; // box space: x across the lane (+ towards the garage), z along it, y up
    const RIG = { x: GARAGE_X - 0.45, z: -2.6 };
    const LIFT = 0.035; // the pit lane surface above the road plane

    // ---------- the figure: ten boxes on a simple skeleton, instanced across every crew ----------
    const box = (w, h, d, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y, z || 0); return g; };
    const PARTS = [ // [key, geometry, per figure, coloured by]
      ['torso', box(0.4, 0.6, 0.25, 0.3), 1, 'suit'],
      ['head', (() => { const g = new THREE.SphereGeometry(0.145, 14, 10); g.translate(0, 0.17, 0); return g; })(), 1, 'helmet'],
      ['visor', box(0.2, 0.065, 0.06, 0.19, 0.115), 1, null],
      ['upper', box(0.11, 0.3, 0.12, -0.15), 2, 'suit'],
      ['fore', box(0.1, 0.32, 0.11, -0.16), 2, 'glove'],
      ['thigh', box(0.16, 0.45, 0.17, -0.225), 2, 'suit'],
      ['shin', box(0.14, 0.47, 0.15, -0.235), 2, 'boot'],
    ];
    // joint angles: lean, left hip, left knee, right hip, right knee, then per arm (left, right) pitch
    // forward, roll out, swing in, elbow bend, and the head's nod
    const POSE = {
      stand: [0.03, 0, 0.05, 0, 0.05, 0.1, 0.1, 0, 0.2, 0.1, 0.1, 0, 0.2, 0],
      kneel: [0.35, 1.5, 1.6, 0.1, 1.55, 0.95, 0.05, 0.35, 0.75, 0.95, 0.05, 0.35, 0.75, 0.35],
      pull: [0.55, 1.2, 1.9, 1.2, 1.9, 1.05, 0, 0.3, 0.3, 1.05, 0, 0.3, 0.3, 0.3],
      carry: [0.05, 0, 0.05, 0, 0.05, 0.75, 0, 0.35, 1.3, 0.75, 0, 0.35, 1.3, 0.1],
      nozzle: [0.12, 0.05, 0.1, 0.05, 0.1, 1.25, 0, 0.25, 0.5, 1.25, 0, 0.25, 0.5, 0.2],
      extinguish: [0.05, 0, 0.05, 0, 0.05, 0.9, 0, 0.3, 0.5, 0.9, 0, 0.3, 0.5, 0.15],
      board: [0.03, 0, 0.05, 0, 0.05, 0.1, 0.1, 0, 0.2, 1.45, 0, 0, 0.05, 0],
      boardUp: [0.0, 0, 0.05, 0, 0.05, 0.1, 0.1, 0, 0.2, 2.7, 0, 0, 0.1, -0.1],
      raise: [0.03, 0, 0.05, 0, 0.05, 2.9, 0.1, 0, 0.1, 0.3, 0.1, 0, 0.3, 0],
      lance: [0.5, 1.25, 2.0, 1.25, 2.0, 1.15, 0, 0.25, 0.25, 1.15, 0, 0.25, 0.25, 0.25],
    };
    const NP = POSE.stand.length;
    const ROLES = ['lollipop', 'jack', 'fuel', 'fire', 'wheel', 'wheel', 'wheel', 'wheel', 'driverOut', 'driverIn'];
    const N = cars.length * ROLES.length;

    const partMeshes = {};
    PARTS.forEach(([key, geo, per, by]) => {
      const mat = new THREE.MeshStandardMaterial({ color: by ? 0xffffff : col('#16191d'), roughness: by === 'helmet' ? 0.3 : 0.75, metalness: by === 'helmet' ? 0.1 : 0 });
      const m = new THREE.InstancedMesh(geo, mat, N * per);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true; m.receiveShadow = true;
      partMeshes[key] = m;
      scene.add(m);
    });

    // ---------- props ----------
    const prop = (geo, hex, count, o) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial(Object.assign({ color: col(hex), roughness: 0.6 }, o || {})), count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = true;
      scene.add(m);
      return m;
    };
    const tyreGeo = new THREE.CylinderGeometry(1, 1, 1, 22); tyreGeo.rotateZ(Math.PI / 2); // axle along x
    const rimGeo = new THREE.CylinderGeometry(0.62, 0.62, 1.04, 16); rimGeo.rotateZ(Math.PI / 2);
    const P = {
      tyre: prop(tyreGeo, '#17181a', cars.length * 8, { roughness: 0.85 }),
      rim: prop(rimGeo, '#9aa1a8', cars.length * 8, { metalness: 0.7, roughness: 0.35 }),
      gun: prop(box(0.08, 0.1, 0.26, 0, 0.06), '#2a2e33', cars.length * 4, { metalness: 0.5 }),
      lance: prop((() => { const g = new THREE.CylinderGeometry(0.02, 0.02, 1, 6); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5); return g; })(), '#c9ced3', cars.length, { metalness: 0.8, roughness: 0.3 }),
      nozzle: prop((() => { const g = new THREE.CylinderGeometry(0.05, 0.06, 0.34, 8); g.rotateZ(Math.PI / 2); return g; })(), '#202326', cars.length, { metalness: 0.4 }),
      bottle: prop(new THREE.CylinderGeometry(0.075, 0.075, 0.46, 10), '#d01f1f', cars.length, { roughness: 0.4 }),
    };
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    Object.values(P).forEach((m) => { for (let i = 0; i < m.count; i++) m.setMatrixAt(i, ZERO); });

    // ---------- each team's box ----------
    const fr = track.newFrame();
    const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
    const ink = (hex) => (lum(hex) > 0.55 ? '#111418' : '#ffffff');
    const hoseMat = new THREE.MeshStandardMaterial({ color: col('#1c1f22'), roughness: 0.6 });
    const rigMat = new THREE.MeshStandardMaterial({ color: col('#aeb4ba'), metalness: 0.5, roughness: 0.4 });
    const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
    const teams = cars.map((c, ti) => {
      track.frame(track.S_FINISH + PIT.boxes[ti], PIT.box, fr);
      const M = new THREE.Matrix4().makeBasis(fr.side, fr.up, fr.fwd).setPosition(fr.pos.x, fr.pos.y + LIFT, fr.pos.z);
      const Q = new THREE.Quaternion().setFromRotationMatrix(M);
      const r = c.rig, half = c.wid / 2 + 0.03, bus = c.type === 'bus';
      const g = {
        half, nose: r.nose || c.len / 2, rear: bus ? -r.nose : -c.len / 2, eyeZ: r.eye.z,
        wheels: r.wheels.map((w) => ({ x: w.pivot.position.x, z: w.pivot.position.z, r: r.wheelR, w: bus ? 0.4 : 0.31 })),
        filler: bus ? { x: half, y: 0.85, z: r.rearZ - 1.2 } : { x: half, y: 0.95, z: r.rearZ + 0.45 },
      };
      const group = new THREE.Group(); group.matrixAutoUpdate = false; group.matrix.copy(M); scene.add(group);
      const addTo = (mesh, x, y, z) => { mesh.position.set(x, y, z); group.add(mesh); return mesh; };

      // the garage board over the opening, and a stripe of team colour inside it
      const name = `${c.brand} #${c.num}`.toUpperCase();
      const boardT = canvasTex(1024, 80, (gx, w, h) => {
        gx.fillStyle = c.base; gx.fillRect(0, 0, w, h);
        gx.fillStyle = c.accent; gx.fillRect(0, h - 10, w, 10);
        gx.fillStyle = ink(c.base); gx.textAlign = 'center'; gx.textBaseline = 'middle';
        gx.font = `800 54px ${FONT}`; gx.fillText(name, w / 2, h / 2 - 3, w * 0.92);
      });
      // (the opening reaches 4.05 m above the lane, the glazing starts at 4.95 m)
      const sign = addTo(new THREE.Mesh(new THREE.PlaneGeometry(10.4, 0.8), new THREE.MeshStandardMaterial({ map: boardT, emissive: col('#ffffff'), emissiveMap: boardT, emissiveIntensity: 0.2, roughness: 0.5 })), GARAGE_X - 0.02, 4.5, 0);
      sign.rotation.y = -Math.PI / 2;
      const stripe = addTo(new THREE.Mesh(new THREE.PlaneGeometry(10.6, 0.22), new THREE.MeshStandardMaterial({ color: col(c.base), emissive: col(c.base), emissiveIntensity: 0.35 })), GARAGE_X - 0.17, 3.9, 0);
      stripe.rotation.y = -Math.PI / 2;

      // the box painted on the lane: an outline in team colour with the number at the front
      const L = c.len + 2.6, Wd = c.wid + 1.6;
      const markT = canvasTex(256, Math.round(256 * L / Wd), (gx, w, h) => {
        gx.strokeStyle = c.base === '#16181b' ? c.accent : c.base; gx.lineWidth = 9; gx.strokeRect(6, 6, w - 12, h - 12);
        gx.fillStyle = gx.strokeStyle; gx.textAlign = 'center'; gx.textBaseline = 'middle';
        // the number just ahead of the car's nose, reading from the front of the box
        const px = w / Wd; // canvas pixels per metre
        gx.font = `800 ${Math.round(0.85 * px)}px ${FONT}`;
        gx.save(); gx.translate(w / 2, 0.62 * px); gx.rotate(Math.PI); gx.fillText(String(c.num), 0, 0, (Wd - 0.6) * px); gx.restore();
      });
      const mark = addTo(new THREE.Mesh(new THREE.PlaneGeometry(Wd, L), new THREE.MeshStandardMaterial({ map: markT, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 })), 0, 0.006, (g.nose + g.rear) / 2);
      mark.rotation.set(-Math.PI / 2, 0, Math.PI); // its top edge (the number) at the front of the box

      // the fuel rig by the garage, its hose hanging ready
      addTo(new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.5, 0.45), rigMat), RIG.x, 1.25, RIG.z).castShadow = true;
      addTo(new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.3, 0.47), new THREE.MeshStandardMaterial({ color: col(c.base), roughness: 0.5 })), RIG.x, 1.9, RIG.z);
      addTo(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), rigMat), RIG.x - 0.45, 2.46, RIG.z);
      const hose = addTo(new THREE.Mesh(new THREE.BufferGeometry(), hoseMat), 0, 0, 0);

      // the lollipop: a board on a pole with the car's number
      const lolT = canvasTex(128, 128, (gx, w, h) => {
        gx.fillStyle = c.base; gx.beginPath(); gx.arc(w / 2, h / 2, w * 0.47, 0, Math.PI * 2); gx.fill();
        gx.lineWidth = 7; gx.strokeStyle = ink(c.base); gx.stroke();
        gx.fillStyle = ink(c.base); gx.textAlign = 'center'; gx.textBaseline = 'middle';
        gx.font = `800 ${String(c.num).length > 2 ? 46 : 60}px ${FONT}`; gx.fillText(String(c.num), w / 2, h / 2 + 3);
      });
      const lolly = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), rigMat); pole.geometry.translate(0, 0.5, 0);
      const disc = new THREE.Group(), lolB = lolT.clone(); lolB.wrapS = THREE.RepeatWrapping; lolB.repeat.x = -1; lolB.needsUpdate = true;
      [[lolT, THREE.FrontSide], [lolB, THREE.BackSide]].forEach(([map, side]) => disc.add(new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshStandardMaterial({ map, side, roughness: 0.6 })))); // reads from both sides
      lolly.add(pole); lolly.add(disc); lolly.visible = false; scene.add(lolly);

      const members = ROLES.map((role, k) => ({
        role, k, wheel: role === 'wheel' ? k - 4 : -1,
        x: GARAGE_X + 0.4, z: -4 + k * 0.9, yaw: -Math.PI / 2, pose: Float32Array.from(POSE.stand), ph: Math.random() * 6,
        shown: false, stage: '', moving: false, done: false, s: null,
        hL: new THREE.Matrix4(), hR: new THREE.Matrix4(), // where its hands are, for the props it holds
      }));
      return { c, ti, M, Q, g, group, hose, hoseKey: '', lolly, disc, pole, members, mode: 'idle', plan: null, t: 0, callT: 0, relT: 0, wheelsOff: g.wheels.map(() => false) };
    });

    // colours: suits in the car's main colour, helmets in its accent; the drivers the other way round
    {
      const c3 = new THREE.Color();
      teams.forEach((tm) => {
        const c = tm.c, dark = lum(c.base) < 0.12 ? c.accent : c.base;
        tm.members.forEach((m, k) => {
          const i = tm.ti * ROLES.length + k, driver = m.role.startsWith('driver');
          const COL = { suit: driver ? c.accent : dark, helmet: driver ? dark : c.accent, glove: '#1d1f22', boot: '#141518' };
          PARTS.forEach(([key, , per, by]) => {
            if (!by) return;
            for (let s = 0; s < per; s++) partMeshes[key].setColorAt(i * per + s, c3.copy(col(COL[by])));
          });
        });
      });
      PARTS.forEach(([key]) => { const m = partMeshes[key]; for (let i = 0; i < m.count; i++) m.setMatrixAt(i, ZERO); if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    }

    // ---------- posing ----------
    const mats = { root: new THREE.Matrix4(), pel: new THREE.Matrix4(), tor: new THREE.Matrix4(), part: new THREE.Matrix4(), up: new THREE.Matrix4(), t: new THREE.Matrix4() };
    const T = (x, y, z) => mats.t.makeTranslation(x, y, z);
    const RX = (a) => mats.t.makeRotationX(a), RY = (a) => mats.t.makeRotationY(a), RZ = (a) => mats.t.makeRotationZ(a);
    const legDrop = (h, k) => 0.45 * Math.cos(h) + 0.47 * Math.cos(h - k);
    function writeFigure(tm, m) {
      const i = tm.ti * ROLES.length + m.k;
      if (!m.shown) {
        PARTS.forEach(([key, , per]) => { for (let s = 0; s < per; s++) partMeshes[key].setMatrixAt(i * per + s, ZERO); });
        return;
      }
      const p = m.pose;
      const hipY = Math.max(legDrop(p[1], p[2]), legDrop(p[3], p[4]));
      mats.root.copy(tm.M).multiply(T(m.x, 0, m.z)).multiply(RY(m.yaw));
      mats.pel.copy(mats.root).multiply(T(0, hipY, 0));
      mats.tor.copy(mats.pel).multiply(RX(p[0]));
      partMeshes.torso.setMatrixAt(i, mats.tor);
      mats.part.copy(mats.tor).multiply(T(0, 0.6, 0)).multiply(RX(p[13]));
      partMeshes.head.setMatrixAt(i, mats.part); partMeshes.visor.setMatrixAt(i, mats.part);
      for (let s = 0; s < 2; s++) { // s = 0 left (+x), 1 right (-x)
        const sd = s === 0 ? 1 : -1, a = 5 + s * 4;
        mats.up.copy(mats.tor).multiply(T(sd * 0.26, 0.52, 0)).multiply(RY(-sd * p[a + 2])).multiply(RZ(sd * p[a + 1])).multiply(RX(-p[a]));
        partMeshes.upper.setMatrixAt(i * 2 + s, mats.up);
        mats.part.copy(mats.up).multiply(T(0, -0.3, 0)).multiply(RX(-p[a + 3]));
        partMeshes.fore.setMatrixAt(i * 2 + s, mats.part);
        (s === 0 ? m.hL : m.hR).copy(mats.part).multiply(T(0, -0.33, 0.02));
        mats.up.copy(mats.pel).multiply(T(sd * 0.1, 0, 0)).multiply(RX(-p[1 + s * 2]));
        partMeshes.thigh.setMatrixAt(i * 2 + s, mats.up);
        mats.part.copy(mats.up).multiply(T(0, -0.45, 0)).multiply(RX(p[2 + s * 2]));
        partMeshes.shin.setMatrixAt(i * 2 + s, mats.part);
      }
    }
    // a prop at box-space position (x, y, z), turned by yaw, flat (axle up) or upright, scaled
    function propAt(mesh, idx, tm, x, y, z, yaw, flat, sx, sy, sz) {
      if (x == null) { mesh.setMatrixAt(idx, ZERO); return; }
      tmpQ.setFromEuler(new THREE.Euler(0, yaw || 0, flat ? Math.PI / 2 : 0, 'YXZ'));
      tmpM.compose(tmpV.set(x, y, z), tmpQ, new THREE.Vector3(sx || 1, sy || 1, sz || 1));
      mesh.setMatrixAt(idx, tmpM.premultiply(tm.M));
    }
    const handMid = (m, out) => out.set(0, 0, 0).applyMatrix4(m.hL).add(tmpV.set(0, 0, 0).applyMatrix4(m.hR)).multiplyScalar(0.5);
    const toBox = (tm, v) => v.applyMatrix4(tmpM.copy(tm.M).invert());

    // ---------- the stop, member by member ----------
    // Each member gets a spot to be at, which way to face, and a pose; walking there is handled below.
    const home = (m) => ({ x: GARAGE_X + 0.4, z: -4 + m.k * 0.9 });
    function station(tm, w) { const s = Math.sign(w.x) || 1; return { x: w.x + s * 0.8, z: w.z, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2 }; }
    function tyreSpot(tm, w) { const s = Math.sign(w.x) || 1; return { x: w.x + s * 1.55, z: w.z }; }
    // the old tyre is laid beside the car; on the far side behind its wheel, clear of the line the car takes out of the box
    function oldSpot(tm, w) { const s = Math.sign(w.x) || 1; return s > 0 ? { x: w.x + 1.2, z: w.z + (w.z > 0 ? 1.0 : -1.0) } : { x: w.x - 1.45, z: w.z - 1.0 }; }
    function script(tm, m) {
      const g = tm.g, t = tm.t, Pl = tm.plan, mode = tm.mode;
      const face = -Math.PI / 2; // looking across at the car from the garage side
      const back = { ...home(m), yaw: Math.PI / 2, pose: 'stand', gone: true };
      if (m.done) return { ...back, hide: true };
      if (mode === 'return') {
        const r = race.time - tm.relT;
        if (m.role === 'lollipop' && r < 1.5) return { x: g.half + 0.9, z: g.nose + 1.3, yaw: face, pose: 'boardUp' };
        if (m.role === 'wheel' && m.stage !== 'homeward') {
          const o = oldSpot(tm, g.wheels[m.wheel]);
          return { x: o.x + (Math.sign(o.x) || 1) * 0.45, z: o.z, yaw: Math.sign(o.x) > 0 ? -Math.PI / 2 : Math.PI / 2, pose: 'pull', pickUp: true };
        }
        return back;
      }
      if (mode === 'call') {
        switch (m.role) {
          case 'lollipop': return { x: g.half + 0.9, z: g.nose + 1.3, yaw: face, pose: 'board' };
          case 'jack': return { x: g.half + 0.75, z: g.rear - 0.7, yaw: face, pose: 'stand' };
          case 'fuel': return { x: RIG.x - 0.6, z: RIG.z + 0.5, yaw: face, pose: 'stand' };
          case 'fire': return { x: RIG.x - 0.7, z: RIG.z - 0.8, yaw: face, pose: 'extinguish' };
          case 'wheel': {
            const w = g.wheels[m.wheel];
            if (m.stage !== 'placed') { const ts = tyreSpot(tm, w); return { x: ts.x + (Math.sign(w.x) || 1) * 0.4, z: ts.z, yaw: station(tm, w).yaw, pose: 'carry', placeTyre: true }; }
            return { ...station(tm, w), pose: 'kneel' };
          }
          case 'driverIn': return { x: g.half + 1.7, z: g.eyeZ + 1.1, yaw: face, pose: 'stand' };
          default: return { ...back, hide: true };
        }
      }
      // mode 'stop': t is the time since the car stopped
      switch (m.role) {
        case 'lollipop': return { x: g.half + 0.9, z: g.nose + 1.3, yaw: face, pose: t > Pl.release - 0.5 ? 'boardUp' : 'board' };
        case 'jack':
          if (t < 0.3 || t > Pl.drop) return { x: g.half + 0.75, z: g.rear - 0.7, yaw: face, pose: 'stand' };
          return { x: 0.32, z: g.rear - 0.62, yaw: 0, pose: 'lance', run: true, lance: true };
        case 'fuel':
          if (t < 0.6 || t > Pl.fuelOff) return { x: RIG.x - 0.6, z: RIG.z + 0.5, yaw: face, pose: 'stand' };
          return { x: g.filler.x + 0.62, z: g.filler.z, yaw: face, pose: 'nozzle', run: true };
        case 'fire':
          if (t < 0.6 || t > Pl.fuelOff + 0.5) return { x: RIG.x - 0.7, z: RIG.z - 0.8, yaw: face, pose: 'extinguish' };
          return { x: g.filler.x + 1.7, z: g.filler.z - 1.1, yaw: Math.atan2(-1.7, 1.1), pose: 'extinguish' };
        case 'wheel': {
          const w = g.wheels[m.wheel], st = station(tm, w), a = Pl.tyresOn, b = a + 1 + Pl.stuck[m.wheel], c2 = b + 1.2, d2 = c2 + 1.4, e = Pl.wheels[m.wheel];
          const pose = t < b ? 'kneel' : t < d2 ? 'pull' : t < e ? 'kneel' : 'raise';
          // done: hand up, and on the far side a step back out of the car's way
          if (pose === 'raise' && w.x < 0) return { ...st, x: w.x - 1.4, pose };
          return { ...st, pose, gun: t < b || (t >= d2 && t < e) };
        }
        case 'driverOut':
          if (t < Pl.driverOut) return { ...back, hide: true };
          if (!m.shown) { m.x = g.half + 0.45; m.z = g.eyeZ; m.yaw = 0; }
          return back;
        case 'driverIn':
          if (t < 1.6) return { x: g.half + 1.7, z: g.eyeZ + 1.1, yaw: face, pose: 'stand' };
          return { x: g.half + 0.4, z: g.eyeZ, yaw: face, pose: 'stand', getIn: t > Pl.driverIn };
      }
      return back;
    }

    // what each team is up to, from the state of its car
    function teamMode(tm) {
      const p = tm.c.pit;
      if (race.phase === 'ceremony' || (!p && tm.mode === 'idle')) return 'idle';
      if (p && (p.phase === 'enter' || p.phase === 'lane' || p.phase === 'box')) { tm.callT = p.callT; return 'call'; }
      if (p && p.phase === 'stop') { tm.plan = p.plan; tm.t = p.t; return 'stop'; }
      if (tm.mode === 'idle') return 'idle'; // back in the garage while the car is still on its way out
      if (p && p.relT) tm.relT = p.relT;
      return 'return';
    }

    let lastT = 0;
    function update() {
      const now = race.time, dt = clamp(now - lastT, 0, 0.25);
      const restarted = now < lastT - 0.5;
      lastT = now;
      const k = 1 - Math.exp(-dt * 10);
      teams.forEach((tm) => {
        const prev = tm.mode;
        tm.mode = restarted ? 'idle' : teamMode(tm);
        if (tm.mode === 'return' && prev !== 'return' && !tm.relT) tm.relT = now;
        if (tm.mode === 'idle') {
          if (prev !== 'idle') reset(tm);
          return;
        }
        if (prev === 'idle') { tm.relT = 0; tm.members.forEach((m) => { Object.assign(m, home(m)); m.stage = ''; m.shown = false; m.done = false; m.yaw = -Math.PI / 2; m.pose.set(POSE.stand); }); }
        const g = tm.g, Pl = tm.plan, t = tm.t;
        let lollyOn = false, nozzleAt = null;
        tm.members.forEach((m) => {
          const s = m.s = script(tm, m);
          // appear at the garage on the way out; vanish back into it (or into the car)
          if (!m.shown && !s.hide && !(s.gone && tm.mode !== 'stop' && m.role.startsWith('driver'))) {
            m.shown = !s.gone || m.role === 'driverOut';
            if (m.shown && m.role !== 'driverOut') Object.assign(m, home(m));
          }
          if (s.hide) m.shown = false;
          if (s.getIn && m.shown && Math.hypot(m.x - s.x, m.z - s.z) < 0.15) { m.shown = false; m.done = true; } // in the car
          // walk (or run) to the spot
          const dx = s.x - m.x, dz = s.z - m.z, dist = Math.hypot(dx, dz);
          const speed = s.run ? 3.4 : 2.2;
          m.moving = dist > 0.06;
          if (m.moving) {
            const step = Math.min(dist, speed * dt);
            m.x += (dx / dist) * step; m.z += (dz / dist) * step;
            m.ph += dt * speed * 4.4;
          }
          const yawT = m.moving && dist > 0.4 ? Math.atan2(dx, dz) : s.yaw;
          let dy = Math.atan2(Math.sin(yawT - m.yaw), Math.cos(yawT - m.yaw));
          m.yaw += clamp(dy, -dt * 7, dt * 7);
          if (s.gone && !m.moving && m.shown) { m.shown = false; m.done = true; } // back in the garage
          // pose: walking strides, carrying with both arms, or the job in hand
          const carrying = s.pose === 'carry' || (m.role === 'wheel' && (m.stage === 'homeward' || (tm.mode === 'call' && m.stage !== 'placed')));
          const target = POSE[m.moving && dist > 0.25 ? (carrying ? 'carry' : 'stand') : s.pose] || POSE.stand;
          for (let q = 0; q < NP; q++) m.pose[q] += (target[q] - m.pose[q]) * k;
          if (m.moving && dist > 0.25) {
            const sw = Math.sin(m.ph) * (s.run ? 0.6 : 0.45);
            m.pose[1] = sw; m.pose[3] = -sw;
            m.pose[2] = 0.1 + Math.max(0, -Math.sin(m.ph)) * 0.8; m.pose[4] = 0.1 + Math.max(0, Math.sin(m.ph)) * 0.8;
            if (!carrying) { m.pose[5] = -sw * 0.8; m.pose[9] = sw * 0.8; }
          }
          // stage changes for the wheel men: tyre put down on arrival, old tyre picked up on the way home
          if (m.role === 'wheel' && !m.moving) {
            if (s.placeTyre) m.stage = 'placed';
            if (s.pickUp) m.stage = 'homeward';
          }
          if (m.role === 'lollipop' && m.shown) lollyOn = true;
          writeFigure(tm, m);
          if (m.role === 'fuel' && m.shown) nozzleAt = handMid(m, new THREE.Vector3());
        });
        if (tm.mode === 'return' && tm.members.every((m) => !m.shown) && race.time - tm.relT > 1) { reset(tm); return; }

        // ---------- props for this team ----------
        const base = tm.ti;
        const lol = tm.members[0], jack = tm.members[1], fuel = tm.members[2], fire = tm.members[3];
        // lollipop: the pole out from the man's right hand, the disc facing the driver coming in
        tm.lolly.visible = lollyOn;
        if (lollyOn) {
          const L0 = new THREE.Vector3().applyMatrix4(lol.hR);
          const dir = new THREE.Vector3(0, -1, 0).transformDirection(lol.hR);
          tm.pole.position.copy(L0); tm.pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); tm.pole.scale.set(1, 1.05, 1);
          tm.disc.position.copy(L0).addScaledVector(dir, 1.1);
          tm.disc.quaternion.copy(tm.Q).multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
        }
        // wheel guns in the wheel men's right hands while they kneel at the wheel
        tm.members.forEach((m) => {
          if (m.role !== 'wheel') return;
          const s = m.s;
          const gi = base * 4 + m.wheel;
          if (m.shown && (s.gun || (tm.mode === 'call' && m.stage === 'placed'))) {
            const w = g.wheels[m.wheel], sgn = Math.sign(w.x) || 1;
            propAt(P.gun, gi, tm, w.x + sgn * 0.3, w.r, w.z, sgn > 0 ? -Math.PI / 2 : Math.PI / 2);
          } else P.gun.setMatrixAt(gi, ZERO);
        });
        // tyres: the new set carried out and laid by each wheel, swapped on, the old set carried in
        g.wheels.forEach((w, i) => {
          const m = tm.members[4 + i], sgn = Math.sign(w.x) || 1, ts = tyreSpot(tm, w), os = oldSpot(tm, w);
          const nI = base * 8 + i, oI = base * 8 + 4 + i, R = w.r, Wd = w.w;
          let nw = null, od = null, off = false;
          // held against the chest, its face towards the man carrying it
          const carried = () => { const v = toBox(tm, handMid(m, new THREE.Vector3())); return [v.x, Math.max(v.y, R + 0.05), v.z, m.yaw + Math.PI / 2, false]; };
          if (tm.mode === 'call') {
            if (m.shown && m.stage !== 'placed') nw = carried();
            else if (m.stage === 'placed') nw = [ts.x, Wd / 2, ts.z, 0, true];
          } else if (tm.mode === 'stop') {
            const a = Pl.tyresOn, b = a + 1 + Pl.stuck[i], c2 = b + 1.2, d2 = c2 + 1.4;
            if (t < b) nw = [ts.x, Wd / 2, ts.z, 0, true];
            else if (t < c2) {
              const k2 = sm((t - b) / 1.2);
              nw = [ts.x, Wd / 2, ts.z, 0, true]; off = true;
              od = [lerp(w.x + sgn * 0.08, os.x, k2), lerp(R, Wd / 2, sm((t - b - 0.6) / 0.6)), lerp(w.z, os.z, k2), 0, k2 > 0.75];
            } else if (t < d2) {
              const k2 = sm((t - c2) / 1.4);
              od = [os.x, Wd / 2, os.z, 0, true]; off = k2 < 0.98;
              if (off) nw = [lerp(ts.x, w.x + sgn * 0.08, k2), lerp(Wd / 2, R, sm(k2 * 1.6)), lerp(ts.z, w.z, k2), 0, k2 < 0.3];
            } else od = [os.x, Wd / 2, os.z, 0, true];
          } else if (tm.mode === 'return') {
            if (m.stage === 'homeward') { if (m.shown) od = carried(); }
            else od = [os.x, Wd / 2, os.z, 0, true];
          }
          tm.wheelsOff[i] = off;
          tm.c.rig.wheels[i].spin.visible = !off;
          [[nw, nI], [od, oI]].forEach(([q, idx]) => {
            if (!q) { P.tyre.setMatrixAt(idx, ZERO); P.rim.setMatrixAt(idx, ZERO); return; }
            const [x, y, z, yaw, flat] = q;
            propAt(P.tyre, idx, tm, x, y, z, flat ? 0 : yaw, flat, Wd, R, R);
            propAt(P.rim, idx, tm, x, y, z, flat ? 0 : yaw, flat, Wd, R, R);
          });
        });
        // the jack man's lance into the back of the car, plugged while it's up on the jacks
        if (jack.shown && tm.mode === 'stop' && t > 0.3 && t < Pl.drop && !jack.moving) propAt(P.lance, base, tm, 0.32, 0.42, g.rear - 0.75, 0, false, 1, 1, 0.8);
        else P.lance.setMatrixAt(base, ZERO);
        // the fire marshal's extinguisher, in both hands
        if (fire.shown) { const v = toBox(tm, handMid(fire, new THREE.Vector3())); propAt(P.bottle, base, tm, v.x, v.y, v.z, 0); } else P.bottle.setMatrixAt(base, ZERO);
        // the refuelling nozzle, coupled to the car while fuel flows, and its hose back to the rig
        let nz;
        if (fuel.shown && tm.mode === 'stop' && t >= Pl.fuelOn && t <= Pl.fuelOff && !fuel.moving) nz = new THREE.Vector3(g.filler.x + 0.17, g.filler.y, g.filler.z);
        else if (fuel.shown && nozzleAt) nz = toBox(tm, nozzleAt.clone());
        else nz = new THREE.Vector3(RIG.x - 0.3, 1.2, RIG.z);
        propAt(P.nozzle, base, tm, nz.x, nz.y, nz.z, 0);
        hoseTo(tm, nz);
      });
      PARTS.forEach(([key]) => { partMeshes[key].instanceMatrix.needsUpdate = true; });
      Object.values(P).forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    }

    // the hose: from the end of the rig's arm, sagging, to the back of the nozzle
    function hoseTo(tm, nz) {
      const key = `${nz.x.toFixed(2)},${nz.y.toFixed(2)},${nz.z.toFixed(2)}`;
      if (key === tm.hoseKey) return;
      tm.hoseKey = key;
      const a = new THREE.Vector3(RIG.x - 0.88, 2.42, RIG.z), b = nz.clone().add(new THREE.Vector3(0.18, 0, 0));
      const mid = a.clone().lerp(b, 0.5); mid.y = Math.min(a.y, b.y) - 0.35 - 0.12 * a.distanceTo(b);
      const curve = new THREE.CatmullRomCurve3([a, a.clone().add(new THREE.Vector3(-0.05, -0.4, 0)), mid, b]);
      tm.hose.geometry.dispose();
      tm.hose.geometry = new THREE.TubeGeometry(curve, 20, 0.032, 6, false);
    }

    function reset(tm) {
      tm.mode = 'idle'; tm.plan = null; tm.relT = 0;
      tm.members.forEach((m) => { m.shown = false; m.stage = ''; m.done = false; writeFigure(tm, m); });
      tm.c.rig.wheels.forEach((w) => { w.spin.visible = true; });
      tm.lolly.visible = false;
      for (let q = 0; q < 8; q++) { P.tyre.setMatrixAt(tm.ti * 8 + q, ZERO); P.rim.setMatrixAt(tm.ti * 8 + q, ZERO); }
      for (let q = 0; q < 4; q++) P.gun.setMatrixAt(tm.ti * 4 + q, ZERO);
      P.lance.setMatrixAt(tm.ti, ZERO); P.bottle.setMatrixAt(tm.ti, ZERO);
      const nz = new THREE.Vector3(RIG.x - 0.3, 1.2, RIG.z);
      propAt(P.nozzle, tm.ti, tm, nz.x, nz.y, nz.z, 0);
      hoseTo(tm, nz);
      PARTS.forEach(([key]) => { partMeshes[key].instanceMatrix.needsUpdate = true; });
      Object.values(P).forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    }
    teams.forEach(reset);

    return { update, teams };
  };
})();
