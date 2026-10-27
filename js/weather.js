// weather.js — clear, rain, snow or hail, by day or night: sky, light and fog, wet roads and snow cover,
// precipitation falling round the camera, spray behind the cars, and headlights and floodlights after dark.
(function () {
  'use strict';
  const NR = window.NR;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // How each sky looks and drives. grip scales cornering speed, risk the chance of a mistake.
  const LOOK = {
    clear: { top: '#4f86c9', horizon: '#c9dbe8', ground: '#7d8a73', fog: '#c9dbe8', fogD: 0.00026, sun: 2.1, sunCol: '#fff2df', hemi: 0.55, hemiSky: '#cfe2ff', hemiGround: '#4f5d36', halo: 1, disc: 1, stars: 0, cloud: '#ffffff', cloudOp: 0.85, exposure: 1.05, env: 'day', wet: 0, cover: 0, grip: 1, risk: 1 },
    rain: { top: '#59626c', horizon: '#97a0a8', ground: '#5d6355', fog: '#8f989f', fogD: 0.0016, sun: 0.45, sunCol: '#dfe6ee', hemi: 0.95, hemiSky: '#b9c3cc', hemiGround: '#46503c', halo: 0, disc: 0, stars: 0, cloud: '#7d858d', cloudOp: 1, exposure: 1.0, env: 'grey', wet: 1, cover: 0, grip: 0.84, risk: 1.8 },
    snow: { top: '#7b8592', horizon: '#c4cad0', ground: '#c8ced4', fog: '#bcc3c9', fogD: 0.0021, sun: 0.55, sunCol: '#eef2f6', hemi: 1.05, hemiSky: '#d6dde4', hemiGround: '#9aa3a8', halo: 0, disc: 0, stars: 0, cloud: '#9aa2aa', cloudOp: 1, exposure: 1.0, env: 'grey', wet: 0.55, cover: 0.85, grip: 0.64, risk: 2.2 },
    hail: { top: '#525b65', horizon: '#8d969e', ground: '#5d6355', fog: '#878f97', fogD: 0.0014, sun: 0.5, sunCol: '#dfe6ee', hemi: 0.9, hemiSky: '#b3bdc6', hemiGround: '#46503c', halo: 0, disc: 0, stars: 0, cloud: '#737b83', cloudOp: 1, exposure: 1.0, env: 'grey', wet: 0.8, cover: 0.3, grip: 0.8, risk: 1.6 },
  };
  function lookFor(kind, night) {
    const L = LOOK[kind];
    if (!night) return L;
    const clear = kind === 'clear';
    return Object.assign({}, L, {
      top: clear ? '#030712' : '#07090d', horizon: clear ? '#0e1a2e' : '#11161c', ground: '#05070a',
      fog: clear ? '#070c16' : '#0c1015', fogD: clear ? 0.0007 : L.fogD * 0.9,
      sun: clear ? 0.42 : 0.16, sunCol: '#9db3ff', hemi: clear ? 0.3 : 0.22, hemiSky: '#3a4c74', hemiGround: '#0a0d10',
      halo: 0, disc: clear ? 0.75 : 0, stars: clear ? 1 : 0, cloud: '#1a2028', cloudOp: clear ? 0.45 : 0.9,
      exposure: 1.1, env: 'night', risk: L.risk * 1.2,
    });
  }
  const COLOR_KEYS = ['top', 'horizon', 'ground', 'fog', 'sunCol', 'hemiSky', 'hemiGround', 'cloud'];
  const NUM_KEYS = ['fogD', 'sun', 'hemi', 'halo', 'disc', 'stars', 'cloudOp', 'exposure', 'wet', 'cover', 'grip', 'risk'];

  NR.createWeather = function (o) {
    const { scene, renderer, sky, terrain, road, race, fx, audio, scenery, track } = o;
    const { col, canvasTex } = NR.world;
    const state = { kind: 'clear', night: false };
    // current (eased) values; colours in display space like the original sky constants
    const cur = {}, want = {};
    COLOR_KEYS.forEach((k) => { cur[k] = new THREE.Color(LOOK.clear[k]); want[k] = new THREE.Color(LOOK.clear[k]); });
    NUM_KEYS.forEach((k) => { cur[k] = want[k] = LOOK.clear[k]; });
    let nightK = 0, nightWant = 0;

    // ---------- ground: snow cover mixed into the terrain shader (the grass texture would hide a colour change) ----------
    const snowCover = { value: 0 };
    terrain.material.onBeforeCompile = (sh) => {
      sh.uniforms.snowCover = snowCover;
      sh.fragmentShader = 'uniform float snowCover;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\n  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.81, 0.86) + l * 0.35, snowCover); }');
    };
    terrain.material.needsUpdate = true;
    const roadMat = road.material;
    const dryRoad = { rough: roadMat.roughness, env: roadMat.envMapIntensity };

    // ---------- precipitation round the camera ----------
    const soft = canvasTex(32, 32, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const BOX = 64, HALF = BOX / 2, BELOW = 26, ABOVE = 18;
    function field(n, makeObj) {
      const p = new Float32Array(n * 3), v = new Float32Array(n), ph = new Float32Array(n), flag = new Uint8Array(n);
      for (let i = 0; i < n; i++) { v[i] = Math.random(); ph[i] = Math.random() * 6.28; }
      const obj = makeObj(n);
      obj.frustumCulled = false; obj.visible = false; obj.renderOrder = 4;
      scene.add(obj);
      return { n, p, v, ph, flag, vy: new Float32Array(n), obj, primed: false, alpha: 0 };
    }
    const rain = field(7000, (n) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb4c0cc, transparent: true, opacity: 0, depthWrite: false }));
    });
    const pointsOf = (size, color) => (n) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      return new THREE.Points(g, new THREE.PointsMaterial({ size, map: soft, color, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true }));
    };
    const snow = field(5200, pointsOf(0.22, 0xffffff));
    const hail = field(3800, pointsOf(0.11, 0xf2f6fa));
    const fields = { rain, snow, hail };

    function prime(f, cam, lo, hi) {
      for (let i = 0; i < f.n; i++) {
        f.p[i * 3] = cam.x + (Math.random() - 0.5) * BOX;
        f.p[i * 3 + 1] = lo + Math.random() * (hi - lo);
        f.p[i * 3 + 2] = cam.z + (Math.random() - 0.5) * BOX;
        f.flag[i] = 0;
      }
      f.primed = true;
    }
    function stepField(name, f, dt, t, cam, gy, cabin) {
      const lo = Math.max(gy - 1, cam.y - BELOW), hi = cam.y + ABOVE, span = hi - lo;
      if (!f.primed) prime(f, cam, lo, hi);
      const P = f.p, out = f.obj.geometry.attributes.position.array;
      const wx = name === 'snow' ? 0.5 : 1.4, wz = name === 'snow' ? 0.3 : 0.7; // a light wind
      for (let i = 0; i < f.n; i++) {
        const o = i * 3;
        let x = P[o], y = P[o + 1], z = P[o + 2];
        let vy;
        if (name === 'rain') vy = -(12 + f.v[i] * 4);
        else if (name === 'snow') { vy = -(1.1 + f.v[i] * 0.7); x += Math.sin(t * 1.3 + f.ph[i]) * 0.5 * dt; z += Math.cos(t * 1.1 + f.ph[i]) * 0.4 * dt; }
        else if (f.flag[i]) { f.vy[i] -= 9.8 * dt; vy = f.vy[i]; } else vy = -(16 + f.v[i] * 6);
        x += wx * dt; y += vy * dt; z += wz * dt;
        // hail bounces once off the ground before it melts away
        if (name === 'hail' && !f.flag[i] && y < gy + 0.05 && Math.abs(x - cam.x) < 25 && Math.abs(z - cam.z) < 25) { f.flag[i] = 1; f.vy[i] = 2 + Math.random() * 2.5; y = gy + 0.06; }
        else if (name === 'hail' && f.flag[i] && y < gy - 0.2) { f.flag[i] = 0; y += span; }
        // keep everything in a box that travels with the camera
        if (x - cam.x > HALF) x -= BOX; else if (x - cam.x < -HALF) x += BOX;
        if (z - cam.z > HALF) z -= BOX; else if (z - cam.z < -HALF) z += BOX;
        if (y < lo) y += span; else if (y > hi) y -= span;
        // and none of it falls inside the cockpit
        if (cabin) { const dx = x - cam.x, dz = z - cam.z; if (dx * dx + dz * dz < 4 && y < cam.y + 1.4 && y > cam.y - 2) y = cam.y + 1.5 + Math.random() * ABOVE; }
        P[o] = x; P[o + 1] = y; P[o + 2] = z;
        if (name === 'rain') {
          const L = 0.032 * (1 + f.v[i]);
          out[i * 6] = x; out[i * 6 + 1] = y; out[i * 6 + 2] = z;
          out[i * 6 + 3] = x - wx * L; out[i * 6 + 4] = y - vy * L; out[i * 6 + 5] = z - wz * L;
        } else { out[o] = x; out[o + 1] = y; out[o + 2] = z; }
      }
      f.obj.geometry.attributes.position.needsUpdate = true;
    }

    // ---------- after dark: headlight pools, a real lamp on the followed car, floodlights at the start ----------
    const poolTex = canvasTex(64, 128, (g, w, h) => {
      for (let y = 0; y < h; y++) {
        const v = y / h; // 0 far, 1 near (canvas top is the far end)
        const a = Math.pow(v, 1.6) * 0.95;
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.25, `rgba(255,255,255,${a})`);
        gr.addColorStop(0.75, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, y, w, 1);
      }
    });
    const poolGeo = new THREE.BufferGeometry();
    // a trapezoid on the road ahead of the car, narrow at the bumper, wide in the distance
    poolGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1.1, 0, 2.3, 1.1, 0, 2.3, 5.5, 0, 28, -5.5, 0, 28], 3));
    poolGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    poolGeo.setIndex([0, 2, 1, 0, 3, 2]);
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: col('#fff1d6'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false });
    (race.audible || race.cars).forEach((c) => {
      const m = new THREE.Mesh(poolGeo, poolMat);
      m.position.y = 0.08; m.renderOrder = 3; m.visible = false;
      c.rig.root.add(m);
      c.rig.pool = m;
    });
    const lamp = new THREE.SpotLight(col('#fff1d6'), 0, 120, 0.42, 0.6, 1.6);
    lamp.position.set(0, 0.75, 2.1);
    const lampAim = new THREE.Object3D(); lampAim.position.set(0, -0.6, 40);
    lamp.target = lampAim;
    let lampCar = null;
    const flood = [new THREE.PointLight(col('#ffe9c4'), 0, 120, 2), new THREE.PointLight(col('#ffe9c4'), 0, 120, 2)];
    const glowTex = canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,248,230,1)'); gr.addColorStop(0.25, 'rgba(255,236,190,0.6)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const glows = [];
    {
      const info = scenery.standInfo;
      const C = info ? info.center.clone() : scenery.sfPos.clone();
      const face = info ? info.facing.clone().setY(0).normalize() : new THREE.Vector3(1, 0, 0);
      const along = new THREE.Vector3(-face.z, 0, face.x);
      flood[0].position.copy(C).addScaledVector(face, 22).add(new THREE.Vector3(0, 18, 0)); // over the straight
      flood[1].position.copy(C).addScaledVector(face, 34).addScaledVector(along, 30).add(new THREE.Vector3(0, 14, 0));
      flood.forEach((l) => scene.add(l));
      // a row of lamps along the grandstand roof and over the pit straight
      for (let i = -3; i <= 3; i++) {
        [[C.clone().addScaledVector(face, 4).addScaledVector(along, i * 11).add(new THREE.Vector3(0, 12.5, 0)), 3.2],
          [C.clone().addScaledVector(face, 40).addScaledVector(along, i * 16).add(new THREE.Vector3(0, 13, 0)), 2.6]].forEach(([p, s]) => {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
          sp.position.copy(p); sp.scale.set(s, s, 1); sp.visible = false;
          scene.add(sp); glows.push(sp);
        });
      }
    }

    // ---------- the two controls ----------
    function set(kind, night, instant) {
      state.kind = LOOK[kind] ? kind : 'clear';
      state.night = !!night;
      const L = lookFor(state.kind, state.night);
      COLOR_KEYS.forEach((k) => want[k].set(L[k]));
      NUM_KEYS.forEach((k) => { want[k] = L[k]; });
      nightWant = state.night ? 1 : 0;
      if (sky.envs) scene.environment = sky.envs[L.env];
      if (audio && audio.weather) audio.weather(state.kind);
      if (instant) ease(1);
    }

    const tmpC = new THREE.Color();
    function ease(k) {
      COLOR_KEYS.forEach((key) => cur[key].lerp(want[key], k));
      NUM_KEYS.forEach((key) => { cur[key] += (want[key] - cur[key]) * k; });
      nightK += (nightWant - nightK) * k;
      const u = sky.sky.material.uniforms;
      u.top.value.copy(cur.top); u.horizon.value.copy(cur.horizon); u.ground.value.copy(cur.ground);
      u.halo.value = cur.halo; u.disc.value = cur.disc; u.stars.value = cur.stars;
      u.discCol.value.setRGB(1, 0.97, 0.9).lerp(tmpC.setRGB(0.8, 0.86, 1), nightK);
      scene.fog.color.copy(cur.fog); scene.fog.density = cur.fogD;
      sky.sun.intensity = cur.sun; sky.sun.color.copy(cur.sunCol).convertSRGBToLinear();
      sky.hemi.intensity = cur.hemi; sky.hemi.color.copy(cur.hemiSky).convertSRGBToLinear(); sky.hemi.groundColor.copy(cur.hemiGround).convertSRGBToLinear();
      renderer.toneMappingExposure = cur.exposure;
      snowCover.value = cur.cover;
      sky.clouds.children.forEach((c) => { c.material.color.copy(cur.cloud); c.material.opacity = cur.cloudOp; });
      // wet tarmac: darker and glossy
      roadMat.roughness = dryRoad.rough + (0.3 - dryRoad.rough) * cur.wet;
      roadMat.color.setScalar(1 - 0.38 * cur.wet);
      roadMat.envMapIntensity = dryRoad.env + 0.9 * cur.wet;
      // the race itself
      race.weather.grip = cur.grip; race.weather.risk = cur.risk;
      race.tailBase = 0.5 + 1.3 * nightK;
      const heads = NR.carMaterials().head;
      heads.emissiveIntensity = 1.2 + 1.2 * cur.wet + 3 * nightK;
    }

    const camPos = new THREE.Vector3();
    let sprayT = 0;
    // dt: race seconds for spray (0 when paused); fall: seconds for the precipitation (natural speed)
    function update(dt, fall, camera, view) {
      ease(1 - Math.exp(-Math.max(fall, 0.016) * 1.4));

      // precipitation follows the camera (not from the blimp: you'd never see a drop from up there)
      camera.getWorldPosition(camPos);
      const far = view.mode === 'air' && view.air === 'blimp';
      const gy = NR.groundY(camPos.x, camPos.z), t = performance.now() / 1000;
      Object.keys(fields).forEach((name) => {
        const f = fields[name];
        const on = state.kind === name && !far;
        f.alpha += ((on ? 1 : 0) - f.alpha) * Math.min(1, Math.max(fall, 0.016) * 2);
        f.obj.visible = f.alpha > 0.02;
        if (!f.obj.visible) { f.primed = false; return; }
        const bright = 1 - 0.62 * nightK;
        f.obj.material.opacity = f.alpha * (name === 'rain' ? 0.5 : name === 'snow' ? 0.92 : 0.95);
        f.obj.material.color.setScalar(bright);
        if (fall > 0) stepField(name, f, fall, t, camPos, gy, view.mode === 'cabin');
      });

      // spray off the tyres on a wet or snowy road
      if (dt > 0 && cur.wet > 0.4) {
        sprayT += dt;
        if (sprayT > 0.06) {
          const step = sprayT; sprayT = 0;
          for (const c of race.audible || race.cars) {
            if (c.hidden || c.v < 18) continue;
            if (Math.random() > Math.min(1, (c.v / 60) * (c.v / 60) * 16 * step * cur.wet)) continue;
            const p = c.world, back = -2.5;
            fx.emit('spray', { pos: [p.x + c.fwd.x * back, p.y + 0.3, p.z + c.fwd.z * back], vel: [c.vel.x * 0.35, 0.7, c.vel.z * 0.35], size: 0.8 + c.v / 70, snow: state.kind === 'snow' }, race.time);
          }
        }
      }

      // lights after dark
      const lit = nightK > 0.05;
      poolMat.opacity = 0.5 * nightK;
      for (const c of race.audible || race.cars) if (c.rig.pool) c.rig.pool.visible = lit && !c.hidden && !c.out;
      const fc = view.focusCar;
      if (fc !== lampCar) { if (fc) { fc.rig.root.add(lamp); fc.rig.root.add(lampAim); } lampCar = fc; }
      lamp.intensity = fc && !fc.hidden && !fc.out ? 1.6 * nightK : 0;
      flood.forEach((l) => { l.intensity = 0.9 * nightK; });
      glows.forEach((g) => { g.visible = lit; g.material.opacity = nightK; });
    }

    return { set, update, get kind() { return state.kind; }, get night() { return state.night; } };
  };
})();
