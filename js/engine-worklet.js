// engine-worklet.js — the engine synthesiser that runs on the audio thread (AudioWorklet).
// Every cylinder firing is a pressure pulse with its own small random strength and timing.
// The pulses run down each bank's exhaust pipe (a damped waveguide), meet in the collector,
// then pass a tailpipe and silencer; intake roar, valvetrain tick, turbo, afterfire pops
// and gearbox whine are layered on top.
// The file loads two ways: as an ordinary page script it hands its source to audio.js, which
// starts the worklet from a Blob URL (the only way that works from file://); where Blob URLs
// are blocked, audio.js loads this same file directly as the worklet module.
(function () {
  'use strict';

  function engineWorklet() {
    const TAU = Math.PI * 2;
    const sat = (x) => (x > 3 ? 1 : x < -3 ? -1 : (x * (27 + x * x)) / (27 + 9 * x * x)); // smooth, about tanh

    // two-pole band-pass with 0 dB peak
    class Resonator {
      constructor(f, q, sr) {
        const w = (TAU * Math.min(f, sr * 0.45)) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
        this.b0 = al / a0; this.a1 = (-2 * Math.cos(w)) / a0; this.a2 = (1 - al) / a0;
        this.x1 = this.x2 = this.y1 = this.y2 = 0;
      }
      run(x) {
        const y = this.b0 * (x - this.x2) - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
        return y;
      }
    }

    // A pipe as a round-trip delay loop: the open end reflects inverted, and a low-pass in
    // the loop stands in for wall losses, so its resonances stay mild rather than whistling.
    class Pipe {
      constructor(len, sr, refl, damp) {
        this.n = 4096; this.buf = new Float32Array(this.n); this.w = 0;
        this.d = Math.min(this.n - 2, Math.max(2, ((2 * len) / 540) * sr)); // 540 m/s: hot exhaust gas
        this.g = refl; this.damp = damp; this.lp = 0;
      }
      run(x) {
        let r = this.w - this.d;
        if (r < 0) r += this.n;
        const i = r | 0, f = r - i, a = this.buf[i], b = this.buf[i + 1 === this.n ? 0 : i + 1];
        this.lp += this.damp * (a + (b - a) * f - this.lp);
        const y = x + this.g * this.lp;
        this.buf[this.w] = y;
        if (++this.w === this.n) this.w = 0;
        return y;
      }
    }

    class EngineProcessor extends AudioWorkletProcessor {
      static get parameterDescriptors() {
        const k = (name, defaultValue, minValue, maxValue) => ({ name, defaultValue, minValue, maxValue, automationRate: 'k-rate' });
        return [k('rpm', 3000, 0, 14000), k('load', 0.5, 0, 1), k('dop', 1, 0.25, 4), k('rear', 0.5, 0, 1),
          k('inside', 0, 0, 1), k('speed', 0, 0, 200), k('on', 1, 0, 1)];
      }

      constructor(opt) {
        super();
        const c = (this.c = opt.processorOptions), sr = (this.sr = sampleRate);
        let s = c.seed >>> 0 || 1;
        const rnd = (this.rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; });
        // firing events around the 720° cycle, each cylinder slightly off in strength and timing
        const n = c.banks.length, off = c.banks.map(() => (rnd() - 0.5) * 3);
        this.ev = c.banks.map((bank, i) => ({ bank, trim: 1 + (rnd() - 0.5) * 0.1, gap: 720 / n + off[(i + 1) % n] - off[i] }));
        this.k = 0; this.toNext = (rnd() * 720) / n;
        this.crank = 0; this.lastFire = [-180, -180];
        this.kick = [0, 0]; this.s1 = [0, 0]; this.s2 = [0, 0]; this.s3 = [0, 0];
        this.pipes = c.pipe.map((len) => new Pipe(len, sr, -0.38, 0.45));
        this.tail = new Pipe(c.tail, sr, -0.3, 0.5);
        this.chamber = new Resonator(c.chamber, 1.2, sr);
        this.intakeRes = new Resonator(c.intake, 2.2, sr);
        this.flutRes = new Resonator(1100, 3, sr);
        this.muff = 0; this.bright = 0; this.thrum = 0; this.dcx = 0; this.dcy = 0;
        this.inEnv = 0; this.tick = 0; this.tickHp = 0; this.tickX = 0; this.hissX = 0;
        this.L = 0.5; this.boost = 0; this.hi = 0; this.cut = 0; this.blip = 0;
        this.pops = []; this.popE = 0; this.popTh = 0; this.popPh = 0; this.popF = 80; this.popK = 0.99;
        this.thK = Math.exp(-1 / (0.02 * sr));
        this.flut = 0; this.flutN = Math.round(0.6 * sr); this.flutAmp = 0; this.flutE = 0;
        this.phW = 0; this.phT = 0; this.alive = true;
        this.port.onmessage = (e) => this.message(e.data);
      }

      message(m) {
        const c = this.c, rnd = this.rnd;
        if (m === 'stop') this.alive = false;
        else if (m === 'shift') { // upshift: ignition cut, sometimes a bang from the unburnt fuel
          this.cut = 0.045 * this.sr;
          if (rnd() < 0.35 * c.pops) this.pop(0.03 + rnd() * 0.02, 0.6 + rnd() * 0.5);
        } else if (m === 'blip') { // downshift: throttle blip, then a burst of afterfire
          this.blip = 0.07 * this.sr;
          const n = Math.floor(rnd() * 3 * c.pops + 0.4);
          for (let i = 0; i < n; i++) this.pop(0.09 + i * (0.035 + rnd() * 0.05), 0.5 + rnd() * 0.6);
        }
      }

      pop(delay, amp) { if (this.pops.length < 8) this.pops.push({ at: Math.round(delay * this.sr), amp }); }

      fire(L, rf, on) {
        const c = this.c, rnd = this.rnd, e = this.ev[this.k];
        this.k = (this.k + 1) % this.ev.length;
        const g = (rnd() + rnd() + rnd() - 1.5) * 2; // roughly unit gaussian
        this.toNext += e.gap + g * 0.6 * (1 + 2 * (1 - L)); // combustion timing scatter, degrees
        const sig = 0.05 + 0.1 * (1 - L) + 0.25 * Math.max(0, 0.3 - rf); // strength scatter: more off throttle and at idle
        // a pulse right behind another in the same bank is weaker: on a cross-plane V8 the banks fire
        // unevenly, so this varies pulse to pulse and gives the burble; even layouts stay even
        const since = this.crank - this.lastFire[e.bank];
        this.lastFire[e.bank] = this.crank;
        const scav = 0.7 + 0.3 * Math.min(1, Math.max(0, (since - 90) / 180));
        let A = (0.2 + 0.8 * Math.pow(L, 1.3)) * e.trim * scav * (1 + sig * g);
        if (this.cut > 0) A = 0.07 + 0.05 * rnd(); // ignition cut: pumping only
        else if (rf > 0.997 && L > 0.5 && rnd() < 0.2) A *= 0.55; // on the limiter: some firings cut short
        this.kick[e.bank] += A * on;
        this.inEnv += on * (0.6 + 0.4 * rnd());
        this.tick += 0.6 + 0.4 * rnd();
        if (on > 0.5 && L < 0.15 && rf > 0.45 && this.cut <= 0 && rnd() < c.pops * 0.012 * rf) this.pop(rnd() * 0.025, 0.3 + rnd() * 0.7);
      }

      process(inputs, outputs, params) {
        if (!this.alive) return false;
        const out = outputs[0][0];
        if (!out) return true;
        const c = this.c, sr = this.sr, rnd = this.rnd, N = out.length, dt = N / sr;
        const rpm = params.rpm[0], dop = params.dop[0], rear = params.rear[0], inside = params.inside[0];
        const on = params.on[0], speed = params.speed[0];

        let Lt = params.load[0];
        if (this.blip > 0) { Lt = Math.max(Lt, 0.8); this.blip -= N; }
        if (this.cut > 0) this.cut -= N;
        this.L += (Lt - this.L) * Math.min(1, dt * 30);
        const L = this.L, rf = rpm / c.red;
        const dTh = (rpm * 6 * dop) / sr; // crank degrees per sample
        const tau = Math.max(1.2, (c.pulse * (1.35 - 0.45 * L) * (1 + 0.5 * c.turbo)) / Math.max(1e-3, dTh)); // blowdown pulse, samples
        const k1 = Math.exp(-1 / tau), k3 = Math.exp(-1 / (tau * 5));
        const kIn = Math.exp(-dTh / 80), kTick = Math.exp(-1 / (0.00025 * sr));
        const drive = 0.7 + 0.22 * c.grit * L;
        const aMuff = 1 - Math.exp((-TAU * c.muff) / sr);
        const fB = (1800 + 6500 * L) * (0.55 + 0.45 * rear) * (1 - 0.55 * inside); // brighter on load and from behind
        const aB = 1 - Math.exp((-TAU * Math.min(fB, sr * 0.45)) / sr), aThr = 1 - Math.exp((-TAU * 180) / sr);

        if (c.turbo) { // spool, and compressor flutter when the driver lifts on boost
          const bt = L > 0.45 ? L * Math.min(1, rf * 1.1) : 0;
          this.boost += (bt - this.boost) * Math.min(1, dt * (bt > this.boost ? 2.2 : 6));
          this.hi = Math.max(L, this.hi - dt * 1.5);
          if (L < 0.2 && this.hi > 0.55 && this.boost > 0.35 && this.flut <= 0) {
            this.flut = this.flutN; this.flutAmp = c.turbo * this.boost; this.flutE = 1; this.hi = 0;
          }
        }
        const exG = (0.55 + 0.45 * rear) * (1 - 0.4 * inside);
        const inG = (0.1 + 0.45 * inside) * (0.35 + 0.65 * L);
        const tkG = (0.025 + 0.06 * inside) * Math.min(1, rf * 1.3);
        const whG = inside * (0.006 + 0.022 * Math.min(1, speed / 70)) * (0.5 + 0.5 * L);
        const whF = (TAU * Math.max(40, speed * c.whine) * dop) / sr;
        const tG = c.turbo * 0.01 * this.boost * this.boost * (1 + 0.4 * inside);
        const tF = (TAU * (2300 + 6200 * this.boost) * dop) / sr, hissG = c.turbo * 0.02 * this.boost;
        const flK = Math.exp(-1 / (0.2 * sr)), gain = c.gain;

        for (let i = 0; i < N; i++) {
          this.toNext -= dTh;
          this.crank += dTh;
          while (this.toNext <= 0) this.fire(L, rf, on);

          // each bank: sharp blowdown pulse plus a slower body, into that bank's pipe
          let col = 0;
          for (let b = 0; b < 2; b++) {
            const x = this.kick[b];
            this.kick[b] = 0;
            this.s1[b] = k1 * this.s1[b] + (1 - k1) * x * 2.718 * tau;
            this.s2[b] = k1 * this.s2[b] + (1 - k1) * this.s1[b];
            this.s3[b] = k3 * this.s3[b] + (1 - k3) * x * tau * 5;
            col += this.pipes[b].run(this.s2[b] + 0.3 * this.s3[b]);
          }
          col = sat(col * drive * 0.5) * 2; // big pulses steepen: rasp under load

          // afterfire pops go off in the tailpipe
          if (this.pops.length) {
            for (let j = this.pops.length - 1; j >= 0; j--) {
              if (--this.pops[j].at > 0) continue;
              const p = this.pops.splice(j, 1)[0];
              this.popE = p.amp; this.popTh = p.amp; this.popPh = 0;
              this.popF = 60 + rnd() * 60; this.popK = Math.exp(-1 / ((0.003 + rnd() * 0.006) * sr));
            }
          }
          let popS = 0;
          if (this.popTh > 1e-4) {
            popS = (rnd() * 2 - 1) * this.popE * 2.2 + Math.sin(this.popPh) * this.popTh * 1.2;
            this.popE *= this.popK; this.popTh *= this.thK; this.popPh += (TAU * this.popF) / sr;
          }
          const tp = this.tail.run(col + popS);
          this.muff += aMuff * (tp - this.muff);
          this.bright += aB * (this.muff + 0.5 * this.chamber.run(tp) - this.bright);
          this.thrum += aThr * (col - this.thrum);

          // intake roar: noise shaped by each intake stroke and the airbox resonance
          this.inEnv *= kIn;
          const nz = rnd() * 2 - 1;
          const intake = this.intakeRes.run(nz * this.inEnv) * 2.5 + this.inEnv * 0.2;
          // valvetrain: tiny high-passed ticks
          this.tick *= kTick;
          const tx = (rnd() * 2 - 1) * this.tick;
          this.tickHp = 0.85 * (this.tickHp + tx - this.tickX); this.tickX = tx;

          let y = (this.bright * exG + this.thrum * 0.35 * inside + intake * inG) * c.cal + this.tickHp * tkG;
          if (whG > 0) { this.phW += whF; if (this.phW > TAU) this.phW -= TAU; y += (Math.sin(this.phW) + 0.3 * Math.sin(2 * this.phW)) * whG; }
          if (tG > 1e-5) {
            this.phT += tF; if (this.phT > TAU) this.phT -= TAU;
            y += Math.sin(this.phT) * tG + (nz - this.hissX) * hissG * 0.25;
            this.hissX = nz;
          }
          if (this.flut > 0) {
            const ft = (this.flutN - this.flut--) / sr, ch = 0.5 + 0.5 * Math.cos(TAU * 21 * ft);
            this.flutE *= flK;
            y += this.flutRes.run(nz) * this.flutE * (0.15 + ch * ch * ch * ch) * this.flutAmp * 3;
          }
          const dc = y - this.dcx + 0.9985 * this.dcy; // DC blocker
          this.dcx = y; this.dcy = dc;
          out[i] = sat(dc * gain);
        }
        return true;
      }
    }
    registerProcessor('nr-engine', EngineProcessor);
  }

  if (typeof registerProcessor === 'function') engineWorklet();
  else if (typeof window !== 'undefined') (window.NR = window.NR || {}).engineWorklet = engineWorklet;
})();
