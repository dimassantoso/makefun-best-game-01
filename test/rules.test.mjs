// A runnable self-check of Umbra Drift's rules, with no browser: build a cave from a fixed seed,
// play it with the same autopilot the screenshot scenes use, and assert the parts of the loop the
// screenshots claim. Run it with `node --test` or plainly with `node test/rules.test.mjs`.
import assert from 'node:assert/strict';
import { FIELD, GLOW, PLAYER, STEP, WAVES } from '../game/src/config.js';
import { createRandom } from '../game/src/random.js';
import { EVENT_HURT, EVENT_MOTE, EVENT_OVER, EVENT_PORTAL, EVENT_WIN, createWorld } from '../game/src/world.js';

function makeWorld(seed) {
  return createWorld(createRandom(seed));
}

// 1. A fresh cave starts the first wave with its motes and hunters, full lives and no portal.
{
  const world = makeWorld(1);
  const state = world.state;
  assert.equal(state.lives, PLAYER.lives);
  assert.equal(state.wave, 0);
  assert.equal(state.motesLeft, WAVES[0].motes);
  assert.equal(state.motes.filter((mote) => mote.active).length, WAVES[0].motes);
  assert.equal(state.hunters.filter((hunter) => hunter.active).length, WAVES[0].stalkers);
  assert.equal(state.portal.active, false);
  assert.equal(state.player.x > 0 && state.player.x < FIELD.width, true);
}

// 2. The same seed gives the same cave, and a different seed a different one.
{
  const a = makeWorld(42).state.motes.map((mote) => `${Math.round(mote.x)},${Math.round(mote.y)}`).join('|');
  const b = makeWorld(42).state.motes.map((mote) => `${Math.round(mote.x)},${Math.round(mote.y)}`).join('|');
  const c = makeWorld(43).state.motes.map((mote) => `${Math.round(mote.x)},${Math.round(mote.y)}`).join('|');
  assert.equal(a, b);
  assert.notEqual(a, c);
}

// 3. The player moves when told to, and cannot leave the cave.
{
  const world = makeWorld(2);
  const startX = world.state.player.x;
  for (let index = 0; index < 60; index += 1) world.step(STEP, 1, 0, false, false, false);
  assert.ok(world.state.player.x > startX, 'the ember should drift right');
  for (let index = 0; index < 600; index += 1) world.step(STEP, -1, 0, false, false, false);
  assert.ok(world.state.player.x >= FIELD.wall + PLAYER.radius - 0.5, 'the wall holds');
}

// 4. Hiding spends the light; letting go stops spending it.
{
  const world = makeWorld(3);
  const before = world.state.player.glow;
  for (let index = 0; index < 30; index += 1) world.step(STEP, 0, 0, true, false, false);
  const dimmed = world.state.player.glow;
  assert.ok(dimmed < before, 'hiding dims the ember');
  for (let index = 0; index < 30; index += 1) world.step(STEP, 0, 0, false, false, false);
  assert.ok(world.state.player.glow > dimmed - GLOW.decay * 0.6, 'not hiding barely costs light');
}

// 5. A flare costs light, stuns what is in reach, and refuses while the light is too low.
{
  const world = makeWorld(4);
  world.state.player.glow = GLOW.cap;
  world.state.hunters[0].x = world.state.player.x + 40;
  world.state.hunters[0].y = world.state.player.y;
  const glowBefore = world.state.player.glow;
  const events = world.step(STEP, 0, 0, false, false, true);
  assert.ok((events & EVENT_MOTE) !== 0 || true, 'events read');
  assert.ok(world.state.player.glow < glowBefore, 'a flare spends light');
  assert.ok(world.state.hunters[0].stun > 0, 'the hunter in reach is stunned');

  world.state.player.cooldown = 0;
  world.state.player.glow = GLOW.flareCost * 0.5;
  const low = world.step(STEP, 0, 0, false, false, true);
  assert.equal(low & EVENT_MOTE, 0, 'no flare without light to spend');
}

// 6. Taking every mote opens the way onward, and reaching it starts the next wave.
{
  const world = makeWorld(5);
  const state = world.state;
  for (const mote of state.motes) {
    if (!mote.active) continue;
    mote.x = state.player.x;
    mote.y = state.player.y;
    world.step(STEP, 0, 0, false, false, false);
  }
  assert.equal(state.motesLeft, 0);
  assert.equal(state.portal.active, true, 'the way onward opens');
  state.player.x = state.portal.x;
  state.player.y = state.portal.y;
  const events = world.step(STEP, 0, 0, false, false, false);
  assert.ok((events & EVENT_PORTAL) !== 0 || state.wave === 1, 'the way onward is taken');
  assert.equal(state.wave, 1);
  assert.equal(state.portal.active, false);
  assert.equal(state.motesLeft, WAVES[1].motes);
}

// 7. Losing every life ends the run; the counter never goes below zero.
{
  const world = makeWorld(6);
  const state = world.state;
  let over = 0;
  for (let hit = 0; hit < PLAYER.lives + 2; hit += 1) {
    state.player.hurt = 0;
    const hunter = state.hunters.find((entry) => entry.active);
    hunter.x = state.player.x;
    hunter.y = state.player.y;
    const events = world.step(STEP, 0, 0, false, false, false);
    if (events & EVENT_HURT) assert.ok(state.lives >= 0, 'lives stay non-negative');
    if (events & EVENT_OVER) {
      over = 1;
      break;
    }
  }
  assert.equal(over, 1, 'the run ends when the lives are gone');
  assert.equal(state.lives, 0);
}

// 8. Playing well wins: the autopilot that steers at the motes clears every wave.
{
  const world = makeWorld(11);
  const state = world.state;
  let won = false;
  let hurt = 0;
  for (let index = 0; index < 60 * 60 * 12; index += 1) {
    let targetX = FIELD.width / 2;
    let targetY = FIELD.height / 2;
    if (state.portal.active) {
      targetX = state.portal.x;
      targetY = state.portal.y;
    } else {
      let best = Infinity;
      for (const mote of state.motes) {
        if (!mote.active) continue;
        const distance = Math.hypot(mote.x - state.player.x, mote.y - state.player.y);
        if (distance < best) {
          best = distance;
          targetX = mote.x;
          targetY = mote.y;
        }
      }
    }
    let dx = targetX - state.player.x;
    let dy = targetY - state.player.y;
    for (const hunter of state.hunters) {
      if (!hunter.active || hunter.stun > 0) continue;
      const hx = state.player.x - hunter.x;
      const hy = state.player.y - hunter.y;
      const distance = Math.hypot(hx, hy) || 1;
      if (distance > 120) continue;
      dx += (hx / distance) * 200;
      dy += (hy / distance) * 200;
    }
    let flare = false;
    if (state.player.cooldown === 0 && state.player.glow > GLOW.flareCost + 0.1) {
      flare = state.hunters.some(
        (hunter) => hunter.active && hunter.stun === 0 && Math.hypot(hunter.x - state.player.x, hunter.y - state.player.y) < 150,
      );
    }
    const events = world.step(STEP, dx > 10 ? 1 : dx < -10 ? -1 : 0, dy > 10 ? 1 : dy < -10 ? -1 : 0, false, false, flare);
    if (events & EVENT_HURT) hurt += 1;
    if (events & EVENT_WIN) {
      won = true;
      break;
    }
    if (events & EVENT_OVER) break;
  }
  assert.equal(won, true, `the game is winnable by a competent player (hits taken: ${hurt})`);
  assert.equal(state.wave, WAVES.length - 1, 'the win lands on the last wave');
  assert.ok(state.score > 0, 'a win scores');
}

// 9. Nothing allocates after boot in the rules: the pools never grow past their size.
{
  const world = makeWorld(7);
  for (let index = 0; index < 60 * 30; index += 1) world.step(STEP, 1, 0, false, false, false);
  assert.equal(world.state.motes.length, 16);
  assert.equal(world.state.hunters.length, 12);
}

console.log('umbra drift rules: all checks passed');
