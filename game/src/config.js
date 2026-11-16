// Every tuning number and colour of Umbra Drift, in one place. The playfield is a fixed
// 1280x720 logical space; the renderer scales it to the window, so no rule here depends on the
// size of the screen.

export const FIELD = { width: 1280, height: 720, wall: 44 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  speed: 330,
  accel: 2100,
  drag: 9,
  lives: 3,
  hurtSeconds: 1.2,
  hurtPush: 430,
};

/**
 * The glow is the whole game: it lights the cave, it fills the flare, and it tells the hunters
 * where you are. Everything the player decides trades one of those against another.
 */
export const GLOW = {
  start: 0.75,
  cap: 1,
  decay: 0.05,
  moteGain: 0.22,
  dimFloor: 0.08,
  dimRate: 1.5,
  refillRate: 0.55,
  beamDrain: 0.22,
  flareCost: 0.34,
  flareRadius: 232,
  flareStun: 1.6,
  flareSeconds: 0.9,
  flareCooldown: 0.8,
  sightMin: 0.34,
  sightNear: 240,
  sightGlow: 430,
  sightBeam: 210,
};

export const MOTE = { radius: 10, value: 100 };

export const PORTAL = { radius: 36, value: 200 };

/** One wave per entry: what it scatters and what hunts you in it. */
export const WAVES = [
  { motes: 5, stalkers: 1, sentinels: 0, wisps: 0, name: 'First Dark' },
  { motes: 6, stalkers: 2, sentinels: 1, wisps: 0, name: 'The Watch' },
  { motes: 6, stalkers: 2, sentinels: 1, wisps: 2, name: 'Cold Light' },
  { motes: 7, stalkers: 3, sentinels: 2, wisps: 2, name: 'Deep Water' },
  { motes: 8, stalkers: 3, sentinels: 2, wisps: 3, name: 'No Shadow' },
  { motes: 9, stalkers: 4, sentinels: 3, wisps: 3, name: 'Last Ember' },
];

export const STALKER = { radius: 16, wander: 78, chase: 150, chasePerWave: 9, chaseGlow: 130 };
export const SENTINEL = { radius: 13, orbit: 96, orbitPerWave: 8, turn: 1.5 };
export const WISP = { radius: 11, drift: 96, wobble: 2.4 };

export const PALETTE = {
  void: '#05080d',
  rock: '#0b1620',
  dust: '#16242f',
  player: '#8ef2ff',
  playerCore: '#f2ffff',
  mote: '#ffd479',
  portal: '#a8ff9e',
  stalker: '#ff5f6d',
  sentinel: '#c06bff',
  wisp: '#5b8cff',
  panel: '#101c26',
  text: '#eaf6ff',
  muted: '#7e93a3',
  glowWarm: '#ffb347',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'umbra-drift.best';
