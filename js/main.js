// main.js — boot, render loop, race control (flags, replays, the winner's celebration) and the broadcast-style interface.
(function () {
  'use strict';
  const NR = window.NR;
  const $ = (id) => document.getElementById(id);
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const fmtLap = (t) => (t == null ? '–:––.–––' : `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`);
  const fmtClock = (t) => `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`;
  const fmtRace = (t) => `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${(t % 60).toFixed(3).padStart(6, '0')}`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  async function start(saved) {
    saved = saved || {};
    const status = (msg) => { $('loadingText').textContent = msg; };
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* fonts optional */ }

    const host = $('view');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.3 : 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 9000);

    status('Laying out the Nordschleife…'); await nextFrame();
    const track = NR.buildTrack();
    NR.world.makeTextures();
    const sky = NR.world.buildSky(scene, renderer);
    status('Shaping the Eifel hills…'); await nextFrame();
    const terrain = NR.world.buildTerrain(track, scene);
    const road = NR.world.buildRoad(track, scene);
    status('Planting forests and filling the grandstands…'); await nextFrame();
    const scenery = NR.buildScenery(track, scene);
    status('Rolling the GT3 field out…'); await nextFrame();
    const fx = NR.createFx(scene);
    const race = NR.createRace(track, scene, fx);
    const bus = race.cars.find((c) => c.type === 'bus');
    if (bus) scenery.addRiders(bus.rig); // the pupils on its open top deck
    const pits = NR.createPits(race, track, scene);
    const planes = NR.createPlanes(scene);
    const cams = NR.createCameras(camera, race, scenery, track, scene, planes);
    const replay = NR.createReplay(race, fx, track, camera);
    const cars = race.cars;
    const audio = NR.createAudio(race);
    const weather = NR.createWeather({ scene, renderer, sky, terrain, road, race, fx, audio, scenery, track });
    NR.debug = { renderer, scene, camera, sky, race, cams, audio, fx, replay, scenery, weather, pits, track, planes };
    fx.onCrash = (pos, s) => audio.impact?.(pos, s);
    fx.onBurst = (pos) => audio.firework?.(pos);

    // the rolling start: run the field for a few seconds so it is already racing on first view
    function warmUp() {
      race.quiet = true;
      for (let i = 0; i < 60 * 6; i++) race.step(1 / 60);
      race.quiet = false;
      race.render(0);
      pits.update();
    }
    warmUp();

    const st = cams.state;
    st.calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    st.mode = saved.mode && saved.mode !== 'ceremony' ? saved.mode : 'air'; st.air = saved.air || 'heli';
    st.spot = saved.spot || 0; st.focus = saved.focus != null ? saved.focus : 0;
    let speed = saved.speed || 1, paused = false, autoReplay = saved.autoReplay !== false;
    cams.apply();
    audio.setEnabled(saved.sound !== false);
    weather.set(saved.weather || 'clear', !!saved.night, true);
    window.claude?.hot?.snapshot?.(() => ({ mode: st.mode, air: st.air, spot: st.spot, focus: st.focus, speed, sound: audio.enabled, autoReplay, weather: weather.kind, night: weather.night }));

    // ---------- interface ----------
    const modeBtns = document.querySelectorAll('[data-mode]');
    const airBtns = document.querySelectorAll('[data-air]');
    function syncUI() {
      modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
      airBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.air === st.air)));
      $('subAir').hidden = st.mode !== 'air';
      $('subSpot').hidden = st.mode !== 'spectator';
      $('subCabin').hidden = st.mode !== 'cabin';
      $('spotName').textContent = scenery.spots[st.spot].name;
      const c = cars[st.focus];
      $('fcSwatch').style.background = c.base;
      $('fcNum').textContent = '#' + c.num;
      $('fcName').textContent = c.brand;
      $('fcModel').textContent = c.model;
      $('fcEngine').textContent = NR.engineOf(c).label;
      $('cabinName').textContent = `#${c.num} ${c.brand} ${c.model}`;
      $('speedSel').value = String(speed);
      $('autoReplay').setAttribute('aria-pressed', String(autoReplay));
      $('replayBtn').disabled = !replay.clips.length || !!driving;
      syncDriveUI();
      document.querySelectorAll('[data-wx]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wx === weather.kind)));
      document.querySelectorAll('[data-tod]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.tod === 'night') === weather.night)));
      document.body.dataset.mode = st.mode + (st.mode === 'air' ? '-' + st.air : '');
      renderTower(true);
    }
    function setMode(m) {
      if (replay.active) replay.stop();
      cams.setMode(m);
      if (m === 'spectator') showBanner(scenery.spots[st.spot].name, 'Spectator view');
      syncUI();
    }
    function setFocus(i) {
      if (driving) return; // the camera stays on your car
      if (replay.active) replay.stop();
      let n = (i + cars.length) % cars.length;
      const dir = i < st.focus ? -1 : 1;
      for (let k = 0; k < cars.length && cars[n].hidden; k++) n = (n + dir + cars.length) % cars.length; // skip cars off stage
      cams.setFocus(n); lastSection = -1; syncUI();
    }
    function setSpot(i) { if (replay.active) replay.stop(); cams.setSpot(i); showBanner(scenery.spots[st.spot].name, 'Spectator view'); syncUI(); }
    modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    airBtns.forEach((b) => b.addEventListener('click', () => { if (replay.active) replay.stop(); cams.setAir(b.dataset.air); syncUI(); }));
    $('spotPrev').addEventListener('click', () => setSpot(st.spot - 1));
    $('spotNext').addEventListener('click', () => setSpot(st.spot + 1));
    $('carPrev').addEventListener('click', () => setFocus(st.focus - 1));
    $('carNext').addEventListener('click', () => setFocus(st.focus + 1));
    $('pauseBtn').addEventListener('click', togglePause);
    $('speedSel').addEventListener('change', (e) => { speed = parseFloat(e.target.value) || 1; });
    $('hudBtn').addEventListener('click', toggleHud);
    $('showHud').addEventListener('click', toggleHud);
    // drawers on smaller screens: the standings, and on phones the weather (in place of the map)
    [['towerToggle', 'tower-open'], ['wxToggle', 'wx-open']].forEach(([id, cls]) => $(id).addEventListener('click', () => {
      $(id).setAttribute('aria-expanded', String(document.body.classList.toggle(cls)));
    }));
    if (window.matchMedia('(pointer: coarse)').matches) $('zoomTip').textContent = 'Pinch to zoom';
    $('towerList').addEventListener('click', (e) => {
      const row = e.target.closest('[data-i]');
      if (row) setFocus(+row.dataset.i);
    });
    // weather and time of day
    const SKIES = ['clear', 'rain', 'snow', 'hail'], SKY_NAMES = { clear: 'Clear skies', rain: 'Rain', snow: 'Snow', hail: 'Hailstorm' };
    function setWeather(kind, night) {
      const changedSky = kind !== weather.kind, changedTime = night !== weather.night;
      weather.set(kind, night);
      if (changedSky) showBanner(SKY_NAMES[kind], kind === 'clear' ? 'Weather · dry track' : 'Weather · less grip, take care', 3);
      else if (changedTime) showBanner(night ? 'Night race' : 'Day race', 'Time of day', 3);
      syncUI();
    }
    document.querySelectorAll('[data-wx]').forEach((b) => b.addEventListener('click', () => setWeather(b.dataset.wx, weather.night)));
    document.querySelectorAll('[data-tod]').forEach((b) => b.addEventListener('click', () => setWeather(weather.kind, b.dataset.tod === 'night')));

    function togglePause() {
      paused = !paused;
      $('pauseBtn').setAttribute('aria-pressed', String(paused));
      $('pauseBtn').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    }
    function toggleHud() { document.body.classList.toggle('hud-hidden'); }

    // engine sound: on by default, but browsers only start it after the first tap, click or key press
    const soundBtn = $('soundBtn');
    function syncSound() {
      const s = audio.status();
      soundBtn.setAttribute('aria-pressed', String(s === 'on'));
      soundBtn.classList.toggle('waiting', s === 'waiting');
      soundBtn.classList.toggle('muted', s === 'off');
      soundBtn.title = s === 'waiting' ? 'Engine sound starts on your first tap, click or key press (M)' : `Engine sound ${s} (M)`;
    }
    function toggleSound() {
      if (audio.status() === 'on') audio.setEnabled(false);
      else { audio.setEnabled(true); audio.unlock(); }
    }
    audio.onChange = syncSound;
    syncSound();
    soundBtn.addEventListener('click', toggleSound);
    const unlockSound = (e) => {
      if (e.target === soundBtn || soundBtn.contains(e.target) || e.key === 'm' || e.key === 'M') return;
      audio.unlock();
    };
    ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlockSound, true));

    // ---------- replays ----------
    const queue = [];
    $('replayBtn').addEventListener('click', () => playClip(replay.clips[replay.clips.length - 1]));
    $('skipReplay').addEventListener('click', () => { queue.length = 0; replay.stop(); });
    $('autoReplay').addEventListener('click', () => { autoReplay = !autoReplay; syncUI(); });
    function playClip(clip) { if (clip && race.phase !== 'ceremony' && !driving) replay.start(clip); }
    replay.onClip = (clip) => {
      flagReplayReady(clip);
      $('replayBtn').disabled = !!driving;
      if (!autoReplay || race.phase === 'ceremony' || driving) return;
      if (replay.active) queue.push(clip); else replay.start(clip);
    };
    replay.onState = (on, clip) => {
      document.body.classList.toggle('replaying', on);
      race.setReplay(on);
      if (on) {
        cams.release();
        const who = clip.cars.map((c) => `#${c.num} ${c.brand}`).join(' & ');
        $('replayTitle').textContent = who;
        $('replaySub').textContent = `${clip.section} · Lap ${clip.lap} · ${clip.out ? 'Out of the race' : clip.kind === 'spin' ? 'Spin' : 'Off the road'}`;
      } else {
        cams.apply();
        const next = queue.shift();
        if (next) setTimeout(() => { if (!replay.active) playClip(next); }, 400);
      }
    };

    // ---------- banners and flags ----------
    let bannerTimer = 0, bannerPrio = -1, bannerUntil = 0;
    function showBanner(title, kicker, prio) {
      prio = prio || 0;
      const now = performance.now();
      if (now < bannerUntil && prio < bannerPrio) return; // don't bury important news under section names
      bannerPrio = prio; bannerUntil = now + 2600;
      $('bannerKicker').textContent = kicker; $('bannerTitle').textContent = title;
      const b = $('banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
      clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 2600);
    }
    const flags = [];
    function flagFor(ev) {
      const open = flags.find((f) => ev.t - f.t < 6);
      if (open) { open.cars.push(ev.car); updateFlag(open); return; }
      const el = document.createElement('div');
      el.className = 'flag panel';
      const f = { t: ev.t, cars: [ev.car], section: ev.section, el, kind: ev.kind, born: performance.now(), clip: null };
      flags.push(f);
      $('flags').prepend(el);
      updateFlag(f);
      while (flags.length > 3) flags.shift().el.remove();
    }
    function updateFlag(f) {
      const what = (c) => `#${c.num} ${c.brand} ${c.out ? 'is out' : c.state === 'crash' ? (f.kind === 'spin' ? 'spins' : 'goes off') : 'carries on'}`;
      const html = `<small>Yellow flag · ${esc(f.section)}</small><b>${esc(f.cars.map(what).join(' · '))}</b>` +
        (f.clip ? `<button type="button" class="ctrl">▶ Replay</button>` : '');
      if (html === f.html) return; // #flags is a live region: rewriting it unchanged makes screen readers repeat it
      f.html = html; f.el.innerHTML = html;
      if (f.clip) f.el.querySelector('button').addEventListener('click', () => playClip(f.clip));
    }
    function flagReplayReady(clip) {
      const f = flags.find((x) => Math.abs(x.t - clip.t0) < 0.01);
      if (f) { f.clip = clip; f.born = performance.now(); updateFlag(f); }
    }
    function pruneFlags() {
      const now = performance.now();
      for (let i = flags.length - 1; i >= 0; i--) {
        const f = flags[i];
        if (now - f.born > (f.clip ? 14000 : 30000)) { f.el.remove(); flags.splice(i, 1); }
        else if (!f.clip) updateFlag(f);
      }
    }

    // ---------- race events ----------
    let ceremonyIn = -1, fireworksT = 0, fireworksOn = false, confettiT = 0;
    race.onEvent = (ev) => {
      const c = ev.car;
      switch (ev.type) {
        case 'incident':
          replay.incident(ev);
          flagFor(ev);
          scenery.react?.(c.world, 0.8);
          showBanner(`#${c.num} ${c.brand} ${ev.kind === 'spin' ? 'spins' : 'goes off'}`, `Yellow flag · ${ev.section}`, 2);
          break;
        case 'impact':
          scenery.react?.(ev.pos, ev.strength);
          break;
        case 'retire':
          showBanner(`#${c.num} ${c.brand} is out`, `Retired · ${ev.section}`, 2);
          break;
        case 'overtake': {
          const o = ev.other;
          if (c.idx === st.focus || o.idx === st.focus || ev.pos <= 3) showBanner(`#${c.num} ${c.brand} passes #${o.num} ${o.brand}`, `Overtake · P${ev.pos}`, 1);
          if (c === bus) scenery.busCheer(3); // the whole top deck on its feet
          break;
        }
        case 'leaderLap':
          if (ev.lap === race.TOTAL_LAPS) showBanner('Final lap', `#${c.num} ${c.brand} leads`, 3);
          else showBanner(`Lap ${ev.lap} of ${race.TOTAL_LAPS}`, `Leader #${c.num} ${c.brand}`, 1);
          break;
        case 'win':
          showBanner(c === race.player ? 'You win!' : `#${c.num} ${c.brand} wins!`, 'Chequered flag', 4);
          document.body.classList.add('chequered');
          scenery.setCelebration?.(true);
          audio.celebrate?.(true);
          fireworksOn = true;
          if (st.mode !== 'spectator') setFocus(c.idx);
          break;
        case 'finish':
          if (c === race.player && ev.rank > 1) showBanner(`You finished P${ev.rank}!`, `Chequered flag · #${c.num} ${c.brand}`, 5);
          else if (ev.rank > 1 && (c.idx === st.focus || ev.rank <= 3)) showBanner(`#${c.num} ${c.brand} finishes P${ev.rank}`, 'Chequered flag', 2);
          break;
        case 'raceover':
          ceremonyIn = 3.5;
          break;
        case 'pitIn':
          if (c.idx === st.focus || c.pos <= 3) showBanner(`#${c.num} ${c.brand} pits`, `Pit stop · Lap ${ev.lap}`, 2);
          break;
        case 'pitOut':
          if (c.idx === st.focus || c.pos <= 3) showBanner(`Stationary ${ev.stationary.toFixed(1)} s`, `#${c.num} ${c.brand} · fuel, tyres, driver${ev.repaired ? ', repairs' : ''}`, 2);
          break;
        case 'safetyCar':
          document.body.classList.add('sc-out');
          showBanner('Safety car deployed', `Incident · ${ev.section}`, 4);
          break;
        case 'safetyCarIn':
          showBanner('Safety car in this lap', 'Get ready for the restart', 3);
          break;
        case 'green':
          document.body.classList.remove('sc-out');
          showBanner('Green flag', 'Racing resumes', 4);
          break;
      }
    };

    // ---------- the celebration ----------
    function fade(mid) {
      const f = $('fade');
      f.classList.add('on');
      setTimeout(() => { mid(); setTimeout(() => f.classList.remove('on'), 120); }, 650);
    }
    function beginCeremony() {
      queue.length = 0;
      if (replay.active) replay.stop();
      fade(() => {
        race.beginCeremony();
        document.body.classList.remove('sc-out');
        document.body.classList.add('ceremony');
        $('podiumBtn').hidden = false;
        st.focus = race.winner ? race.winner.idx : st.focus;
        cams.setMode('ceremony');
        fireworksOn = true; fireworksT = 0; confettiT = 0;
        showResults();
        syncUI();
      });
    }
    function showResults() {
      const order = race.classification(), w = race.winner || order[0];
      const fastest = cars.filter((c) => c.bestLap).sort((a, b) => a.bestLap - b.bestLap)[0];
      $('resSwatch').style.background = w.base;
      $('resName').textContent = `#${w.num} ${w.brand} ${w.model}`;
      $('resMeta').textContent = `${race.TOTAL_LAPS} laps in ${fmtRace(w.finishTime)}` + (fastest ? ` · Fastest lap ${fmtLap(fastest.bestLap)} (#${fastest.num} ${fastest.brand})` : '');
      $('resKicker').textContent = `Chequered flag · ${race.TOTAL_LAPS} laps`;
      $('resList').innerHTML = order.map((c) => {
        const res = c.out ? 'DNF' : c.finishRank === 1 ? fmtRace(c.finishTime) : c.lapsDown ? `+${plural(c.lapsDown, 'lap')}` : '+' + (c.finishTime - w.finishTime).toFixed(3);
        const you = c === race.player;
        return `<li class="${c.out ? 'out' : ''}${you ? ' you' : ''}"><span class="p">${c.out ? '–' : c.pos}</span><span class="sw" style="background:${c.base}"></span>` +
          `<span class="n">${c.num}</span><span class="b">${esc(c.brand)}${you ? ' (you)' : ''}</span><span class="g">${res}</span><span class="bl">${fmtLap(c.bestLap)}</span></li>`;
      }).join('');
      $('results').hidden = false; $('resShow').hidden = true;
    }
    $('resHide').addEventListener('click', () => { $('results').hidden = true; $('resShow').hidden = false; });
    $('resShow').addEventListener('click', () => { $('results').hidden = false; $('resShow').hidden = true; });
    // clear away the last race: replays, flags, the celebration
    function clearStage() {
      replay.reset(); queue.length = 0;
      flags.forEach((f) => f.el.remove()); flags.length = 0;
      document.body.classList.remove('ceremony', 'chequered', 'sc-out');
      $('podiumBtn').hidden = true; $('results').hidden = true; $('resShow').hidden = true;
      scenery.setCelebration?.(false); audio.celebrate?.(false);
      fireworksOn = false; ceremonyIn = -1;
    }
    $('restartBtn').addEventListener('click', () => {
      if (driving) { startDrive(driving); return; }
      fade(() => {
        clearStage();
        race.reset(); warmUp();
        st.focus = 0; cams.setMode('air');
        showBanner(`Lap 1 of ${race.TOTAL_LAPS}`, 'Green flag', 3);
        syncUI();
      });
    });
    const PALETTE = ['#ffd23f', '#e5322d', '#ffffff', '#3fb6ff', '#22c55e', '#ff7a00', '#c084fc'];
    function celebrate(dt) {
      if (!fireworksOn) return;
      const C = race.ceremony;
      if ((fireworksT -= dt) <= 0) {
        fireworksT = 0.5 + Math.random() * 0.9;
        // launched from behind the grandstand and from the pit roof
        const behind = Math.random() < 0.6 ? -1 : 1;
        track.frame(NR.S_FINISH + 20 + Math.random() * 90, behind * (track.HALF_W + (behind < 0 ? 34 : 26)), tf);
        fx.emit('firework', { pos: [tf.pos.x, tf.pos.y + 4, tf.pos.z], color: PALETTE[(Math.random() * PALETTE.length) | 0] }, race.time);
      }
      if (race.phase === 'ceremony' && (confettiT -= dt) <= 0) {
        confettiT = 5;
        fx.emit('confetti', { pos: [C.center.x, C.center.y + 16, C.center.z], n: 260, spread: 34 }, race.time);
      }
    }
    const tf = track.newFrame();

    // The banner planes circle a point just ahead of whatever is being watched: the followed car's road
    // ahead, the far side of the road from a stand, the podium, or the replay.
    const planeAt = new THREE.Vector3(), tfp = track.newFrame();
    function planeTarget() {
      if (replay.active) return planeAt.copy(replay.focus);
      if (st.mode === 'ceremony') return planeAt.copy(race.ceremony.center);
      if (st.mode === 'spectator') { const sp = scenery.spots[st.spot]; return planeAt.copy(track.frame(sp.s, -sp.side * 150, tfp).pos); }
      const c = cars[st.focus];
      return planeAt.copy(c.world).addScaledVector(c.fwd, 110);
    }

    const AIRS = ['heli', 'blimp', 'plane'];
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('select')) return;
      if (!$('driveSetup').hidden) { if (e.key === 'Escape') closeSetup(); return; }
      if (driving) {
        if (driveKeys(e, true)) { e.preventDefault(); return; }
        if (!/^[pPhHmMnN ]$/.test(e.key)) return; // pause, overlay, sound and night still work
      }
      const k = e.key;
      if (k === '1') setMode('air');
      else if (k === '2') setMode('cabin');
      else if (k === '3') setMode('spectator');
      else if (k === 'b' || k === 'B') { if (replay.active) replay.stop(); cams.setAir(AIRS[(AIRS.indexOf(st.air) + 1) % AIRS.length]); syncUI(); }
      else if (k === 'ArrowRight' || k === 'e' || k === 'E') st.mode === 'spectator' ? setSpot(st.spot + 1) : setFocus(st.focus + 1);
      else if (k === 'ArrowLeft' || k === 'q' || k === 'Q') st.mode === 'spectator' ? setSpot(st.spot - 1) : setFocus(st.focus - 1);
      else if (k === 'p' || k === 'P' || k === ' ') { e.preventDefault(); togglePause(); }
      else if (k === 'h' || k === 'H') toggleHud();
      else if (k === 'm' || k === 'M') toggleSound();
      else if (k === 'w' || k === 'W') setWeather(SKIES[(SKIES.indexOf(weather.kind) + 1) % SKIES.length], weather.night);
      else if (k === 'n' || k === 'N') setWeather(weather.kind, !weather.night);
      else if (k === 'r' || k === 'R') { if (replay.active) replay.stop(); else playClip(replay.clips[replay.clips.length - 1]); }
      else if (k === 'Escape' && replay.active) { queue.length = 0; replay.stop(); }
      else if (k === 'd' || k === 'D') openSetup();
      else return;
    });
    // On the 3D view a mouse drag or one finger turns the blimp; the wheel or a two-finger pinch zooms.
    const cv = renderer.domElement, touches = new Map();
    let pinch = 0;
    const spread = () => { const [a, b] = touches.values(); return Math.hypot(a.x - b.x, a.y - b.y); };
    cv.addEventListener('wheel', (e) => { e.preventDefault(); cams.onWheel(e); }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 1) cams.onDown(e);
      else { cams.onUp(); pinch = touches.size === 2 ? spread() : 0; } // a second finger: stop turning
    });
    window.addEventListener('pointermove', (e) => {
      const t = touches.get(e.pointerId);
      if (t) { t.x = e.clientX; t.y = e.clientY; }
      if (touches.size !== 2) { cams.onMove(e); return; }
      const d = spread();
      if (pinch && d) cams.zoom(pinch / d);
      pinch = d;
    });
    const lift = (e) => { touches.delete(e.pointerId); pinch = 0; cams.onUp(); };
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', lift); // iOS cancels a touch when the system takes the gesture

    // ---------- timing tower ----------
    let towerT = 0;
    function gapText(c, leader) {
      if (c.out) return 'Out';
      if (c.finished) {
        if (c.finishRank === 1) return 'Winner';
        return c.lapsDown ? `+${plural(c.lapsDown, 'lap')}` : '+' + (c.finishTime - race.winner.finishTime).toFixed(3);
      }
      if (c.state === 'crash') return 'Incident';
      if (c.pit && c.pit.phase !== 'in') return 'In pit';
      if (c === leader) return 'Leader';
      const down = Math.floor((leader.dist - c.dist) / track.L);
      return down >= 1 ? `+${plural(down, 'lap')}` : '+' + Math.max(0, c.gap).toFixed(3);
    }
    // One row per car, built once. A refresh rewrites only what changed and reorders the rows round the
    // focused one (moving a focused element drops its focus), so keyboard users keep their place.
    const towerList = $('towerList');
    const towerRows = cars.map((c) => {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="row" data-i="${c.idx}" aria-label="Follow #${c.num} ${c.brand}">
          <span class="p"></span><span class="sw" style="background:${c.base}"></span>
          <span class="n">${c.num}</span><span class="b">${c.brand}</span><span class="g"></span><span class="m"></span></button>`;
      const b = li.firstElementChild;
      return { li, b, p: b.querySelector('.p'), g: b.querySelector('.g'), m: b.querySelector('.m'), mark: '' };
    });
    const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };
    function renderTower(force) {
      const now = performance.now();
      if (!force && now - towerT < 400) return;
      towerT = now;
      const order = cars.slice().sort((a, b) => a.pos - b.pos);
      const leader = order[0], t = race.time;
      order.forEach((c) => {
        const r = towerRows[c.idx];
        const cls = ['row', c.idx === st.focus ? 'on' : '', c.out ? 'out' : '', c.state === 'crash' ? 'inc' : '', c.finished ? 'fin' : ''].join(' ');
        const mark = c.finished ? '<i class="chq" aria-label="Finished"></i>' : t - c.gainT < 4 ? '<i class="up" aria-label="Gained a place">▲</i>' : t - c.loseT < 4 ? '<i class="dn" aria-label="Lost a place">▼</i>' : '';
        if (r.b.className !== cls) r.b.className = cls;
        if (r.mark !== mark) { r.mark = mark; r.m.innerHTML = mark; }
        setText(r.p, String(c.pos));
        setText(r.g, gapText(c, leader));
      });
      const want = order.map((c) => towerRows[c.idx].li);
      if (want.some((li, i) => towerList.children[i] !== li)) {
        const keep = towerList.contains(document.activeElement) ? document.activeElement.closest('li') : null;
        const k = want.indexOf(keep);
        want.forEach((li, i) => { if (li !== keep) k < 0 || i > k ? towerList.appendChild(li) : towerList.insertBefore(li, keep); });
      }
      const ph = race.phase;
      $('lapNow').textContent = ph === 'race' ? `Lap ${Math.min(race.TOTAL_LAPS, leader.lap)}/${race.TOTAL_LAPS}` : 'Chequered flag';
      const scp = race.scPhase;
      $('scBadge').hidden = scp === 'none';
      $('scBadge').textContent = scp === 'deployed' ? 'Safety car' : scp === 'ending' ? 'SC in this lap' : 'Restart';
    }

    // ---------- drive mode ----------
    // Pick a car and race it: from the back of a standing grid, against rivals at the chosen pace, over a
    // quick 5 laps or the full race. The arrows or WASD drive it; on a phone or iPad, tilt to steer (or use
    // the buttons) with pedals on the screen. Exit goes back to watching, exactly as before.
    let driving = null, countdown = 0, goT = 0, steerKeys = 0;
    const held = { gas: false, brake: false, left: false, right: false }; // keyboard
    const pad = { gas: false, brake: false, left: false, right: false };  // touch pedals and buttons
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

    // the setup panel
    $('dsCars').innerHTML = cars.map((c, i) => `<label class="ds-car"><input type="radio" name="dsCar" value="${i}"><span class="sw" style="background:${c.base}"></span>` +
      `<b>#${c.num} ${esc(c.brand)}</b><small>${esc(c.type === 'bus' ? 'Open-top bus · a bit slower' : c.model)}</small></label>`).join('');
    $('dsSteer').hidden = !coarse;
    document.querySelector('.ds-keys').hidden = coarse;
    let setupFrom = null;
    function openSetup() {
      if (replay.active) { queue.length = 0; replay.stop(); }
      const pick = document.querySelector(`input[name="dsCar"][value="${driving ? driving.idx : st.focus}"]`);
      pick.checked = true;
      setupFrom = document.activeElement;
      $('driveSetup').hidden = false;
      pick.focus();
    }
    function closeSetup() {
      $('driveSetup').hidden = true;
      if (setupFrom && setupFrom.focus) setupFrom.focus();
    }
    const radio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
    $('driveBtn').addEventListener('click', openSetup);
    $('dsClose').addEventListener('click', closeSetup);
    $('dsCancel').addEventListener('click', closeSetup);
    $('driveSetup').addEventListener('click', (e) => { if (e.target === $('driveSetup')) closeSetup(); });
    $('driveSetup').addEventListener('keydown', (e) => { // keep Tab inside the panel
      if (e.key !== 'Tab') return;
      const f = [...$('driveSetup').querySelectorAll('button, input')].filter((el) => !el.closest('[hidden]') && (el.type !== 'radio' || el.checked));
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    $('dsStart').addEventListener('click', () => {
      const o = { idx: +radio('dsCar'), laps: +radio('dsLaps'), ai: +radio('dsAi'), steerBy: coarse ? radio('dsSteerBy') : 'keys', flip: $('dsFlip').checked };
      // iOS asks before a page may read the tilt, and only from a tap
      const DM = window.DeviceMotionEvent;
      if (o.steerBy === 'tilt' && DM && typeof DM.requestPermission === 'function') {
        DM.requestPermission().then((r) => { if (r !== 'granted') o.steerBy = 'buttons'; startDrive(o); }, () => { o.steerBy = 'buttons'; startDrive(o); });
      } else {
        if (o.steerBy === 'tilt' && !DM) o.steerBy = 'buttons';
        startDrive(o);
      }
    });

    function startDrive(o) {
      closeSetup();
      driving = o;
      fade(() => {
        clearStage();
        race.setDrive({ idx: o.idx, laps: o.laps, ai: o.ai });
        race.render(0); pits.update();
        st.focus = o.idx; cams.setMode(o.view || 'chase');
        document.body.classList.add('driving');
        countdown = 3.6; goT = 0;
        if (o.steerBy === 'tilt') startTilt(o.flip); else stopTilt();
        syncUI();
      });
    }
    function exitDrive() {
      if (!driving) return;
      fade(() => {
        driving = null; stopTilt(); countdown = 0;
        clearStage();
        race.setDrive(null); warmUp();
        document.body.classList.remove('driving');
        cams.setMode('air');
        showBanner(`Lap 1 of ${race.TOTAL_LAPS}`, 'Green flag', 3);
        syncUI();
      });
    }
    function setView(m) { if (driving) { driving.view = m; cams.setMode(m); syncUI(); } }
    $('dExit').addEventListener('click', exitDrive);
    $('resExit').addEventListener('click', exitDrive);
    $('dView').addEventListener('click', () => setView(st.mode === 'chase' ? 'cabin' : 'chase'));
    $('dCentre').addEventListener('click', () => { tilt.zero = null; });

    // keyboard: the arrows or WASD; C (or 1 and 2) switches between the chase camera and the driver's seat
    const KEYS = { ArrowUp: 'gas', w: 'gas', W: 'gas', ArrowDown: 'brake', s: 'brake', S: 'brake', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
    function driveKeys(e, down) {
      const k = KEYS[e.key];
      if (k) { held[k] = down; return true; }
      if (!down) return false;
      if (e.key === 'c' || e.key === 'C') { setView(st.mode === 'chase' ? 'cabin' : 'chase'); return true; }
      if (e.key === '1' || e.key === '2') { setView(e.key === '1' ? 'chase' : 'cabin'); return true; }
      return false;
    }
    window.addEventListener('keyup', (e) => { if (driving) driveKeys(e, false); });
    const letGo = () => { for (const k in held) held[k] = false; for (const k in pad) pad[k] = false; document.querySelectorAll('.pad.on').forEach((b) => b.classList.remove('on')); };
    window.addEventListener('blur', letGo);
    document.addEventListener('visibilitychange', letGo);

    // the pedals and steering buttons on a touch screen: held while a finger is on them
    [['padGas', 'gas'], ['padBrake', 'brake'], ['padLeft', 'left'], ['padRight', 'right']].forEach(([id, k]) => {
      const b = $(id);
      const on = (e) => { e.preventDefault(); pad[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ } };
      const off = () => { pad[k] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, off));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // Tilt to steer: the angle the device is turned in the plane of its screen, like a steering wheel, against
    // the way it was held during the countdown (or when Centre was tapped). Worked out from gravity in screen
    // terms, so it doesn't matter how far back it's tipped or which way round it is.
    const tilt = { on: false, steer: 0, zero: null, flip: false, seen: false };
    function onMotion(e) {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      tilt.seen = true;
      const o = typeof window.orientation === 'number' ? window.orientation : (screen.orientation ? screen.orientation.angle : 0);
      const r = o === 90 ? -g.y : o === -90 || o === 270 ? g.y : o === 180 ? -g.x : g.x; // gravity towards the screen's right
      const d = o === 90 ? -g.x : o === -90 || o === 270 ? g.x : o === 180 ? g.y : -g.y; // and its bottom
      const a = Math.atan2(r, d);
      if (tilt.zero == null || countdown > 0) tilt.zero = a;
      const rel = Math.atan2(Math.sin(a - tilt.zero), Math.cos(a - tilt.zero)) * (180 / Math.PI) * (tilt.flip ? -1 : 1);
      const DEAD = 2.5, FULL = 26; // degrees: a little play in the middle, full lock at 26
      tilt.steer = Math.abs(rel) < DEAD ? 0 : clamp((rel - Math.sign(rel) * DEAD) / (FULL - DEAD), -1, 1);
    }
    function startTilt(flip) {
      Object.assign(tilt, { on: true, steer: 0, zero: null, flip, seen: false });
      window.addEventListener('devicemotion', onMotion);
      setTimeout(() => { // no tilt readings at all: fall back to the buttons
        if (driving && tilt.on && !tilt.seen) { stopTilt(); driving.steerBy = 'buttons'; syncUI(); showBanner('Use the buttons to steer', 'Tilt steering is not available', 3); }
      }, 2500);
    }
    function stopTilt() { tilt.on = false; tilt.steer = 0; window.removeEventListener('devicemotion', onMotion); }
    window.addEventListener('orientationchange', () => { tilt.zero = null; }); // turned round: straight ahead is wherever it's held now
    NR.debug.drive = { tilt, held, pad, get driving() { return driving; }, get countdown() { return countdown; } }; // for tests

    // every frame: the countdown, then your inputs (steering keys and buttons ease in, tilt is already smooth)
    function driveFrame(dt) {
      const I = race.input;
      if (countdown > 0 && !paused) {
        countdown -= dt;
        if (countdown <= 0) { goT = 1.1; audio.unlock(); }
      }
      if (goT > 0) goT -= dt;
      const live = countdown <= 0 && !paused;
      const want = live ? ((held.right || pad.right) ? 1 : 0) - ((held.left || pad.left) ? 1 : 0) : 0;
      const rate = want === 0 || want * steerKeys < 0 ? 6 : 2.6;
      steerKeys += clamp(want - steerKeys, -rate * dt, rate * dt);
      I.steer = clamp(steerKeys + (live && tilt.on ? tilt.steer : 0), -1, 1);
      I.throttle = live && (held.gas || pad.gas) ? 1 : 0;
      I.brake = live && (held.brake || pad.brake) ? 1 : 0;
      renderDrive();
    }
    const fmtTenth = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
    function renderDrive() {
      const p = race.player;
      if (!p) return;
      const cd = $('countdown');
      cd.hidden = !(countdown > 0 || goT > 0);
      if (!cd.hidden) {
        setText($('cdNum'), countdown > 2.4 ? '3' : countdown > 1.2 ? '2' : countdown > 0 ? '1' : 'GO!');
        cd.classList.toggle('go', countdown <= 0);
        setText($('cdTip'), countdown <= 0 ? 'Go, go, go!' : tilt.on ? 'Hold it straight · tilt to steer' : coarse ? 'Hold Gas to go' : 'Press ↑ to go');
      }
      const T = race.TOTAL_LAPS, html = (el, v) => { if (el.innerHTML !== v) el.innerHTML = v; };
      html($('dPos'), `P${p.pos}<span>/${cars.length}</span>`);
      html($('dLap'), p.finished ? 'Done' : `${Math.min(T, p.lap)}<span>/${T}</span>`);
      setText($('dTime'), fmtTenth(p.lapIdx >= 0 && !p.finished ? race.time - p.lapStart : 0));
      setText($('dSpeed'), String(Math.round(p.v * 3.6)));
      setText($('dGear'), String(p.gear));
      $('dRpm').style.transform = `scaleX(${p.rpm.toFixed(3)})`;
    }
    function syncDriveUI() {
      const on = !!driving;
      $('driveTop').hidden = !on; $('driveSpeed').hidden = !on; $('driveHelp').hidden = !on || coarse;
      $('pads').hidden = !on || !coarse;
      $('pads').classList.toggle('tilt', on && driving.steerBy === 'tilt');
      $('dCentre').hidden = !(on && driving.steerBy === 'tilt');
      $('resExit').hidden = !on;
      setText($('restartBtn'), on ? 'Race again' : 'Restart race');
      if (on) setText($('dView'), st.mode === 'cabin' ? 'Chase' : 'Cockpit');
      if (!on) $('countdown').hidden = true;
    }

    // ---------- minimap ----------
    const mm = $('minimap'), mg = mm.getContext('2d');
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let j = 0; j < track.NS; j++) {
      minX = Math.min(minX, track.P[j * 3]); maxX = Math.max(maxX, track.P[j * 3]);
      minZ = Math.min(minZ, track.P[j * 3 + 2]); maxZ = Math.max(maxZ, track.P[j * 3 + 2]);
    }
    let mmScale = 1, mmOx = 0, mmOy = 0;
    function sizeMinimap() {
      const r = mm.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      mm.width = Math.max(1, r.width * dpr); mm.height = Math.max(1, r.height * dpr);
      const pad = 12 * dpr;
      mmScale = Math.min((mm.width - 2 * pad) / (maxX - minX), (mm.height - 2 * pad) / (maxZ - minZ));
      mmOx = (mm.width - (maxX - minX) * mmScale) / 2; mmOy = (mm.height - (maxZ - minZ) * mmScale) / 2;
    }
    const MX = (x) => mmOx + (x - minX) * mmScale, MY = (z) => mmOy + (z - minZ) * mmScale;
    function drawMinimap() {
      const w = mm.width, h = mm.height, dpr = w / Math.max(1, mm.clientWidth);
      mg.clearRect(0, 0, w, h);
      mg.lineJoin = 'round';
      mg.beginPath();
      for (let j = 0; j <= track.NS; j += 4) { const i = j % track.NS; const x = MX(track.P[i * 3]), y = MY(track.P[i * 3 + 2]); j ? mg.lineTo(x, y) : mg.moveTo(x, y); }
      mg.closePath();
      mg.strokeStyle = 'rgba(8,12,16,0.85)'; mg.lineWidth = 7 * dpr; mg.stroke();
      mg.strokeStyle = 'rgba(232,236,240,0.9)'; mg.lineWidth = 3 * dpr; mg.stroke();
      const sf = scenery.sfPos;
      mg.fillStyle = '#ffd23f'; mg.fillRect(MX(sf.x) - 1.5 * dpr, MY(sf.z) - 6 * dpr, 3 * dpr, 12 * dpr);
      if (st.mode === 'spectator') {
        const sp = scenery.spots[st.spot].cam;
        mg.fillStyle = '#ffd23f'; mg.beginPath(); mg.arc(MX(sp.x), MY(sp.z), 5 * dpr, 0, Math.PI * 2); mg.fill();
        mg.strokeStyle = '#0b0f14'; mg.lineWidth = 2 * dpr; mg.stroke();
      }
      cars.forEach((c) => {
        if (c.idx === st.focus || c.hidden) return;
        if (c.state === 'crash' || (c.out && c.outT < 30)) { // incident marker
          mg.strokeStyle = '#ffd23f'; mg.lineWidth = 2 * dpr; mg.beginPath(); mg.arc(MX(c.world.x), MY(c.world.z), 7 * dpr, 0, Math.PI * 2); mg.stroke();
        }
        mg.globalAlpha = c.out ? 0.45 : 1;
        mg.fillStyle = c.base; mg.beginPath(); mg.arc(MX(c.world.x), MY(c.world.z), 3.4 * dpr, 0, Math.PI * 2); mg.fill();
        mg.strokeStyle = 'rgba(0,0,0,0.7)'; mg.lineWidth = 1.2 * dpr; mg.stroke();
        mg.globalAlpha = 1;
      });
      const sc = race.sc;
      if (!sc.hidden) { // the safety car: an amber square
        mg.fillStyle = '#ffa000'; mg.fillRect(MX(sc.world.x) - 4 * dpr, MY(sc.world.z) - 4 * dpr, 8 * dpr, 8 * dpr);
        mg.strokeStyle = '#0b0f14'; mg.lineWidth = 1.5 * dpr; mg.strokeRect(MX(sc.world.x) - 4 * dpr, MY(sc.world.z) - 4 * dpr, 8 * dpr, 8 * dpr);
      }
      const f = cars[st.focus];
      mg.fillStyle = f.base; mg.beginPath(); mg.arc(MX(f.world.x), MY(f.world.z), 5.5 * dpr, 0, Math.PI * 2); mg.fill();
      mg.strokeStyle = '#ffffff'; mg.lineWidth = 2.2 * dpr; mg.stroke();
    }

    // ---------- telemetry ----------
    let lastSection = -1;
    function renderTelemetry() {
      let c = cars[st.focus];
      if (replay.active) c = replay.clip.car;
      else if (st.mode === 'spectator') c = cams.specTarget;
      $('telemetry').classList.toggle('idle', !c);
      if (!c) { $('tTitle').textContent = 'Waiting for the next car'; return; }
      $('tTitle').textContent = `#${c.num} ${c.brand}`;
      $('tSpeed').textContent = Math.round(c.v * 3.6);
      $('tGear').textContent = c.out ? '–' : c.gear;
      $('tRpm').style.transform = `scaleX(${(c.out ? 0 : c.rpm).toFixed(3)})`;
      $('tRpm').classList.toggle('hot', c.rpm > 0.93);
      $('tPos').textContent = `P${c.pos}`;
      $('tLap').textContent = c.out ? 'Retired' : c.finished ? 'Finished' : `Lap ${c.lap}/${race.TOTAL_LAPS}`;
      $('tSection').textContent = c.state === 'crash' ? `Incident · ${track.sections[c.section].name}` : c.pit && c.pit.phase === 'stop' ? 'Pit stop' : c.pit && c.pit.phase !== 'in' ? 'Pit lane' : track.sections[c.section].name;
      $('tCur').textContent = c.finished || c.out ? '–:––.–––' : fmtLap(race.time - c.lapStart);
      $('tLast').textContent = fmtLap(c.lastLap);
      $('tBest').textContent = fmtLap(c.bestLap);
      $('tAir').hidden = !c.air;
      if (st.mode !== 'spectator' && !replay.active && race.phase !== 'ceremony' && c.section !== lastSection) {
        if (lastSection !== -1) showBanner(track.sections[c.section].name, `#${c.num} ${c.brand}`);
        lastSection = c.section;
      }
    }

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      sizeMinimap();
    }
    // Observing the elements themselves catches every change of size, from an iPhone or iPad turning round
    // or Split View to the map coming back when a phone's weather drawer closes.
    if (window.ResizeObserver) { new ResizeObserver(resize).observe(host); new ResizeObserver(sizeMinimap).observe(mm); }
    else window.addEventListener('resize', resize);
    resize();

    // ---------- overlay layout ----------
    // The banner and yellow flags go in the free band between the panels at the top and the bottom row:
    // between the side columns when there's room, else under them. The panels change size with the screen,
    // the open drawers and the race phase, so the band is measured, not set per screen size.
    const px = {};
    const setPx = (name, v) => { v = Math.round(v); if (px[name] !== v) { px[name] = v; document.documentElement.style.setProperty(name, v + 'px'); } };
    const boxes = (sels) => sels.map((s) => document.querySelector(s)).filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect());
    function layoutHud() {
      if (document.body.classList.contains('hud-hidden')) return;
      const W = window.innerWidth, H = window.innerHeight;
      const low = boxes(['.focus', '.dock', '.tele', '#replayBar', '#driveSpeed', '#padLeft', '#padRight', '#padBrake', '#padGas']); // (the last: drive mode)
      const topOf = (rs) => Math.min(H, ...rs.map((r) => r.top));
      setPx('--hud-b', H - topOf(low));
      const SIDE = ['.left', '#results', '#resShow'];
      let side = boxes(SIDE);
      if (side.length) { // the left column (or the results) stops above whatever is under it
        const l = Math.min(...side.map((r) => r.left)), r = Math.max(...side.map((r) => r.right));
        setPx('--side-b', H - topOf(low.filter((b) => b.left < r && b.right > l)));
        side = boxes(SIDE); // which may have changed its height
      }
      const right = boxes(['.right'])[0];
      const inner = Math.max(0, ...side.map((r) => r.right)), outer = right ? right.left : W;
      let t, l, r;
      const between = outer - inner >= 236;
      if (between) { t = right ? right.top : 14; l = inner + 8; r = W - outer + 8; }
      else {
        t = Math.max(14, ...side.concat(right || []).map((b) => b.bottom)) + 8;
        l = side.length ? Math.min(...side.map((b) => b.left)) : 16; r = right ? W - right.right : 16;
      }
      // A short band (a small phone upright) keeps the banner and one whole flag clear of the bottom row by
      // letting them reach up over the map; the banner then covers the flags while it shows.
      const b = px['--hud-b'] + 8, bannerH = $('banner').offsetHeight, FLAG = 80;
      const tGut = right ? right.top : 14;
      setPx('--banner-t', Math.max(tGut, Math.min(t, H - b - bannerH)));
      let flagsT = H - b - t >= bannerH + 8 + FLAG ? t + bannerH + 8 : Math.max(tGut, Math.min(t, H - b - FLAG));
      if (!between && document.body.classList.contains('tower-open')) flagsT = H - b; // the open standings fill the band: no flags till they close
      setPx('--flags-t', flagsT);
      setPx('--band-b', b); setPx('--band-l', l); setPx('--band-r', r);
    }
    let layoutDue = false;
    const relayout = () => { if (!layoutDue) { layoutDue = true; requestAnimationFrame(() => { layoutDue = false; layoutHud(); }); } };
    if (window.ResizeObserver) { const ro = new ResizeObserver(relayout); ['.left', '.right', '.bottom', '#results', '#resShow', '#replayBar', '#driveSpeed', '#pads'].forEach((s) => ro.observe(document.querySelector(s))); }
    window.addEventListener('resize', relayout);
    syncUI();
    layoutHud();

    let last = performance.now(), clockT = 0, flagT = 0;
    function loop(now) {
      const raw = Math.max(0, Math.min(0.25, (now - last) / 1000)); // the first frame's timestamp can predate `last`
      const real = Math.min(0.05, raw);
      last = now;
      let focus, fxDt = 0, rate = speed;
      if (driving) driveFrame(raw);
      if (replay.active) {
        rate = replay.update(paused ? 0 : real, st.calm ? 0 : 1);
        fxDt = paused ? 0 : real * rate;
        planes.update(fxDt, planeTarget(), weather.nightK);
        focus = replay.focus;
        $('replayProg').style.transform = `scaleX(${replay.progress.toFixed(3)})`;
      } else {
        if (!paused && !(driving && countdown > 0)) {
          // equal sub-steps of about 1/60 s: a tiny leftover step skews the car physics (false take-offs on crests)
          const sim = real * speed, n = sim > 0 ? Math.max(1, Math.ceil(sim * 60 - 0.1)) : 0, h = sim / n;
          for (let k = 0; k < n; k++) { race.step(h); replay.record(); }
          race.render(real * speed);
          pits.update();
          fxDt = real * speed;
          celebrate(raw);
          if (ceremonyIn > 0 && (ceremonyIn -= raw) <= 0) beginCeremony();
        }
        planes.update(fxDt, planeTarget(), weather.nightK); // before the cameras: the plane camera rides with them
        focus = cams.update(real, now / 1000, paused ? 1 : speed);
      }
      const fall = paused ? 0 : real * (replay.active ? rate : 1);
      const seen = replay.active ? replay.clip.car : st.mode === 'spectator' ? cams.specTarget : cars[st.focus];
      weather.update(fxDt, fall, camera, { mode: replay.active ? 'replay' : st.mode, air: st.air, focusCar: seen });
      fx.update(fxDt, camera, renderer.domElement.height);
      const watching = replay.active ? replay.clip.car.idx : st.focus;
      audio.update(real, { camera, mode: replay.active ? 'replay' : st.mode, air: st.air, focus: watching, paused, speed: rate });
      sky.sky.position.copy(camera.position);
      sky.sun.position.copy(focus).addScaledVector(NR.world.SUN_DIR, 400);
      sky.sun.target.position.copy(focus);
      sky.sun.target.updateMatrixWorld();
      scenery.update(now / 1000, focus, cars, weather.nightK);
      renderer.render(scene, camera);
      renderTelemetry();
      renderTower(false);
      drawMinimap();
      if ((clockT += real) > 0.25) { clockT = 0; $('clock').textContent = fmtClock(race.time + (weather.night ? 21 * 3600 + 40 * 60 : 14 * 3600 + 5 * 60)); }
      if ((flagT += real) > 1) { flagT = 0; pruneFlags(); }
      requestAnimationFrame(loop);
    }
    $('loading').hidden = true;
    requestAnimationFrame(loop);
  }

  function boot(data) {
    if (!window.THREE) { document.getElementById('loadingText').textContent = 'The 3D engine could not load. Check your connection and reload the page.'; return; }
    start(data).catch((err) => {
      console.error(err);
      document.getElementById('loadingText').textContent = 'Something went wrong while building the circuit: ' + err.message;
    });
  }
  window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
})();
