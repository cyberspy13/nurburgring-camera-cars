// pools.js — four swimming pools a short way off the road, about a quarter-lap apart. Each has rippling
// water on a paved deck, loungers under an umbrella, and people swimming laps, standing in the water waving at
// the cars, floating on rubber rings, sitting on the edge with their feet in, or lying in the sun.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});
  const SITES = ['Hocheichen', 'Adenauer Forst', 'Hohe Acht', 'Galgenkopf'];
  const SKIN = ['#f2d0b5', '#ebc09d', '#dcaa84', '#c4906a', '#a5704b', '#7b4d31', '#5c3a25'];
  const SWIMWEAR = ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#ffb703', '#8338ec', '#ff006e', '#3a86ff', '#16181b', '#06d6a0'];
  const SWIM_CAPS = ['#ffffff', '#ffd400', '#ff4d6d', '#3a86ff', '#2ec4b6', '#16181b'];
  const HAIR = ['#1c1510', '#2e2018', '#4a3020', '#6b4a2c', '#b8925c', '#d8bf86', '#8a3a1c'];
  const LEN = 12, WID = 5.6, DEPTH = 1.5, DECK = 3, WATER = -0.18; // the pool, the paving round it, the water line

  function buildPools(ctx) {
    const { track, scene, crowd, W, std } = ctx;
    const { col, canvasTex, rand } = NR.world;
    const pick = (a) => a[(rand() * a.length) | 0];
    const fr = track.newFrame();

    const tile = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#8fd6ec'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#62bcd8'; for (let k = 0; k < w; k += 32) { g.fillRect(k, 0, 2, h); g.fillRect(0, k, w, 2); }
    }, true);
    tile.repeat.set(4, 2);
    const paving = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#e4ddcf'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c9c0ae'; for (let k = 0; k < w; k += 64) { g.fillRect(k, 0, 3, h); g.fillRect(0, k, w, 3); }
      for (let i = 0; i < 300; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'; g.fillRect(rand() * w, rand() * h, 6, 6); }
    }, true);
    paving.repeat.set(4, 3);
    // light caught by the ripples, drifting over the water
    const ripple = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2b9fd2'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(220, 248, 255, 0.35)'; g.lineWidth = 2.2;
      for (let i = 0; i < 70; i++) {
        const x = rand() * w, y = rand() * h;
        g.beginPath(); g.moveTo(x, y);
        g.bezierCurveTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 60, x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 60, x + (rand() - 0.5) * 50, y + (rand() - 0.5) * 50);
        g.stroke();
      }
    }, true);
    ripple.repeat.set(3, 1.5);
    const tileMat = new THREE.MeshStandardMaterial({ map: tile, roughness: 0.35 });
    const deckMat = new THREE.MeshStandardMaterial({ map: paving, roughness: 0.85 });
    const grassTex = NR.world.TEX.grass.clone(); grassTex.needsUpdate = true; grassTex.repeat.set(2, 1);
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, color: col('#a3ad78'), roughness: 0.96 }); // toned to the hillside
    const water = new THREE.MeshStandardMaterial({ map: ripple, color: col('#bfefff'), transparent: true, opacity: 0.76, roughness: 0.06, metalness: 0.1, emissive: col('#33cfff'), emissiveIntensity: 0, depthWrite: false });
    const white = std('#f4f4f0', { roughness: 0.5 }), chrome = std('#d7dbdf', { metalness: 0.8, roughness: 0.25 });

    const sites = [];
    SITES.forEach((name, n) => {
      const at = ctx.site(track.sOf(name), -40, 160, 16, 36, 12, 60);
      if (!at) return;
      const side = at.side;
      track.frame(at.s, side * (W + 25), fr);
      const g = new THREE.Group();
      g.position.copy(fr.pos);
      g.rotation.y = Math.atan2(-side * fr.side.x, -side * fr.side.z); // local +z towards the road, x along it
      const X = LEN + 2 * DECK, Z = WID + 2 * DECK;
      let yHi = -1e9, yLo = 1e9;
      for (let x = -X / 2; x <= X / 2; x += 3) for (let z = -Z / 2; z <= Z / 2; z += 2.9) {
        const p = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
        const y = NR.groundY(p.x, p.z); yHi = Math.max(yHi, y); yLo = Math.min(yLo, y);
      }
      g.position.y = yHi + 0.25; // the deck is level, on its highest ground
      const box = (w, h, d, mats, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats); m.position.set(x, y, z); g.add(m); return m; };
      // Only the surfaces that can be seen: the paving round the pool, its tiled sides and floor (the mound below
      // hides the rest). Planes with one material each, so the whole pool bakes into a few draw calls.
      const plane = (w, h, mat, x, y, z, rx, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); g.add(m); return m; };
      [-1, 1].forEach((sd) => {
        plane(X, DECK, deckMat, 0, 0, sd * (WID / 2 + DECK / 2), -Math.PI / 2, 0);              // paving along the sides
        plane(DECK, WID, deckMat, sd * (LEN / 2 + DECK / 2), 0, 0, -Math.PI / 2, 0);            // and at the ends
        plane(LEN, DEPTH, tileMat, 0, -DEPTH / 2, sd * WID / 2, 0, sd > 0 ? Math.PI : 0);       // tiled long sides, facing in
        plane(WID, DEPTH, tileMat, sd * LEN / 2, -DEPTH / 2, 0, 0, -sd * Math.PI / 2);          // and ends
      });
      // a grassy mound under the deck, sloping down to the ground on every side (a four-sided frustum)
      const moundH = g.position.y - yLo + 0.6, k = 1 + (2.6 * moundH) / Z;
      const moundGeo = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * k, 1, 4, 1, true); moundGeo.rotateY(Math.PI / 4); // open: the pool shows through its top
      const mound = new THREE.Mesh(moundGeo, grassMat);
      mound.scale.set(X, moundH, Z); mound.position.y = -0.04 - moundH / 2; g.add(mound);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(LEN, WID), tileMat);
      floor.rotation.x = -Math.PI / 2; floor.position.y = -DEPTH; g.add(floor);
      // white coping round the rim
      [[LEN + 0.7, WID / 2 + 0.17, 0], [LEN + 0.7, -WID / 2 - 0.17, 0]].forEach(([w, z]) => box(w, 0.06, 0.35, white, 0, 0.03, z));
      [-1, 1].forEach((sd) => box(0.35, 0.06, WID, white, sd * (LEN / 2 + 0.17), 0.03, 0));
      const surface = new THREE.Mesh(new THREE.PlaneGeometry(LEN, WID), water);
      surface.rotation.x = -Math.PI / 2; surface.position.y = WATER; surface.renderOrder = 2; g.add(surface);
      // a ladder at the far side
      const tube = (len, x, y, z, rx, rz) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 8), chrome); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); g.add(m); };
      [-0.28, 0.28].forEach((dx) => {
        const x = LEN / 2 - 1.4 + dx, z0 = -WID / 2 + 0.16;
        tube(1.9, x, -0.05, z0); tube(0.42, x, 0.9, z0 - 0.21, Math.PI / 2); tube(0.9, x, 0.45, z0 - 0.42);
      });
      [-0.35, -0.7, -1.05].forEach((y) => box(0.56, 0.04, 0.12, chrome, LEN / 2 - 1.4, y, -WID / 2 + 0.16));
      // loungers and an umbrella on the far deck
      const cushion = [std(pick(['#2a9d8f', '#e76f51', '#264653', '#f4a261']), { roughness: 0.9 }), std('#f1f1ec', { roughness: 0.9 })];
      const zL = -WID / 2 - DECK / 2 - 0.1;
      [-3.4, -1.0].forEach((x, k) => {
        box(0.72, 0.3, 1.9, white, x, 0.15, zL);
        box(0.64, 0.08, 1.25, cushion[k], x, 0.34, zL + 0.3);
        const back = box(0.64, 0.08, 0.72, cushion[k], x, 0.55, zL - 0.62); back.rotation.x = -0.65;
      });
      tube(2.5, -2.2, 1.25, zL - 0.9);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.55, 10, 1, true), new THREE.MeshStandardMaterial({ color: col(pick(['#ff6b35', '#2a9d8f', '#e63946', '#ffb703'])), side: THREE.DoubleSide, roughness: 0.85 }));
      canopy.position.set(-2.2, 2.55, zL - 0.9); g.add(canopy);
      g.traverse((o) => { if (o.isMesh && o !== surface) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(NR.world.bake(g)); // one draw call per material
      g.updateMatrixWorld(true);
      ctx.clear(g.position.x, g.position.z, 24);

      // ---------- the people ----------
      const A = crowd.newArea(`Pool at ${name}`, { range: 300 });
      const P = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
      const yaw = (a) => g.rotation.y + a;
      const swimmer = () => { const skin = pick(SKIN); return { prop: null, hw: ['hair'], cols: { skin, top: pick(SWIMWEAR), sleeve: skin, thigh: skin, shin: skin, hw: pick(SWIM_CAPS) } }; };
      const bather = () => {
        const skin = pick(SKIN), bare = rand() < 0.45, suit = pick(SWIMWEAR);
        return { prop: null, hw: ['hair', 'hairLong', 'cap'], cols: { skin, top: bare ? skin : suit, sleeve: skin, thigh: bare ? pick(SWIMWEAR) : suit, shin: skin, hw: pick(HAIR) } };
      };
      // two swimming laps round an oval, half a lap apart
      [0, Math.PI].forEach((th) => {
        const c = P(0, WATER - 0.07, 0);
        crowd.addPerson(A, c, 0, 'swim', Object.assign(swimmer(), { swim: { c, a: 3.4, b: 1.15, yaw: g.rotation.y, w: 0.29, th } }));
      });
      // standing in the water on the road side, facing the cars
      [-3.8, -0.4, 3.0].forEach((x) => crowd.addPerson(A, P(x + (rand() - 0.5) * 0.6, -1.2, WID / 2 - 0.8), yaw((rand() - 0.5) * 0.5), 'stand', bather()));
      // on rubber rings at the ends
      const ringCols = ['#ff4d8d', '#ffd400', '#38b6ff'];
      [-1, 1].forEach((sd, k) => {
        if (k && rand() < 0.4) return;
        const fy = rand() * 6.28, ax = sd * (LEN / 2 - 1.1), az = (rand() - 0.5) * 1.6;
        crowd.addPerson(A, P(ax, WATER - 0.5, az), yaw(fy), 'seat', Object.assign(bather(), { noStand: true }));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.15, 8, 20), std(ringCols[(n + k) % 3], { roughness: 0.4 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(ax - Math.sin(fy) * 0.15, WATER + 0.06, az - Math.cos(fy) * 0.15); // under the hips, which sit back from the anchor
        ring.castShadow = true; g.add(ring);
      });
      // sitting on the far edge with their feet in, and lying on the loungers
      [1.4, 3.6].forEach((x) => crowd.addPerson(A, P(x, -0.44, -WID / 2 - 0.05), yaw(0), 'seat', Object.assign(bather(), { noStand: true })));
      crowd.addPerson(A, P(-3.4, 0.3, zL - 0.2), yaw(0), 'ground', Object.assign(bather(), { noStand: true }));
      if (rand() < 0.6) crowd.addPerson(A, P(-1.0, 0.3, zL - 0.2), yaw(0), 'ground', Object.assign(bather(), { noStand: true }));
      sites.push({ name, s: at.s, side, group: g });
    });

    return {
      sites,
      update(t, nightK) {
        ripple.offset.set((t * 0.021) % 1, (t * 0.013) % 1);
        water.emissiveIntensity = 0.85 * nightK; // the pool lights
      },
    };
  }

  NR.buildPools = buildPools;
})();
