// Umbra Drift's own sounds, synthesised at run time with the Web Audio API: no audio file is
// loaded, so the game stays a handful of text files. A voice is a short oscillator with a gain
// envelope; the cave drone is two detuned oscillators under a slow filter. Nothing here runs
// until the player's first click or key press, which is what browsers require.

const SCALE = [0, 3, 5, 7, 10, 12, 15, 19];

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

export function createAudio() {
  let context = null;
  let master = null;
  let droneGain = null;
  let muted = false;

  function ensure() {
    if (context !== null) return context;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      return null;
    }
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);
    return context;
  }

  function resume() {
    const ctx = ensure();
    if (ctx !== null && ctx.state === 'suspended') ctx.resume();
  }

  /** One shaped note: an oscillator through a gain envelope, optionally glided. */
  function voice(type, from, to, seconds, volume, delay) {
    const ctx = ensure();
    if (ctx === null) return;
    const start = ctx.currentTime + (delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.02, seconds * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  const api = {
    resume,
    /** A soft, rising two-note chime: a mote taken. */
    mote(step) {
      const note = 72 + SCALE[step % SCALE.length];
      voice('sine', midi(note), midi(note) * 1.5, 0.16, 0.12);
      voice('triangle', midi(note + 12), midi(note + 12), 0.1, 0.04, 0.03);
    },
    /** A wide consonant swell: the flare spent, the hunters stopped. */
    flare() {
      voice('sawtooth', 320, 90, 0.35, 0.1);
      voice('sine', 640, 180, 0.45, 0.1);
    },
    /** A low, falling thud with a noisy edge: a life lost. */
    hurt() {
      voice('square', 190, 60, 0.32, 0.14);
      voice('sawtooth', 95, 40, 0.4, 0.09, 0.02);
    },
    /** A bright four-note climb: the portal opened. */
    portal() {
      [72, 76, 79, 84].forEach((note, index) => voice('triangle', midi(note), midi(note), 0.22, 0.11, index * 0.07));
    },
    /** Ascending run: a wave survived. */
    wave() {
      [60, 64, 67, 72].forEach((note, index) => voice('sine', midi(note), midi(note), 0.3, 0.1, index * 0.09));
    },
    /** A slow descending minor third pair: the drift ended. */
    over(win) {
      const notes = win ? [67, 71, 74, 79] : [64, 60, 57, 52];
      notes.forEach((note, index) => voice('triangle', midi(note), midi(note), 0.5, 0.12, index * 0.16));
    },
    /** Starts the cave drone; safe to call again, it only ever runs one. */
    drone() {
      const ctx = ensure();
      if (ctx === null || droneGain !== null) return;
      droneGain = ctx.createGain();
      droneGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      droneGain.connect(filter).connect(master);
      const low = ctx.createOscillator();
      low.type = 'sawtooth';
      low.frequency.value = midi(33);
      const high = ctx.createOscillator();
      high.type = 'sine';
      high.frequency.value = midi(45) + 0.7;
      low.connect(droneGain);
      high.connect(droneGain);
      low.start();
      high.start();
      droneGain.gain.setTargetAtTime(0.07, ctx.currentTime, 2.5);
    },
    /** The drone follows the cave's light: brighter when the player burns, quiet when it hides. */
    setTension(level) {
      const ctx = context;
      if (ctx === null || droneGain === null) return;
      droneGain.gain.setTargetAtTime(0.04 + level * 0.09, ctx.currentTime, 0.4);
    },
    toggleMute() {
      muted = !muted;
      if (master !== null) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };

  return api;
}
