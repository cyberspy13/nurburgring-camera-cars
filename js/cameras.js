// cameras.js — Air (helicopter / blimp), Cabin and Spectator camera rigs.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});

  NR.createCameras = function (camera, race, scenery, track, scene) {
    const cars = race.cars;
    const state = { mode: 'air', air: 'heli', spot: 0, focus: 0, calm: false };
    let cerAng = 0;
    const cockpit = NR.buildCockpit();
    const CENTER = new THREE.Vector3(-130, 20, -70);
    const v = new THREE.Vector3(), v2 = new THREE.Vector3(), q = new THREE.Quaternion();
    const heliPos = new THREE.Vector3(), heliLook = new THREE.Vector3();
    const specLook = new THREE.Vector3();
    const idleFrame = track.newFrame();
    const focusPos = new THREE.Vector3(), tmpP = new THREE.Vector3();
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const tmpQ = new THREE.Quaternion(), euler = new THREE.Euler();
    let snap = true, specFov = 30, specTarget = null;
    const blimp = { theta: 0.6, zoom: 1, el: 0.95 };
    const heliZoom = { k: 1 };
    let cabinCar = null;

    // markers visible from the blimp
    const markers = cars.map((c) => {
      const tex = NR.world.canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = c.base; g.beginPath(); g.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2); g.fill();
        g.lineWidth = 8; g.strokeStyle = '#0b0f14'; g.stroke();
        g.fillStyle = luminance(c.base) > 0.55 ? '#0b0f14' : '#ffffff';
        g.font = `700 ${String(c.num).length > 2 ? 46 : 60}px "Saira Condensed", "Arial Narrow", sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(c.num), w / 2, h / 2 + 3);
      });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, fog: false }));
      sp.scale.set(0.045, 0.045, 1); sp.renderOrder = 10; sp.visible = false;
      scene.add(sp);
      return sp;
    });
    function luminance(hex) {
      const n = parseInt(hex.slice(1), 16);
      return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    }

    // In the cabin the solid body shell is cut away behind the windscreen so only the bonnet shows.
    const clip = new THREE.Plane();
    function setClip(car, on) {
      const mat = car.rig.shell.material;
      mat.clippingPlanes = on ? [clip] : null; mat.needsUpdate = true;
    }
    function setCabinCar(c) {
      if (cabinCar) { cabinCar.rig.glass.visible = true; cabinCar.rig.roof.visible = true; setClip(cabinCar, false); }
      cabinCar = c;
      if (c) {
        c.rig.glass.visible = false; c.rig.roof.visible = false; setClip(c, true);
        c.rig.body.add(cockpit.group);
        if (c.rig.cockpitAt) cockpit.group.position.copy(c.rig.cockpitAt); else cockpit.group.position.set(0, 0, 0); // the bus sits its driver higher up
      } else if (cockpit.group.parent) cockpit.group.parent.remove(cockpit.group);
    }

    function apply() {
      setCabinCar(state.mode === 'cabin' ? cars[state.focus] : null);
      markers.forEach((m) => { m.visible = state.mode === 'air' && state.air === 'blimp'; });
      camera.near = state.mode === 'cabin' ? 0.04 : state.mode === 'air' && state.air === 'blimp' ? 4 : 0.3;
      camera.updateProjectionMatrix();
      snap = true;
    }

    // dt is wall-clock time; rate is the race speed, so the chase smoothing keeps pace with the cars at 2x-16x
    function update(dt, t, rate) {
      const c = cars[state.focus];
      const chase = dt * Math.max(1, rate || 1);
      const shake = state.calm ? 0 : 1;
      // crowds get louder as cars approach their spot
      scenery.spots.forEach((sp) => {
        let dmin = 1e9;
        for (const o of cars) if (!o.hidden) dmin = Math.min(dmin, o.world.distanceTo(sp.center));
        sp.excite = Math.max(0, Math.min(1, 1 - dmin / 160));
      });

      if (state.mode === 'air' && state.air === 'heli') {
        const back = 24 * heliZoom.k, high = 13 * heliZoom.k;
        v.copy(c.world).addScaledVector(c.fr.fwd, -back).addScaledVector(c.fr.side, 9 * Math.sin(t * 0.07));
        v.y = c.world.y + high;
        v.y = Math.max(v.y, NR.groundY(v.x, v.z) + 6);
        if (snap || heliPos.distanceTo(v) > 140) { heliPos.copy(v); heliLook.copy(c.world); }
        heliPos.lerp(v, 1 - Math.exp(-chase * 1.7));
        v2.copy(c.world).addScaledVector(c.fr.fwd, Math.min(9, c.v * 0.2));
        heliLook.lerp(v2, 1 - Math.exp(-chase * 6));
        camera.position.copy(heliPos);
        camera.position.y += Math.sin(t * 0.9) * 0.35 * shake;
        camera.position.x += Math.sin(t * 0.63) * 0.25 * shake;
        camera.lookAt(heliLook);
        camera.fov = 50;
        focusPos.copy(c.world);
      } else if (state.mode === 'air') {
        blimp.theta += dt * 0.012;
        const D = 1900 * blimp.zoom;
        camera.position.set(
          CENTER.x + Math.sin(blimp.theta) * Math.cos(blimp.el) * D,
          CENTER.y + Math.sin(blimp.el) * D,
          CENTER.z + Math.cos(blimp.theta) * Math.cos(blimp.el) * D);
        camera.lookAt(CENTER);
        camera.fov = 45;
        cars.forEach((o, i) => { markers[i].position.copy(o.world).y += 6; markers[i].scale.setScalar(i === state.focus ? 0.06 : 0.042); });
        focusPos.copy(c.world);
      } else if (state.mode === 'ceremony') {
        // the winner's celebration: a slow sweep on the pit side, looking back at the grandstand
        const C = race.ceremony;
        cerAng = 0.85 * Math.sin(t * 0.07);
        v.copy(C.center).addScaledVector(C.side, Math.cos(cerAng) * 15).addScaledVector(C.fwd, Math.sin(cerAng) * 15);
        v.y = C.center.y + 3.6 + Math.sin(t * 0.21) * 0.8;
        camera.position.copy(v);
        v2.copy(C.center).addScaledVector(C.side, -2); v2.y += 1.4;
        camera.lookAt(v2);
        camera.fov = 52;
        focusPos.copy(C.center);
      } else if (state.mode === 'cabin') {
        c.rig.root.updateMatrixWorld(true);
        (c.rig.eye ? v.copy(c.rig.eye) : v.set(0.36, 1.06, -0.3)).applyMatrix4(c.rig.body.matrixWorld);
        const vib = shake * Math.min(1, c.v / 70);
        v.x += (Math.random() - 0.5) * 0.004 * vib; v.y += (Math.random() - 0.5) * 0.006 * vib;
        camera.position.copy(v);
        c.rig.body.getWorldQuaternion(q);
        v2.set(0, 0, 1).applyQuaternion(q);
        clip.setFromNormalAndCoplanarPoint(v2, tmpP.set(0, 0, c.rig.screenZ + 0.02).applyMatrix4(c.rig.body.matrixWorld));
        euler.set(-0.06 + c.accel * 0.0015, c.steer * 0.9 + (Math.random() - 0.5) * 0.002 * vib, -c.latAcc * 0.004 * shake, 'YXZ');
        tmpQ.setFromEuler(euler);
        camera.quaternion.copy(q).multiply(flip).multiply(tmpQ);
        cockpit.wheel.rotation.z = Math.max(-2.4, Math.min(2.4, c.steer * 13));
        camera.fov = 66;
        focusPos.copy(c.world);
      } else {
        const sp = scenery.spots[state.spot];
        let best = null, bd = 230;
        for (const o of cars) { if (o.hidden) continue; const d = o.world.distanceTo(sp.cam); if (d < bd) { bd = d; best = o; } }
        if (best) {
          v.copy(best.world).addScaledVector(best.fwd, best.v * 0.06); v.y += best.rig.aimY || 0.7;
          specTarget = best;
        } else {
          track.frame(sp.s - 90, 0, idleFrame);
          v.copy(idleFrame.pos); v.y += 1;
          specTarget = null;
        }
        if (snap) specLook.copy(v);
        specLook.lerp(v, 1 - Math.exp(-chase * (best ? 9 : 2)));
        camera.position.copy(sp.cam);
        camera.position.y += Math.sin(t * 1.3) * 0.02 * shake;
        camera.lookAt(specLook.x + Math.sin(t * 2.1) * 0.05 * shake, specLook.y + Math.sin(t * 1.7) * 0.04 * shake, specLook.z);
        const d = camera.position.distanceTo(specLook);
        const want = best ? THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan((best.rig.frame || 6.5) / d)), 9, 62) : 50;
        if (snap) specFov = want;
        specFov += (want - specFov) * (1 - Math.exp(-chase * 2.5));
        camera.fov = specFov;
        focusPos.copy(sp.center);
      }
      camera.updateProjectionMatrix();
      snap = false;
      return focusPos;
    }

    // pointer controls: drag to orbit the blimp, wheel to zoom heli / blimp
    function onWheel(e) {
      if (state.mode !== 'air') return;
      const k = Math.exp(e.deltaY * 0.001);
      if (state.air === 'blimp') blimp.zoom = THREE.MathUtils.clamp(blimp.zoom * k, 0.35, 1.4);
      else heliZoom.k = THREE.MathUtils.clamp(heliZoom.k * k, 0.5, 3);
    }
    let drag = null;
    function onDown(e) { if (state.mode === 'air' && state.air === 'blimp') drag = { x: e.clientX, y: e.clientY }; }
    function onMove(e) {
      if (!drag) return;
      blimp.theta -= (e.clientX - drag.x) * 0.004;
      blimp.el = THREE.MathUtils.clamp(blimp.el + (e.clientY - drag.y) * 0.003, 0.35, 1.45);
      drag = { x: e.clientX, y: e.clientY };
    }
    function onUp() { drag = null; }

    // hand the camera to the replay director: no cockpit, no clipping, no blimp markers
    function release() {
      setCabinCar(null);
      markers.forEach((m) => { m.visible = false; });
      camera.near = 0.3; camera.updateProjectionMatrix();
    }

    return {
      state, apply, update, release, onWheel, onDown, onMove, onUp,
      get specTarget() { return specTarget; },
      setMode(m) { state.mode = m; apply(); },
      setAir(a) { state.air = a; apply(); },
      setFocus(i) { state.focus = (i + cars.length) % cars.length; apply(); },
      setSpot(i) { state.spot = (i + scenery.spots.length) % scenery.spots.length; apply(); },
    };
  };
})();
