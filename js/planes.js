// planes.js — two light planes towing banners over the race: a red one with COME ON PARKROYAL BUS and a
// white and blue one with HELLO MACCLESFIELD. They fly side by side, the outer one a little higher so the
// banners never hide each other, circling low round a point just ahead of whatever is being watched, so the
// banners keep crossing every view. The plane camera (cameras.js) flies alongside them.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});
  const FONT = '"Saira Condensed", "Arial Narrow", sans-serif';
  const SPEED = 36, R = 175, ALT = 46;          // m/s, the inner plane's circle, height above the ground
  const TOW = 18, BL = 28, BH = 4.2, SEG = 36;  // tow line, banner length and height, banner columns
  const FLEET = [
    { body: '#d7261e', trim: '#f4f4f0', text: 'COME ON PARKROYAL BUS', ink: '#d7261e', r: R, up: 0, lag: 0 },
    { body: '#f4f5f6', trim: '#1f4fa8', text: 'HELLO MACCLESFIELD', ink: '#1f4fa8', r: R + 32, up: 13, lag: 0.035 },
  ];

  function bannerTex(text, ink) {
    return NR.world.canvasTex(2048, 308, (g, w, h) => {
      g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, w, h);
      g.fillStyle = ink; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 232px ${FONT}`; g.fillText(text, w / 2, h / 2 + 10, w - 70);
    });
  }

  // A Piper Cub-style banner tug, nose along +z: high wing on struts, tailwheel, two-blade propeller.
  function buildPlane(f) {
    const { col } = NR.world;
    const std = (hex, o) => new THREE.MeshStandardMaterial(Object.assign({ color: col(hex), roughness: 0.45 }, o));
    const paint = std(f.body, { metalness: 0.1 }), trim = std(f.trim), dark = std('#202326', { roughness: 0.6 });
    const glass = std('#25313c', { roughness: 0.1, metalness: 0.4 });
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; g.add(m); return m; };
    part(new THREE.BoxGeometry(0.92, 1.1, 2.7), paint, 0, 0, 1.0);                                // cabin
    part(new THREE.CylinderGeometry(0.5, 0.14, 4.1, 10), paint, 0, 0.05, -2.4, -Math.PI / 2);    // tail cone
    part(new THREE.CylinderGeometry(0.47, 0.52, 0.8, 12), trim, 0, -0.02, 2.75, Math.PI / 2);    // engine cowling
    part(new THREE.BoxGeometry(0.94, 0.12, 4.6), trim, 0, -0.2, -0.6);                           // a stripe down the side
    part(new THREE.BoxGeometry(0.96, 0.46, 1.25), glass, 0, 0.42, 1.25);                         // windows
    part(new THREE.BoxGeometry(10.7, 0.14, 1.6), paint, 0, 0.66, 1.0);                           // wing
    [-1, 1].forEach((sd) => {
      part(new THREE.BoxGeometry(0.6, 0.15, 1.62), trim, sd * 5.05, 0.66, 1.0);                  // wing tips
      part(new THREE.BoxGeometry(2.45, 0.06, 0.08), dark, sd * 1.52, 0.05, 1.1, 0, 0, sd * 0.47); // wing strut, fuselage to wing
      part(new THREE.BoxGeometry(0.06, 0.95, 0.06), dark, sd * 0.42, -0.95, 1.7, 0, 0, sd * 0.35); // undercarriage
      part(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 12), dark, sd * 0.62, -1.35, 1.7, 0, 0, Math.PI / 2);
    });
    part(new THREE.BoxGeometry(3.4, 0.08, 0.95), paint, 0, 0.12, -4.05);                          // tailplane
    part(new THREE.BoxGeometry(0.08, 1.15, 1.05), trim, 0, 0.65, -4.15);                          // fin
    part(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), dark, 0, -0.3, -4.3, 0, 0, Math.PI / 2); // tailwheel
    const prop = new THREE.Group(); prop.position.set(0, -0.02, 3.2); g.add(prop);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.9, 0.04), dark); prop.add(blade);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 10), trim); spinner.rotation.x = Math.PI / 2; spinner.position.z = 0.12; prop.add(spinner);
    // navigation lights: red on the left wing, green on the right, white on the tail; a strobe on the fin
    const lamp = (hex, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: col(hex) })); m.position.set(x, y, z); m.visible = false; g.add(m); return m; };
    const lights = [lamp('#ff2a2a', 5.36, 0.66, 1.0), lamp('#2aff6a', -5.36, 0.66, 1.0), lamp('#ffffff', 0, 0.1, -4.6)];
    const strobe = lamp('#ffffff', 0, 1.25, -4.2);
    NR.world.bake(g); // one draw call per material (the lamps each have their own, so stay apart)
    return { g, prop, lights, strobe };
  }

  function createPlanes(scene) {
    const show = new THREE.Vector3(); // the point they circle
    let th = 0, ready = false, t = 0;
    const planes = FLEET.map((f) => {
      const p = buildPlane(f);
      scene.add(p.g);
      const tex = bannerTex(f.text, f.ink);
      const back = tex.clone(); back.wrapS = THREE.RepeatWrapping; back.repeat.x = -1; back.needsUpdate = true; // reads the right way round from either side
      const geo = new THREE.PlaneGeometry(BL, BH, SEG, 1);
      const mats = [[tex, THREE.FrontSide], [back, THREE.BackSide]].map(([map, side]) => new THREE.MeshStandardMaterial({ map, side, roughness: 0.9, emissive: new THREE.Color(1, 1, 1), emissiveMap: map, emissiveIntensity: 0 }));
      const banner = mats.map((m) => { const b = new THREE.Mesh(geo, m); b.frustumCulled = false; b.castShadow = true; scene.add(b); return b; });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, BH + 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5 }));
      pole.frustumCulled = false; scene.add(pole);
      const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x33363b })); line.frustumCulled = false; scene.add(line);
      return Object.assign(p, f, { geo, mats, pole, line, y: 0, a: 0, ripple: Math.random() * 6 });
    });
    const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), fwd = new THREE.Vector3(), left = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0), BANK = 0.42;
    // a point on plane p's circle, d metres behind it
    const onCircle = (p, d, out) => { const a = p.a - d / p.r; return out.set(show.x + Math.cos(a) * p.r, 0, show.z + Math.sin(a) * p.r); };

    // dt: race time (0 while paused); target: what is being watched; nightK: 0 by day, 1 at night
    function update(dt, target, nightK) {
      let jump = false;
      if (!ready || show.distanceTo(target) > 700) { show.copy(target); ready = true; jump = true; } // a long way off: be there already
      else show.lerp(target, 1 - Math.exp(-dt / 4));
      th += (SPEED / R) * dt; t += dt;
      for (const p of planes) {
        p.a = th - p.lag;
        const pos = onCircle(p, 0, v);
        // hold the height over the higher of the ground below and the ground at the middle of the circle
        const yT = Math.max(NR.groundY(pos.x, pos.z), NR.groundY(show.x, show.z)) + ALT + p.up;
        p.y = jump ? yT : p.y + (yT - p.y) * (1 - Math.exp(-dt * 0.6));
        p.g.position.set(pos.x, p.y, pos.z);
        fwd.set(-Math.sin(p.a), 0, Math.cos(p.a)); // anticlockwise seen from above
        m4.lookAt(fwd, v.set(0, 0, 0), UP); // +z along fwd (lookAt aims -z from eye to target, so from fwd back to 0)
        q.setFromRotationMatrix(m4);
        p.g.quaternion.copy(q);
        left.set(1, 0, 0).applyQuaternion(q); // +x is the left wing
        v.set(show.x - p.g.position.x, 0, show.z - p.g.position.z);
        p.g.rotateZ(left.dot(v) > 0 ? -BANK : BANK); // the inside wing down
        p.prop.rotation.z += dt * 60;
        // the banner hangs below the tow line and follows the circle, its tail flapping
        p.ripple += dt * 8;
        const P = p.geo.attributes.position, cols = SEG + 1;
        for (let k = 0; k <= SEG; k++) {
          const d = TOW + (k / SEG) * BL;
          onCircle(p, d, v);
          const top = p.y - 1.3 - d * 0.035, fl = 0.32 * (k / SEG) * Math.sin(p.ripple - k * 0.55);
          const rx = (v.x - show.x) / p.r, rz = (v.z - show.z) / p.r; // outwards
          P.setXYZ(k, v.x + rx * fl, top, v.z + rz * fl);
          P.setXYZ(cols + k, v.x + rx * fl * 1.2, top - BH, v.z + rz * fl * 1.2);
        }
        P.needsUpdate = true;
        p.geo.computeVertexNormals();
        p.pole.position.set(P.getX(0), P.getY(0) - BH / 2, P.getZ(0));
        const L = p.line.geometry.attributes.position;
        p.g.updateMatrixWorld();
        v.set(0, 0.1, -4.4).applyMatrix4(p.g.matrixWorld); // the tail hook
        L.setXYZ(0, v.x, v.y, v.z); L.setXYZ(1, P.getX(0), P.getY(0) + 0.2, P.getZ(0));
        L.needsUpdate = true;
        const lit = nightK > 0.05;
        p.lights.forEach((l) => { l.visible = lit; });
        p.strobe.visible = lit && (t * 1.1) % 1 < 0.08;
        p.mats.forEach((m) => { m.emissiveIntensity = 0.55 * nightK; }); // floodlit from below, so it can be read at night
      }
    }

    // The plane camera: off the outside of the circle, level with the gap between the two banners, looking
    // back in across both of them with the planes ahead and the ground below. k: zoom (1 = normal).
    const c1 = new THREE.Vector3(), c2 = new THREE.Vector3();
    function view(k, pos, look) {
      const [a, b] = planes, mid = TOW + BL / 2;
      onCircle(a, mid, c1); onCircle(b, mid, c2);
      look.copy(c1).add(c2).multiplyScalar(0.5);
      look.y = (a.y + b.y) / 2 - 1.3 - mid * 0.035 - BH / 2;
      const out = v.set(look.x - show.x, 0, look.z - show.z).normalize();
      fwd.set(-out.z, 0, out.x); // the way they fly, at the banners
      look.addScaledVector(fwd, 7);
      pos.copy(look).addScaledVector(out, 70 * k).addScaledVector(fwd, 6);
      pos.y = Math.max(look.y + 3, NR.groundY(pos.x, pos.z) + 6);
      return pos;
    }

    return { update, view, planes, show };
  }

  NR.createPlanes = createPlanes;
})();
