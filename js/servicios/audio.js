/**
 * Controlador de Efectos de Sonido Sintéticos (Web Audio API)
 */

// Reproduce sonidos sintéticos y gritos de Pokémon
class SoundController {
  constructor() {
    this.ctx = null;
    this.cryVolume = 0.20;
  }

  // Crea el contexto de audio si no existe
  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  // Sonido al voltear una carta
  playFlip() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (state.theme === "retro") {
        osc.type = "square";
        osc.frequency.setValueAtTime(260, this.ctx.currentTime);
        osc.frequency.setValueAtTime(130, this.ctx.currentTime + 0.035);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.075);
      } else {
        osc.type = "sine";
        osc.frequency.setValueAtTime(320, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(140, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {}
  }

  // Sonido al elegir el Pokémon secreto
  playSelectSecret() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (state.theme === "retro") {
        osc.type = "square";
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.setValueAtTime(440, now + 0.045);
        osc.frequency.setValueAtTime(660, now + 0.09);
        osc.frequency.setValueAtTime(880, now + 0.14);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      } else {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  // Sonido al cambiar de tema
  playThemeSwitch() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(780, now + 0.06);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(now + 0.12);
    } catch (e) {}
  }

  // Sonido al comenzar tu turno
  playTurnStart() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (state.theme === "retro") {
        osc.type = "square";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      } else {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.25);
    } catch (e) {}
  }

  // Sonido al pasar el turno
  playTurnPass() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = state.theme === "retro" ? "square" : "sine";
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.09);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.09);
    } catch (e) {}
  }

  // Sonido de error o adivinanza fallida
  playFail() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = state.theme === "retro" ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(160, now + 0.1);
      osc.frequency.setValueAtTime(110, now + 0.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.35);
    } catch (e) {}
  }

  // Fanfarria triunfal de victoria estilo Pokémon / arcade
  playVictory() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      const isRetro = state.theme === "retro";
      const wave = isRetro ? "square" : "triangle";
      const baseVol = isRetro ? 0.1 : 0.14;

      // Melodía triunfal: C5 -> E5 -> G5 -> C6 -> G5 -> C6 (sostenido)
      const melody = [
        { freq: 523.25, start: 0.0, dur: 0.11 },
        { freq: 659.25, start: 0.11, dur: 0.11 },
        { freq: 783.99, start: 0.22, dur: 0.11 },
        { freq: 1046.5, start: 0.34, dur: 0.22 },
        { freq: 783.99, start: 0.58, dur: 0.11 },
        { freq: 1046.5, start: 0.71, dur: 0.55 }
      ];

      melody.forEach(n => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t0 = now + n.start;
        osc.type = wave;
        osc.frequency.setValueAtTime(n.freq, t0);
        gain.gain.setValueAtTime(baseVol, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + n.dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + n.dur);
      });

      // Acorde armónico final (E5 + G5) acompañando la nota alta C6
      [659.25, 783.99].forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t0 = now + 0.71;
        osc.type = isRetro ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(baseVol * 0.65, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.55);
      });
    } catch (e) {}
  }

  // Melodía descendente y apagada de derrota
  playDefeat() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      const isRetro = state.theme === "retro";
      const wave = isRetro ? "triangle" : "sine";
      const baseVol = isRetro ? 0.095 : 0.11;

      // Cadencia melancólica descendente: E4 -> Eb4 -> D4 -> C4 (con caída suave)
      const notes = [
        { freq: 329.63, start: 0.0, dur: 0.22 },
        { freq: 311.13, start: 0.23, dur: 0.22 },
        { freq: 293.66, start: 0.46, dur: 0.24 },
        { freq: 261.63, start: 0.72, dur: 0.6, slideTo: 246.94 }
      ];

      notes.forEach(n => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t0 = now + n.start;
        osc.type = wave;
        osc.frequency.setValueAtTime(n.freq, t0);
        if (n.slideTo) {
          osc.frequency.exponentialRampToValueAtTime(n.slideTo, t0 + n.dur);
        }
        gain.gain.setValueAtTime(baseVol, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + n.dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + n.dur);
      });
    } catch (e) {}
  }

  // Efecto de sonido brillante y mágico para Pokémon Shiny
  playShinySparkle() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      // Arpegio brillante y cristalino (C6 -> E6 -> G6 -> C7 -> E7)
      const notes = [1046.5, 1318.5, 1567.98, 2093.0, 2637.0];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = now + i * 0.055;

        osc.type = state.theme === "retro" ? "square" : "sine";
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.048, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        osc.stop(start + 0.18);
      });
    } catch (e) {}
  }

  // Reproduce el grito del Pokémon; si falla el legacy usa el actual
  playPokemonCry(id, cryUrl) {
    if (!state.soundEnabled || !id) return;
    try {
      let url = cryUrl;
      if (!url) {
        if (state.theme === "retro" && id <= 649) {
          url = `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/legacy/${id}.ogg`;
        } else {
          url = `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;
        }
      }
      const audio = new Audio(url);
      audio.volume = this.cryVolume;
      audio.play().catch(() => {
        if (url && url.includes("/legacy/")) {
          const fallback = new Audio(`https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`);
          fallback.volume = this.cryVolume;
          fallback.play().catch(() => {});
        }
      });
    } catch (e) {}
  }
}

// Instancia global de sonidos
const sounds = new SoundController();
