// Umbra Drift's rules, with no drawing and no browser in them. You are a drifting ember in a dark
// cave: your light shows the way, and it is the only thing the hunters can see. Gather every mote
// to open the way onward; spend your light on a flare to stop what closes in; hide in the dark to
// be forgotten. step() advances one fixed step and returns what happened as bit flags, so the
// caller can play a sound or change a screen without the rules knowing about either. Every array
// is allocated once, when the cave is built.
import { FIELD, GLOW, MOTE, PLAYER, PORTAL, SENTINEL, STALKER, WAVES, WISP } from './config.js';

export const HUNTER_STALKER = 0;
export const HUNTER_SENTINEL = 1;
export const HUNTER_WISP = 2;

export const HUNTER_RADIUS = [STALKER.radius, SENTINEL.radius, WISP.radius];

export const EVENT_MOTE = 1;
export const EVENT_HURT = 2;
export const EVENT_FLARE = 4;
export const EVENT_PORTAL = 8;
export const EVENT_WAVE = 16;
export const EVENT_OVER = 32;
export const EVENT_WIN = 64;
/** A hunter pushed away by the flare scores too, but plays the flare sound, not the mote chime. */
export const EVENT_STUN = 128;

const MAX_MOTES = 16;
const MAX_HUNTERS = 12;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    glow: GLOW.start,
    hurt: 0,
    flare: 0,
    cooldown: 0,
  };

  const motes = [];
  for (let index = 0; index < MAX_MOTES; index += 1) motes.push({ active: false, x: 0, y: 0, phase: 0 });

  const hunters = [];
  for (let index = 0; index < MAX_HUNTERS; index += 1) {
    hunters.push({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, stun: 0, phase: 0, homeX: 0, homeY: 0 });
  }

  const portal = { active: false, x: 0, y: 0, phase: 0 };

  const state = {
    player,
    motes,
    hunters,
    portal,
    score: 0,
    lives: PLAYER.lives,
    wave: 0,
    waveName: WAVES[0].name,
    waveCount: WAVES.length,
    motesLeft: 0,
    motesTaken: 0,
    motesTotal: 0,
    combo: 0,
    comboTimer: 0,
    elapsed: 0,
    flareFlash: 0,
    hurtFlash: 0,
    stunned: 0,
  };

  function randomPoint(padding) {
    return {
      x: padding + random() * (FIELD.width - padding * 2),
      y: padding + random() * (FIELD.height - padding * 2),
    };
  }

  /** Scatters `count` motes, away from the player and from each other. Returns how many landed. */
  function scatterMotes(count) {
    let made = 0;
    for (let guard = 0; made < count && guard < 800; guard += 1) {
      const spot = randomPoint(FIELD.wall + 70);
      if (Math.hypot(spot.x - player.x, spot.y - player.y) < 200) continue;
      let clear = true;
      for (const mote of motes) {
        if (mote.active && Math.hypot(mote.x - spot.x, mote.y - spot.y) < 135) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      const slot = motes.find((mote) => !mote.active);
      if (slot === undefined) break;
      slot.active = true;
      slot.x = spot.x;
      slot.y = spot.y;
      slot.phase = random() * Math.PI * 2;
      made += 1;
    }
    return made;
  }

  /** Brings in `count` hunters from the far side of the cave: the dark closes in. */
  function releaseHunters(kind, count) {
    for (let made = 0; made < count; made += 1) {
      const slot = hunters.find((hunter) => !hunter.active);
      if (slot === undefined) return;
      let best = randomPoint(FIELD.wall + 50);
      let bestDistance = -1;
      for (let tries = 0; tries < 24; tries += 1) {
        const spot = randomPoint(FIELD.wall + 50);
        const distance = Math.hypot(spot.x - player.x, spot.y - player.y);
        if (distance > bestDistance) {
          bestDistance = distance;
          best = spot;
        }
      }
      slot.active = true;
      slot.kind = kind;
      slot.x = best.x;
      slot.y = best.y;
      slot.vx = 0;
      slot.vy = 0;
      slot.stun = 0;
      slot.phase = random() * Math.PI * 2;
      slot.homeX = best.x;
      slot.homeY = best.y;
    }
  }

  function startWave(index) {
    state.wave = index;
    state.waveName = WAVES[index].name;
    for (const mote of motes) mote.active = false;
    for (const hunter of hunters) hunter.active = false;
    portal.active = false;
    const spec = WAVES[index];
    const landed = scatterMotes(spec.motes);
    releaseHunters(HUNTER_STALKER, spec.stalkers);
    releaseHunters(HUNTER_SENTINEL, spec.sentinels);
    releaseHunters(HUNTER_WISP, spec.wisps);
    state.motesLeft = landed;
    state.motesTaken = 0;
    state.motesTotal = landed;
    player.glow = clamp(player.glow + GLOW.refillRate, 0, GLOW.cap);
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.glow = GLOW.start;
    player.hurt = 0;
    player.flare = 0;
    player.cooldown = 0;
    state.score = 0;
    state.lives = PLAYER.lives;
    state.combo = 0;
    state.comboTimer = 0;
    state.elapsed = 0;
    state.flareFlash = 0;
    state.hurtFlash = 0;
    state.stunned = 0;
    startWave(0);
  }

  /** How far the player's own light reaches: the ember's glow, widened while a flare burns. */
  function sightRadius() {
    const base = GLOW.sightNear + player.glow * GLOW.sightGlow;
    if (player.flare <= 0) return base;
    const swell = GLOW.flareRadius * (player.flare / GLOW.flareSeconds);
    return Math.max(base, swell);
  }

  function movePlayer(dt, axisX, axisY, dimming) {
    const speed = PLAYER.speed * (dimming ? 0.82 : 1);
    const length = Math.hypot(axisX, axisY) || 1;
    const targetX = (axisX / length) * speed;
    const targetY = (axisY / length) * speed;
    // Accelerate toward the wanted velocity and bleed the rest, so the ember glides rather than snaps.
    const blend = Math.min(1, PLAYER.accel * dt / PLAYER.speed);
    player.vx += (targetX - player.vx) * blend;
    player.vy += (targetY - player.vy) * blend;
    if (axisX === 0) player.vx -= player.vx * Math.min(1, PLAYER.drag * dt);
    if (axisY === 0) player.vy -= player.vy * Math.min(1, PLAYER.drag * dt);
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    const margin = FIELD.wall + PLAYER.radius;
    if (player.x < margin) {
      player.x = margin;
      player.vx = Math.abs(player.vx) * 0.2;
    } else if (player.x > FIELD.width - margin) {
      player.x = FIELD.width - margin;
      player.vx = -Math.abs(player.vx) * 0.2;
    }
    if (player.y < margin) {
      player.y = margin;
      player.vy = Math.abs(player.vy) * 0.2;
    } else if (player.y > FIELD.height - margin) {
      player.y = FIELD.height - margin;
      player.vy = -Math.abs(player.vy) * 0.2;
    }
  }

  /** Stunned hunters drift on their momentum and lose it; each kind otherwise moves its own way. */
  function moveHunter(hunter, dt) {
    if (hunter.stun > 0) {
      hunter.stun = Math.max(0, hunter.stun - dt);
      hunter.x += hunter.vx * dt;
      hunter.y += hunter.vy * dt;
      hunter.vx *= 0.93;
      hunter.vy *= 0.93;
    } else {
      const dx = player.x - hunter.x;
      const dy = player.y - hunter.y;
      const distance = Math.hypot(dx, dy) || 1;
      const lit = player.glow > GLOW.dimFloor ? player.glow : player.glow * GLOW.dimFloor;
      if (hunter.kind === HUNTER_SENTINEL) {
        // It holds a post: it swings around the ember at arm's length and leans in when close.
        const reach = SENTINEL.orbit;
        const inward = distance > reach ? 1 : -0.55;
        const speed = SENTINEL.orbit + SENTINEL.orbitPerWave * state.wave;
        hunter.phase += SENTINEL.turn * dt;
        const radialX = (dx / distance) * inward;
        const radialY = (dy / distance) * inward;
        const tangentX = (-dy / distance) * 0.85;
        const tangentY = (dx / distance) * 0.85;
        hunter.vx = (radialX + tangentX) * speed;
        hunter.vy = (radialY + tangentY) * speed;
      } else if (hunter.kind === HUNTER_WISP) {
        // It does not care about light: it drifts in, slowly and always, on a weaving line.
        hunter.phase += WISP.wobble * dt;
        const weave = Math.sin(hunter.phase) * 0.55;
        const speed = WISP.drift;
        hunter.vx = (dx / distance) * speed - (dy / distance) * speed * weave;
        hunter.vy = (dy / distance) * speed + (dx / distance) * speed * weave;
      } else {
        // A stalker hunts what it can see: lit and near it runs, otherwise it roams and loses heart.
        const reach = STALKER.chase + STALKER.chasePerWave * state.wave + lit * STALKER.chaseGlow;
        const speed = distance < reach ? STALKER.chase + lit * STALKER.chaseGlow * 0.7 : STALKER.wander;
        hunter.vx = (dx / distance) * speed;
        hunter.vy = (dy / distance) * speed;
      }
      hunter.x += hunter.vx * dt;
      hunter.y += hunter.vy * dt;
    }
    hunter.x = clamp(hunter.x, FIELD.wall, FIELD.width - FIELD.wall);
    hunter.y = clamp(hunter.y, FIELD.wall, FIELD.height - FIELD.wall);
  }

  /**
   * One fixed step. `axisX`/`axisY` are -1, 0 or 1 (left, still, right) and `dimming` is the
   * player holding the hide key; `flareRequested` is a one-shot press. With `harmless` set (the
   * title screen's backdrop) the cave breathes but nothing touches the player and nothing scores.
   */
  function step(dt, axisX, axisY, dimming, harmless, flareRequested) {
    let events = 0;
    state.elapsed += dt;
    if (state.flareFlash > 0) state.flareFlash = Math.max(0, state.flareFlash - dt);
    if (state.hurtFlash > 0) state.hurtFlash = Math.max(0, state.hurtFlash - dt);
    if (player.hurt > 0) player.hurt = Math.max(0, player.hurt - dt);
    if (player.cooldown > 0) player.cooldown = Math.max(0, player.cooldown - dt);
    if (player.flare > 0) player.flare = Math.max(0, player.flare - dt);
    if (state.comboTimer > 0) {
      state.comboTimer = Math.max(0, state.comboTimer - dt);
      if (state.comboTimer === 0) state.combo = 0;
    }

    movePlayer(dt, axisX, axisY, dimming);

    // The light: hiding floods it away fast, otherwise it seeps out slowly. Motes are the only way
    // back up, which is what pulls the player around the cave and into the hunters' reach.
    if (dimming) player.glow = Math.max(GLOW.dimFloor, player.glow - GLOW.dimRate * dt);
    else player.glow = Math.max(GLOW.dimFloor * 0.5, player.glow - GLOW.decay * dt);

    if (!harmless && flareRequested && player.cooldown === 0 && player.glow > GLOW.flareCost) {
      player.glow -= GLOW.flareCost;
      player.cooldown = GLOW.flareCooldown;
      player.flare = GLOW.flareSeconds;
      state.flareFlash = GLOW.flareSeconds;
      events |= EVENT_FLARE;
      const flareRadius = GLOW.flareRadius + player.glow * 60;
      for (const hunter of hunters) {
        if (!hunter.active) continue;
        const dx = hunter.x - player.x;
        const dy = hunter.y - player.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance > flareRadius) continue;
        hunter.stun = GLOW.flareStun;
        hunter.vx = (dx / distance) * 300;
        hunter.vy = (dy / distance) * 300;
        state.score += 120;
        state.stunned += 1;
        events |= EVENT_STUN;
      }
    }

    for (const mote of motes) {
      if (!mote.active) continue;
      mote.phase += dt * 1.6;
      if (harmless) continue;
      if (Math.hypot(mote.x - player.x, mote.y - player.y) > MOTE.radius + PLAYER.radius) continue;
      mote.active = false;
      player.glow = Math.min(GLOW.cap, player.glow + GLOW.moteGain);
      state.combo += 1;
      state.comboTimer = 3;
      state.score += MOTE.value + (state.combo - 1) * 25;
      state.motesLeft -= 1;
      state.motesTaken += 1;
      events |= EVENT_MOTE;
      if (state.motesLeft === 0) {
        // Every mote gone: the way onward opens somewhere in the dark.
        const spot = randomPoint(FIELD.wall + 130);
        portal.active = true;
        portal.x = spot.x;
        portal.y = spot.y;
        portal.phase = 0;
        events |= EVENT_PORTAL;
      }
    }

    for (const hunter of hunters) {
      if (!hunter.active) continue;
      moveHunter(hunter, dt);
      if (harmless || player.hurt > 0) continue;
      const reach = HUNTER_RADIUS[hunter.kind] + PLAYER.radius - 3;
      if (Math.hypot(hunter.x - player.x, hunter.y - player.y) > reach) continue;
      state.lives -= 1;
      player.hurt = PLAYER.hurtSeconds;
      state.hurtFlash = 0.5;
      state.combo = 0;
      const dx = player.x - hunter.x;
      const dy = player.y - hunter.y;
      const distance = Math.hypot(dx, dy) || 1;
      player.vx = (dx / distance) * PLAYER.hurtPush;
      player.vy = (dy / distance) * PLAYER.hurtPush;
      events |= EVENT_HURT;
      if (state.lives <= 0) {
        state.lives = 0;
        return events | EVENT_OVER;
      }
    }

    if (portal.active) {
      portal.phase += dt * 2;
      if (!harmless && Math.hypot(portal.x - player.x, portal.y - player.y) < PORTAL.radius + PLAYER.radius) {
        // The glow you carry through the way onward is worth points: burn bright, or get out alive.
        state.score += PORTAL.value + Math.round(player.glow * 250);
        events |= EVENT_WAVE;
        if (state.wave + 1 >= WAVES.length) return events | EVENT_WIN;
        startWave(state.wave + 1);
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, sightRadius };
}
