// school.js — Parkroyal Community School beside the track after Breidscheid: the Victorian red-brick block
// with its row of gables and chimneys, the lower wing, the newer extension with the school's name in red,
// and the all-weather pitch behind green railings, full of pupils in red jumpers cheering on the bus.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});
  const FONT = '"Saira Condensed", "Arial Narrow", sans-serif';
  const RED = '#c4161c';

  // The uniform: a red jumper over a white polo, with grey or black trousers, or a grey skirt and white
  // socks. k (0..1) picks the variations, so a pupil keeps the same look. Shared with the pupils on the bus.
  NR.pupil = (k) => {
    const dark = (k * 7) % 1 < 0.45 ? '#1d1f23' : '#4a4d53', skirt = (k * 13) % 1 < 0.4;
    return {
      scale: 0.66 + ((k * 3) % 1) * 0.14, hw: ['hair', 'hairLong'], prop: null,
      cols: { top: RED, sleeve: RED, thigh: skirt ? '#4a4d53' : dark, shin: skirt ? '#f1f1ee' : dark },
    };
  };

  // ---------- painted walls ----------
  function bricks(g, w, h, pxm, base) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const bh = 0.075 * pxm, bw = 0.23 * pxm;
    g.fillStyle = 'rgba(40, 18, 10, 0.32)';
    for (let r = 0, y = 0; y < h; r++, y += bh) {
      g.fillRect(0, y, w, Math.max(1, bh * 0.12));
      for (let x = (r % 2) * bw / 2; x < w; x += bw) g.fillRect(x, y, Math.max(1, bw * 0.05), bh);
    }
    for (let i = 0; i < w * h / 900; i++) { // weathering
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 220, 190, 0.05)';
      g.fillRect(Math.random() * w, Math.random() * h, bw, bh);
    }
  }
  // a white sash window with stone sill and lintel; lit: the night version only paints the glass
  function sash(g, x, y, w, h, pxm, lit, arched) {
    const f = 0.09 * pxm;
    if (lit != null) { g.fillStyle = lit; g.fillRect(x + f, y + f, w - 2 * f, h - 2 * f); return; }
    g.fillStyle = '#d8c3a5'; g.fillRect(x - f, y + h, w + 2 * f, f * 1.4); // sill
    if (!arched) g.fillRect(x - f, y - f * 1.6, w + 2 * f, f * 1.6); // lintel
    g.fillStyle = '#f2f0ea';
    if (arched) { g.beginPath(); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill(); }
    else g.fillRect(x, y, w, h);
    g.fillStyle = '#2b3542';
    if (arched) { g.beginPath(); g.arc(x + w / 2, y + w / 2, w / 2 - f, Math.PI, 0); g.lineTo(x + w - f, y + h - f); g.lineTo(x + f, y + h - f); g.fill(); }
    else g.fillRect(x + f, y + f, w - 2 * f, h - 2 * f);
    g.fillStyle = 'rgba(190, 210, 230, 0.25)'; g.fillRect(x + f, y + f, (w - 2 * f) * 0.45, h - 2 * f); // a reflection
    g.fillStyle = '#f2f0ea';
    g.fillRect(x, y + h * 0.52, w, f * 0.8); // meeting rail
    g.fillRect(x + w / 2 - f * 0.3, y, f * 0.6, h); // glazing bars
    g.fillRect(x, y + h * 0.26, w, f * 0.4); g.fillRect(x, y + h * 0.78, w, f * 0.4);
  }
  const WARM = ['#ffd9a0', '#ffe4b8', '#ffcf86', '#fff0d0', '#1b1b1b']; // the last: a dark classroom
  // A wall of bays, each with `per` windows on two floors; returns the day map and the lit-windows map.
  function facade(canvasTex, wm, hm, bays, per, o) {
    const pxm = o.pxm || 48, w = Math.round(wm * pxm), h = Math.round(hm * pxm);
    const paint = (lit) => (g) => {
      if (lit) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); } else bricks(g, w, h, pxm, o.brick || '#8a3a27');
      if (!lit && o.band) { g.fillStyle = '#c9a98a'; g.fillRect(0, h - o.band * pxm, w, 0.18 * pxm); } // stone string course
      const bw = wm / bays;
      for (let b = 0; b < bays; b++) {
        for (let k = 0; k < per; k++) {
          const ww = o.ww || 1.2, gap = (bw - per * ww) / (per + 1), x = (b * bw + gap + k * (ww + gap)) * pxm;
          o.rows.forEach(([sill, wh], r) => {
            const y = h - (sill + wh) * pxm;
            sash(g, x, y, ww * pxm, wh * pxm, pxm, lit ? WARM[(b * 7 + k * 3 + r * 5) % WARM.length] : null);
          });
        }
      }
      if (!lit && o.door != null) { // a door in one bay
        const x = (o.door * bw + bw / 2 - 0.7) * pxm;
        g.fillStyle = '#d8c3a5'; g.fillRect(x - 6, h - 2.7 * pxm, 1.4 * pxm + 12, 2.7 * pxm);
        g.fillStyle = '#1e3a2c'; g.fillRect(x, h - 2.5 * pxm, 1.4 * pxm, 2.5 * pxm);
      }
    };
    return { map: canvasTex(w, h, paint(false)), lit: canvasTex(w, h, paint(true)) };
  }

  function buildSchool(ctx, sp) {
    const { track, scene, crowd, W, std } = ctx;
    const { col, canvasTex, rand } = NR.world;
    const fr = track.newFrame(), side = sp.side, S = sp.s;
    const lit = []; // materials whose windows light up at night
    const shade = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };
    const mesh = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m; };
    const facing = () => Math.atan2(-side * fr.side.x, -side * fr.side.z); // towards the road

    // ---------- the buildings, square to the road, front towards it ----------
    track.frame(S, side * (W + 44), fr);
    const g = new THREE.Group();
    g.position.copy(fr.pos);
    g.rotation.y = facing();
    // Level with the playground along the front, so the doors open onto it; the back may go into the hill.
    // A plinth fills in down to the lowest ground under the footprint.
    let yFront = -1e9, yLo = 1e9;
    for (let x = -38; x <= 38; x += 6) for (let z = -7; z <= 7; z += 7) {
      const p = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
      const y = NR.groundY(p.x, p.z); yLo = Math.min(yLo, y);
      if (z === 7) yFront = Math.max(yFront, y);
    }
    g.position.y = yFront + 0.12;
    const plinthH = yFront - yLo + 1.6;
    const brickTex = canvasTex(256, 256, (c) => bricks(c, 256, 256, 96, '#8a3a27'), true);
    const brick = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.92 });
    const slate = std('#4b525a', { roughness: 0.7 });
    const stone = std('#cdb79a', { roughness: 0.9 });
    const litMat = (f) => { const m = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.lit, emissive: col('#ffffff'), emissiveIntensity: 0, roughness: 0.88 }); lit.push(m); return m; };
    // a building's four walls, each a plane of one material (its roof covers the top), so the group bakes small
    const walls = (w, h, d, x, y, z, front, back, side) => {
      const wall = (pw, mat, px, pz, ry) => { mesh(new THREE.PlaneGeometry(pw, h), mat, g, x + px, y, z + pz).rotation.y = ry; };
      wall(w, front, 0, d / 2, 0); wall(w, back, 0, -d / 2, Math.PI); wall(d, side, w / 2, 0, Math.PI / 2); wall(d, side, -w / 2, 0, -Math.PI / 2);
    };

    // the Victorian block: two floors of sash windows, six bays, each under a steep gable
    const BW = 42, BD = 12, EAVE = 8.5, BAYS = 6, GH = 4.8;
    const front = facade(canvasTex, BW, EAVE, BAYS, 3, { rows: [[1.0, 2.4], [5.0, 2.3]], band: 4.5, door: 0 });
    const frontMat = litMat(front);
    brickTex.repeat.set(4, 2);
    walls(BW, EAVE, BD, 0, EAVE / 2, 0, frontMat, frontMat, brick);
    const plinthMat = std('#5e2a1f', { roughness: 0.95 });
    mesh(new THREE.BoxGeometry(BW + 0.6, plinthH, BD + 0.6), plinthMat, g, 0, -plinthH / 2 + 0.1, 0);
    // gables: a brick triangle on the front with an arched window, a roof running back to the main ridge
    const gableFace = facade(canvasTex, 7, GH, 1, 1, { rows: [[0.7, 2.6]], ww: 1.5, pxm: 64 });
    const triangle = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath(); return s; };
    // an open roof, two slopes of slate th thick, so the gable wall under its front edge still shows
    const chevron = (w, h, th) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(0, h); s.lineTo(w / 2, 0); s.lineTo(w / 2 - th * 1.6, 0); s.lineTo(0, h - th * 1.4); s.lineTo(-w / 2 + th * 1.6, 0); s.closePath(); return s; };
    [gableFace.map, gableFace.lit].forEach((t) => { t.repeat.set(1 / 7, 1 / GH); t.offset.set(0.5, 0); });
    const gableMat = litMat(gableFace);
    const roofGeo = (w, h, len) => new THREE.ExtrudeGeometry(triangle(w, h), { depth: len, bevelEnabled: false });
    for (let b = 0; b < BAYS; b++) {
      const x = -BW / 2 + 3.5 + b * 7;
      mesh(new THREE.ShapeGeometry(triangle(7, GH)), gableMat, g, x, EAVE, BD / 2);
      mesh(new THREE.ExtrudeGeometry(chevron(7.6, GH + 0.3, 0.3), { depth: BD / 2 + 0.35, bevelEnabled: false }), slate, g, x, EAVE - 0.05, 0); // from the ridge out over the gable
      // stone coping up the gable's edges
      [-1, 1].forEach((sd) => {
        const c = mesh(new THREE.BoxGeometry(0.28, Math.hypot(3.5, GH) + 0.2, 0.62), stone, g, x + sd * 1.75, EAVE + GH / 2, BD / 2 - 0.2);
        c.rotation.z = sd * Math.atan2(3.5, GH); // leaning in to the apex
      });
    }
    const main = mesh(roofGeo(BD + 0.8, GH, BW + 0.6), slate, g, -BW / 2 - 0.3, EAVE - 0.05, 0);
    main.rotation.y = Math.PI / 2;
    // tall chimneys between the gables, with pots
    const pot = std('#a4583a', { roughness: 0.8 });
    for (let b = 1; b < BAYS; b++) {
      const x = -BW / 2 + b * 7;
      mesh(new THREE.BoxGeometry(0.95, 7.4, 1.5), brick, g, x, EAVE + 3.4, 2.4);
      mesh(new THREE.BoxGeometry(1.2, 0.25, 1.75), stone, g, x, EAVE + 7.15, 2.4);
      [-0.35, 0.35].forEach((dz) => mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.6, 8), pot, g, x, EAVE + 7.55, 2.4 + dz));
    }
    // a flag on the roof: white, with the school's crest
    const pole = mesh(new THREE.CylinderGeometry(0.06, 0.07, 4.6, 6), ctx.poleMat, g, 6, EAVE + GH + 2.3, 0);
    pole.castShadow = true;
    const flagTex = canvasTex(256, 160, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.fillStyle = RED; NR.drawCrest(c, 26, 22, 92, 72);
      c.font = `800 38px ${FONT}`; c.textBaseline = 'middle'; c.fillText('PARKROYAL', 126, 58, 124);
      c.font = `700 22px ${FONT}`; c.fillText('COMMUNITY SCHOOL', 126, 96, 124);
    });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }));
    flag.geometry.translate(1.2, 0, 0);
    flag.position.set(6, EAVE + GH + 3.7, 0); flag.userData.ph = 1.3; flag.userData.keep = true; // it waves: not baked
    g.add(flag); ctx.flags.push(flag);

    // the lower wing at one end, under a hipped roof
    const wingFront = facade(canvasTex, 15, 6.2, 3, 1, { rows: [[0.9, 2.0], [3.6, 1.8]], ww: 1.5 });
    const wingX = -BW / 2 - 7.5, wingMat = litMat(wingFront);
    walls(15, 6.2, 10, wingX, 3.1, -0.6, wingMat, wingMat, brick);
    const hipGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); hipGeo.rotateY(Math.PI / 4); // a unit square base, then stretched
    const hip = mesh(hipGeo, slate, g, wingX, 6.2 + 1.9, -0.6);
    hip.scale.set(16, 3.8, 11);
    mesh(new THREE.BoxGeometry(15.6, plinthH, 10.6), plinthMat, g, wingX, -plinthH / 2 + 0.1, -0.6);

    // the newer extension at the other end: pale brick, a long window upstairs, glass doors below
    const extTex = facade(canvasTex, 17, 7.4, 1, 0, { rows: [], brick: '#cbb89a' });
    const extPaint = (lit) => (c, w, h) => {
      const pxm = w / 17;
      if (lit) { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); }
      else { c.drawImage(extTex.map.image, 0, 0); c.fillStyle = 'rgba(255,255,255,0.18)'; for (let y = 0; y < h; y += pxm * 0.6) c.fillRect(0, y, w, 2); }
      c.fillStyle = lit ? '#ffe6bd' : '#27313c'; c.fillRect(2.2 * pxm, h - 6.4 * pxm, 11.5 * pxm, 1.5 * pxm); // the long window
      c.fillStyle = lit ? '#fff1d6' : '#2c3844'; c.fillRect(1.2 * pxm, h - 2.8 * pxm, 6 * pxm, 2.8 * pxm); // glass doors
      if (!lit) {
        c.fillStyle = '#d9d4ca';
        for (let x = 2.2; x <= 13.7; x += 1.15) c.fillRect(x * pxm, h - 6.4 * pxm, 3, 1.5 * pxm);
        for (let x = 1.2; x <= 7.2; x += 1.5) c.fillRect(x * pxm, h - 2.8 * pxm, 3, 2.8 * pxm);
        c.fillStyle = '#e8b33a'; c.fillRect(14.6 * pxm, h - 3.2 * pxm, 1.2 * pxm, 3.2 * pxm); // a yellow panel by the door
      }
    };
    const extFront = { map: canvasTex(816, 355, extPaint(false)), lit: canvasTex(816, 355, extPaint(true)) };
    const pale = std('#cbb89a', { roughness: 0.9 });
    walls(17, 7.4, 12, BW / 2 + 8.5, 3.7, 0.4, litMat(extFront), pale, pale);
    mesh(new THREE.BoxGeometry(17.6, 0.45, 12.6), std('#6f747a', { roughness: 0.6 }), g, BW / 2 + 8.5, 7.6, 0.4);
    mesh(new THREE.BoxGeometry(17.6, plinthH, 12.6), std('#7c7266', { roughness: 0.95 }), g, BW / 2 + 8.5, -plinthH / 2 + 0.1, 0.4);
    // its slatted entrance wall, with the school's name in red
    const nameTex = canvasTex(1024, 240, (c, w, h) => {
      c.fillStyle = '#ddd2bd'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(120, 100, 70, 0.35)'; for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 4);
      c.fillStyle = RED; c.textBaseline = 'middle'; c.font = `800 96px ${FONT}`;
      c.fillText('Parkroyal', 40, 78, w - 80);
      c.font = `700 72px ${FONT}`; c.fillText('Community School', 40, 170, w - 80);
    });
    mesh(new THREE.BoxGeometry(10, 2.4, 0.5), pale, g, BW / 2 + 6, 1.2, BD / 2 + 3.2);
    mesh(new THREE.PlaneGeometry(10, 2.4), new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.8 }), g, BW / 2 + 6, 1.2, BD / 2 + 3.46);
    scene.add(NR.world.bake(shade(g))); // one draw call per material
    ctx.clear(g.position.x, g.position.z, 72);

    // ---------- the pitch: green all-weather surface with white and orange lines, tarmac by the building ----------
    const L0 = 8.6, L1 = 37.8, HALF = 31; // from the railings to the building, and along the road
    const pitchTex = canvasTex(1024, 512, (c, w, h) => {
      const X = (u) => ((u + HALF) / (2 * HALF)) * w, Y = (l) => ((l - L0) / (L1 - L0)) * h;
      c.fillStyle = '#5b5f62'; c.fillRect(0, 0, w, h); // tarmac
      c.fillStyle = '#3f7f43'; c.fillRect(X(-29), Y(9), X(29) - X(-29), Y(31) - Y(9));
      c.fillStyle = 'rgba(255,255,255,0.05)'; for (let x = 0; x < w; x += 24) c.fillRect(x, Y(9), 12, Y(31) - Y(9)); // mowing-style stripes
      c.lineWidth = 4; c.strokeStyle = '#f4f4f0';
      c.strokeRect(X(-27), Y(10.5), X(27) - X(-27), Y(29.5) - Y(10.5));
      c.beginPath(); c.moveTo(X(0), Y(10.5)); c.lineTo(X(0), Y(29.5)); c.stroke();
      c.beginPath(); c.ellipse(X(0), Y(20), (3 / (2 * HALF)) * w, (3 / (L1 - L0)) * h, 0, 0, Math.PI * 2); c.stroke();
      [-1, 1].forEach((sd) => { c.beginPath(); c.ellipse(X(sd * 27), Y(20), (6 / (2 * HALF)) * w, (6 / (L1 - L0)) * h, 0, sd > 0 ? Math.PI / 2 : -Math.PI / 2, sd > 0 ? Math.PI * 1.5 : Math.PI / 2); c.stroke(); });
      c.strokeStyle = '#e8892b'; c.lineWidth = 3;
      c.strokeRect(X(-15), Y(13), X(15) - X(-15), Y(27) - Y(13));
      c.beginPath(); c.ellipse(X(-15), Y(20), (5 / (2 * HALF)) * w, (5 / (L1 - L0)) * h, 0, -Math.PI / 2, Math.PI / 2); c.stroke();
      c.fillStyle = '#f4f4f0'; c.beginPath(); c.arc(X(0), Y(20), 3, 0, 7); c.fill();
    });
    const pos = [], uv = [], idx = [];
    const NU = 31, NL = 15;
    for (let i = 0; i <= NU; i++) for (let k = 0; k <= NL; k++) {
      const u = -HALF + (i / NU) * 2 * HALF, l = L0 + (k / NL) * (L1 - L0);
      track.frame(S + u, side * (W + l), fr);
      pos.push(fr.pos.x, NR.groundY(fr.pos.x, fr.pos.z) + 0.07, fr.pos.z);
      uv.push(i / NU, 1 - k / NL);
      if (i && k) { const a = (i - 1) * (NL + 1) + k - 1, b = a + NL + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    pg.setIndex(idx); pg.computeVertexNormals();
    if (pg.attributes.normal.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } pg.setIndex(idx); pg.computeVertexNormals(); }
    const pitch = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95 }));
    pitch.receiveShadow = true; scene.add(pitch);

    // ---------- green spear-top railings round three sides, brick gate piers, the school sign ----------
    const railTex = canvasTex(256, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.fillStyle = '#1f5a3c';
      for (let x = 6; x < w; x += 16) {
        c.fillRect(x, h * 0.12, 4, h * 0.88);
        c.beginPath(); c.moveTo(x - 4, h * 0.13); c.lineTo(x + 2, h * 0.02); c.lineTo(x + 8, h * 0.13); c.fill(); // spear
      }
      c.fillRect(0, h * 0.16, w, 7); c.fillRect(0, h * 0.86, w, 7);
    });
    railTex.wrapS = THREE.RepeatWrapping;
    const railMat = new THREE.MeshStandardMaterial({ map: railTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 });
    const ribbon = (pts, hgt) => {
      const p = [], u = [], ix = [];
      let d = 0;
      pts.forEach((q, k) => {
        if (k) d += q.distanceTo(pts[k - 1]);
        const y = NR.groundY(q.x, q.z);
        p.push(q.x, y, q.z, q.x, y + hgt, q.z); u.push(d / 2, 0, d / 2, 1);
        if (k) { const a = (k - 1) * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      rg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
      rg.setIndex(ix); rg.computeVertexNormals();
      scene.add(new THREE.Mesh(rg, railMat));
    };
    const at = (u, l) => track.frame(S + u, side * (W + l), fr).pos.clone();
    const along = [], endA = [], endB = [];
    for (let u = -HALF; u <= HALF + 0.01; u += 2) along.push(at(u, 7.4));
    for (let l = 7.4; l <= L1 + 0.01; l += 2) { endA.push(at(-HALF, l)); endB.push(at(HALF, l)); }
    [along, endA, endB].forEach((pts) => ribbon(pts, 1.9));
    const pier = std('#7e3524', { roughness: 0.95 });
    [-HALF, HALF].forEach((u) => {
      const q = at(u, 7.4), y = NR.groundY(q.x, q.z);
      const pm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.3, 0.7), pier); pm.position.set(q.x, y + 1.15, q.z); scene.add(shade(pm));
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.9), stone); cap.position.set(q.x, y + 2.38, q.z); scene.add(shade(cap));
    });
    const signTex = canvasTex(512, 300, (c, w, h) => {
      c.fillStyle = '#fbfbf8'; c.fillRect(0, 0, w, h);
      c.fillStyle = RED; NR.drawCrest(c, w / 2 - 50, 18, 100, 78);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `800 62px ${FONT}`; c.fillText('Parkroyal', w / 2, 140);
      c.font = `700 46px ${FONT}`; c.fillText('Community School', w / 2, 196);
      c.fillStyle = '#333'; c.font = `600 26px ${FONT}`; c.fillText('Go Parkroyal bus!', w / 2, 256);
    });
    track.frame(S - HALF + 6, side * (W + 7.2), fr);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.29), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }));
    sign.position.copy(fr.pos); sign.position.y = NR.groundY(fr.pos.x, fr.pos.z) + 1.35;
    sign.rotation.y = facing(); sign.castShadow = true;
    scene.add(sign);

    // ---------- the pupils: a row along the railings, the rest playing, two teachers ----------
    const A = crowd.newArea('Parkroyal School', { spot: sp, busFans: true, range: 520 });
    const faceRoad = () => facing() + (rand() - 0.5) * 0.6;
    for (let u = -HALF + 2; u <= HALF - 2; u += 1.05) {
      if (rand() < 0.28) continue;
      const l = 8.2 + rand() * 1.3;
      track.frame(S + u + rand() * 0.4, side * (W + l), fr);
      const y = NR.groundY(fr.pos.x, fr.pos.z) + 0.07;
      if (!ctx.clearOfCams(fr.pos.x, y, fr.pos.z)) continue;
      const o = NR.pupil(rand());
      if (rand() < 0.3) o.prop = 'cheer';
      crowd.addPerson(A, new THREE.Vector3(fr.pos.x, y, fr.pos.z), faceRoad(), 'stand', o);
    }
    for (let n = 0; n < 12; n++) { // in little groups further back, standing or sitting on the pitch
      track.frame(S + (rand() - 0.5) * 44, side * (W + 13 + rand() * 13), fr);
      const y = NR.groundY(fr.pos.x, fr.pos.z) + 0.07;
      crowd.addPerson(A, new THREE.Vector3(fr.pos.x, y, fr.pos.z), faceRoad() + (rand() - 0.5) * 2, rand() < 0.35 ? 'ground' : 'stand', NR.pupil(rand()));
    }
    [-12, 9].forEach((u) => {
      track.frame(S + u, side * (W + 11), fr);
      crowd.addPerson(A, new THREE.Vector3(fr.pos.x, NR.groundY(fr.pos.x, fr.pos.z) + 0.07, fr.pos.z), faceRoad(), 'stand',
        { prop: null, hw: ['hair', 'hairLong'], cols: { top: '#1f2b4a', bottom: '#2d2f35' } });
    });

    return {
      group: g, spot: sp,
      update(t, nightK) { const k = 0.85 * nightK; for (const m of lit) m.emissiveIntensity = k; },
    };
  }

  NR.buildSchool = buildSchool;
})();
