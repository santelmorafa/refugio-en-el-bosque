// =============================================================================
// AudioSystem.js — Audio 100% procedural con Web Audio API (sin archivos).
// Reacciona a eventos del juego:
//   · TENSION_START/STOP → drone grave + latido que sube de intensidad.
//   · DISTANT_ROAR       → rugido lejano (aviso).
//   · ROAR               → rugido cercano (aparición / zarpazo).
//   · BIRDS_FLEE         → bandada de pájaros que huye.
//   · ANIMAL_ATTACK      → golpe seco.
// Requiere un gesto del usuario para arrancar (se llama resume() al empezar).
// Es un hook real y autónomo; si prefieres SFX/música reales, sustituye estos
// generadores por buffers cargados.
// =============================================================================

import { bus, EVENTS } from '../utils/EventBus.js';

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.tension = null;      // nodos del drone de tensión activo
    this._wire();
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Suspende TODO el audio (pausa / pestaña oculta). Reversible con resume().
  suspend() {
    if (this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch {} }
  }

  // Cierra el contexto por completo (al cerrar/descargar la pestaña).
  shutdown() {
    try { this.stopNight(); } catch {}
    try { this.stopDay(); } catch {}
    try { this.stopTension(); } catch {}
    try { this.stopRainWind(); } catch {}
    try { this.stopMusic(); } catch {}
    if (this.ctx) { try { this.ctx.close(); } catch {} }
    this.ctx = null; this.master = null;
    this.night = this.day = this.tension = this.storm = this.music = null;
  }

  // ¿El contexto está activo? (para no encolar sonidos mientras está suspendido)
  _running() { return this.ctx && this.ctx.state === 'running'; }

  _wire() {
    bus.on(EVENTS.TENSION_START, () => { this.startTension(); this.setMusicDanger(1); });
    bus.on(EVENTS.TENSION_STOP, () => { this.stopTension(); this.setMusicDanger(0); });
    bus.on(EVENTS.DISTANT_ROAR, (p) => this.roar(0.35, (p && p.distance) || 50));
    bus.on(EVENTS.ROAR, (p) => this.roar((p && p.soft) ? 0.5 : 0.9, 6));
    bus.on(EVENTS.BIRDS_FLEE, () => this.birds());
    bus.on(EVENTS.ANIMAL_ATTACK, () => this.thud());
    bus.on(EVENTS.DANGER_WARNING, () => this.setMusicDanger(0.7));
    // Sonidos de acción.
    bus.on(EVENTS.CHOP, (p) => this.chop(p && p.material));
    bus.on(EVENTS.TREE_FELLED, () => this.treeFall());
    bus.on(EVENTS.BUILD_PLACED, () => this.placeThud());
    bus.on(EVENTS.STEP, (p) => this.footstep(p && p.surface));
    // Ambiente de bosque según la fase del día.
    bus.on(EVENTS.PHASE_CHANGED, (p) => {
      if (p.isNight) { this.stopDay(); this.startNight(); }
      else { this.stopNight(); this.startDay(); }
    });
    // Clima.
    bus.on(EVENTS.WEATHER_CHANGED, (w) => { w.type === 'storm' ? this.startRainWind() : this.stopRainWind(); });
    bus.on(EVENTS.THUNDER, () => this.thunder());
  }

  // --- Bucle de ruido persistente (para grillos/viento/lluvia) ---
  _noiseLoop(filterType, freq, q, vol) {
    this.ensure();
    if (!this.ctx) return null;
    const dur = 2;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const filt = this.ctx.createBiquadFilter(); filt.type = filterType; filt.frequency.value = freq; filt.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(vol, this.ctx.currentTime + 2);
    src.connect(filt); filt.connect(gain); gain.connect(this.master);
    src.start();
    return { src, gain, filt };
  }

  _fadeStop(node, time = 1.2) {
    if (!node || !this.ctx) return;
    const t = this.ctx.currentTime;
    node.gain.gain.cancelScheduledValues(t);
    node.gain.gain.setValueAtTime(Math.max(0.0001, node.gain.gain.value), t);
    node.gain.gain.exponentialRampToValueAtTime(0.0001, t + time);
    node.src.stop(t + time + 0.1);
  }

  // Noche: grillos (ruido agudo) + búhos ocasionales.
  startNight() {
    this.ensure();
    if (!this.ctx || this.night) return;
    const crickets = this._noiseLoop('bandpass', 6200, 8, 0.06);
    this.night = { crickets, owlTimer: null };
    const owl = () => {
      if (!this.night) return;
      this._owlHoot();
      this.night.owlTimer = setTimeout(owl, 8000 + Math.random() * 14000);
    };
    this.night.owlTimer = setTimeout(owl, 4000 + Math.random() * 6000);
  }

  stopNight() {
    if (!this.night) return;
    clearTimeout(this.night.owlTimer);
    this._fadeStop(this.night.crickets, 2);
    this.night = null;
  }

  _owlHoot() {
    if (!this._running()) return;
    const t = this.ctx.currentTime;
    // "uh-huu": dos notas graves.
    [[0, 380], [0.35, 340]].forEach(([off, f]) => {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t + off);
      o.frequency.exponentialRampToValueAtTime(f * 0.85, t + off + 0.25);
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(0.09, t + off + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.3);
      o.connect(g); g.connect(this.master); o.start(t + off); o.stop(t + off + 0.35);
    });
  }

  // Tormenta: viento (grave) + lluvia (agudo).
  startRainWind() {
    this.ensure();
    if (!this.ctx || this.storm) return;
    const wind = this._noiseLoop('lowpass', 400, 0.7, 0.12);
    const rain = this._noiseLoop('highpass', 2400, 0.5, 0.10);
    this.storm = { wind, rain };
  }

  stopRainWind() {
    if (!this.storm) return;
    this._fadeStop(this.storm.wind, 1.5);
    this._fadeStop(this.storm.rain, 1.5);
    this.storm = null;
  }

  // Trueno: golpe grave + ruido rodante.
  thunder() {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._pulse(60, 0.6, 0.4);
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.6, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const noise = this.ctx.createBufferSource(); noise.buffer = buffer;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    noise.connect(lp); lp.connect(g); g.connect(this.master);
    noise.start(t); noise.stop(t + 1.6);
  }

  // Drone de tensión: dos osciladores graves detuneados + latido periódico.
  startTension() {
    this.ensure();
    if (!this.ctx || this.tension) return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 2.5);
    gain.connect(this.master);

    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sine';
    o1.frequency.value = 55; o2.frequency.value = 55 * 1.007;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 200;
    o1.connect(lp); o2.connect(lp); lp.connect(gain);
    o1.start(); o2.start();

    // Latido (heartbeat) que se acelera un poco.
    const beat = () => {
      if (!this.tension) return;
      this._pulse(90, 0.12, 0.16);
      this.tension.beatTimer = setTimeout(beat, this.tension.bpmMs);
      this.tension.bpmMs = Math.max(520, this.tension.bpmMs - 12);
    };
    this.tension = { gain, o1, o2, lp, bpmMs: 900, beatTimer: null };
    beat();
  }

  stopTension() {
    if (!this.ctx || !this.tension) return;
    const t = this.ctx.currentTime;
    const { gain, o1, o2, beatTimer } = this.tension;
    clearTimeout(beatTimer);
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o1.stop(t + 1.3); o2.stop(t + 1.3);
    this.tension = null;
  }

  // Golpe grave (latido / puñetazo de pared).
  _pulse(freq, dur, vol) {
    if (!this._running()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Rugido: ruido filtrado con envolvente de tono. vol 0..1; dist atenúa.
  roar(vol = 0.8, dist = 6) {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 1.1;
    const atten = Math.min(1, 8 / Math.max(6, dist));
    const v = vol * atten;

    // Fuente de ruido.
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const noise = this.ctx.createBufferSource(); noise.buffer = buffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(180, t);
    bp.frequency.exponentialRampToValueAtTime(90, t + dur);
    bp.Q.value = 1.2;

    // Tono grave que gruñe.
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    noise.connect(bp); bp.connect(g); osc.connect(g); g.connect(this.master);
    noise.start(t); noise.stop(t + dur);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // Pájaros que huyen: varios chirridos cortos.
  birds() {
    this.ensure();
    if (!this.ctx) return;
    for (let i = 0; i < 8; i++) {
      const t = this.ctx.currentTime + i * 0.06 + Math.random() * 0.05;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      const f = 2200 + Math.random() * 1500;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.4, t + 0.08);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.12);
    }
  }

  thud() { this._pulse(120, 0.18, 0.3); }

  // --- Sonidos de acción ---
  _burst(freq, q, vol, dur, type = 'bandpass') {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // Hachazo (madera) o picado (piedra).
  chop(material = 'wood') {
    if (material === 'stone') { this._burst(1400, 3, 0.4, 0.14); this._pulse(180, 0.08, 0.18); }
    else { this._burst(650, 2, 0.45, 0.16); this._pulse(110, 0.1, 0.22); }
  }

  // Árbol cayendo: crujido descendente + golpe seco al final.
  treeFall() {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 1.4;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + dur); f.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
    setTimeout(() => this._pulse(80, 0.35, 0.4), dur * 700); // golpe al tocar suelo
  }

  placeThud() { this._pulse(150, 0.12, 0.16); this._burst(500, 1, 0.12, 0.1, 'lowpass'); }

  // Paso según el terreno.
  footstep(surface = 'grass') {
    const map = {
      grass: { f: 500, q: 0.6, v: 0.14, t: 'lowpass' },
      dirt: { f: 320, q: 0.6, v: 0.16, t: 'lowpass' },
      wood: { f: 800, q: 1.4, v: 0.16, t: 'bandpass' },
      water: { f: 2200, q: 0.7, v: 0.14, t: 'highpass' },
    };
    const s = map[surface] || map.grass;
    this._burst(s.f, s.q, s.v, 0.09, s.t);
  }

  // --- Ambiente de día: pájaros ocasionales + brisa suave ---
  startDay() {
    this.ensure();
    if (!this.ctx || this.day) return;
    const breeze = this._noiseLoop('lowpass', 700, 0.5, 0.03);
    this.day = { breeze, chirpTimer: null };
    const chirp = () => {
      if (!this.day) return;
      this._chirp();
      this.day.chirpTimer = setTimeout(chirp, 3000 + Math.random() * 6000);
    };
    this.day.chirpTimer = setTimeout(chirp, 1500 + Math.random() * 3000);
  }
  stopDay() {
    if (!this.day) return;
    clearTimeout(this.day.chirpTimer);
    this._fadeStop(this.day.breeze, 2);
    this.day = null;
  }
  _chirp() {
    if (!this._running()) return;
    const t = this.ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const tt = t + i * 0.09;
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'triangle';
      const f = 2600 + Math.random() * 1400;
      o.frequency.setValueAtTime(f, tt);
      o.frequency.exponentialRampToValueAtTime(f * (1 + Math.random() * 0.3), tt + 0.06);
      g.gain.setValueAtTime(0.05, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.09);
      o.connect(g); g.connect(this.master); o.start(tt); o.stop(tt + 0.1);
    }
  }

  // --- Música dinámica: pad calmado que "se agacha" cuando hay peligro ---
  startMusic() {
    this.ensure();
    if (!this.ctx || this.music) return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 4);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    gain.connect(this.master);
    // Acorde suave (tónica + quinta + octava).
    const oscs = [110, 164.8, 220].map((freq) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      o.connect(lp); o.start();
      return o;
    });
    lp.connect(gain);
    this.music = { gain, lp, oscs, base: 0.09 };
  }
  stopMusic() {
    if (!this.ctx || !this.music) return;
    const t = this.ctx.currentTime;
    this.music.gain.gain.cancelScheduledValues(t);
    this.music.gain.gain.setValueAtTime(this.music.gain.gain.value, t);
    this.music.gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    this.music.oscs.forEach((o) => o.stop(t + 1.6));
    this.music = null;
  }
  // danger 0..1: la música calmada baja de volumen cuando sube la tensión.
  setMusicDanger(d) {
    if (!this.ctx || !this.music) return;
    const t = this.ctx.currentTime;
    const target = this.music.base * (1 - 0.75 * Math.max(0, Math.min(1, d)));
    this.music.gain.gain.cancelScheduledValues(t);
    this.music.gain.gain.setTargetAtTime(Math.max(0.0001, target), t, 0.5);
  }
}
