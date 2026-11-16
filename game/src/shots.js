// The screenshot scenes behind ?shot=start|play|win. Each one plays the real rules forward from a
// fresh cave, steered by an autopilot, so the frame is what a real run looks like and the same
// seed always gives the same frame. The autopilot is a plain steering loop: fly at the nearest
// mote or the open way onward, dodge anything hunting, and burn a flare when something closes in.
import { FIELD, GLOW, PLAYER, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN, HUNTER_RADIUS } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 34;
const OVER_SECONDS = 240;
const WIN_SECONDS = 900;

/** Wanted heading for the autopilot: the open way onward, else the nearest mote, else mid-cave. */
function steer(state, dodging) {
  const player = state.player;
  let targetX = FIELD.width / 2;
  let targetY = FIELD.height / 2;
  if (state.portal.active) {
    targetX = state.portal.x;
    targetY = state.portal.y;
  } else {
    let best = Infinity;
    for (const mote of state.motes) {
      if (!mote.active) continue;
      const distance = Math.hypot(mote.x - player.x, mote.y - player.y);
      if (distance < best) {
        best = distance;
        targetX = mote.x;
        targetY = mote.y;
      }
    }
  }
  let dx = targetX - player.x;
  let dy = targetY - player.y;

  if (!dodging) return { dx, dy };

  // Repel from hunters inside a personal-space bubble, so the pilot dodges instead of ramming.
  for (const hunter of state.hunters) {
    if (!hunter.active || hunter.stun > 0) continue;
    const hx = player.x - hunter.x;
    const hy = player.y - hunter.y;
    const distance = Math.hypot(hx, hy);
    const bubble = HUNTER_RADIUS[hunter.kind] + PLAYER.radius + 66;
    if (distance > bubble || distance === 0) continue;
    const weight = (bubble - distance) / bubble;
    dx += (hx / distance) * weight * 260;
    dy += (hy / distance) * weight * 260;
  }
  return { dx, dy };
}

/** True when a hunter is close enough, and the light full enough, that a flare is worth it. */
function wantsFlare(state) {
  const player = state.player;
  if (player.cooldown > 0 || player.glow < GLOW.flareCost + 0.12) return false;
  for (const hunter of state.hunters) {
    if (!hunter.active || hunter.stun > 0) continue;
    if (Math.hypot(hunter.x - player.x, hunter.y - player.y) < GLOW.flareRadius * 0.85) return true;
  }
  return false;
}

function axisToward(dx) {
  const dead = 12;
  return dx > dead ? 1 : dx < -dead ? -1 : 0;
}

/** Play the real rules forward for `seconds`; returns the ending it reached. */
function fly(world, seconds, dodging) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    const guidance = steer(world.state, dodging);
    const events = world.step(
      STEP,
      axisToward(guidance.dx),
      axisToward(guidance.dy),
      false,
      false,
      dodging && wantsFlare(world.state),
    );
    if (events & EVENT_OVER) return SCREEN_OVER;
    if (events & EVENT_WIN) return SCREEN_WIN;
  }
  return SCREEN_PLAY;
}

/**
 * Set `world` to the named scene (start, play, over or win; any other name is start) and return
 * the screen to draw over it and the score to show. The `over` scene flies the same autopilot with
 * its dodging turned off, so it really does die on the cave's own rules.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'over' && name !== 'win') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, 0, 0, false, true, false);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const dodging = name !== 'over';
  const seconds = name === 'win' ? WIN_SECONDS : name === 'over' ? OVER_SECONDS : PLAY_SECONDS;
  const screen = fly(world, seconds, dodging);
  if (screen === SCREEN_PLAY) {
    // Freeze a flare mid-burn, so the play shot shows the light spent and the hunters held off.
    world.state.flareFlash = 0.62;
    world.state.player.flare = 0.62;
  }
  return { screen, best: world.state.score };
}
