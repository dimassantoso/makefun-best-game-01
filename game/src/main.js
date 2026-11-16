// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps (some
// in a slow frame, none in a fast one), and the renderer paints what is there. The game moves
// between five screens: title, play, paused, over and win.
//
// ?seed=N fixes the cave and the hunt. ?shot=start|play|win (with &seed=N) stages that scene
// instead of running the loop, paints it twice, and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_FLARE,
  EVENT_HURT,
  EVENT_MOTE,
  EVENT_OVER,
  EVENT_PORTAL,
  EVENT_WAVE,
  EVENT_WIN,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, seed);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, world.sightRadius(), 0.9);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let clock = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.resume();
    audio.drone();
    announce(`Drifting. ${world.state.lives} lives. Gather every mote to open the way onward.`);
  }

  function finishGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.over(won);
    announce(`${won ? 'You left the cave' : 'The dark closed'}. Score ${world.state.score}. Best ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_OVER) return finishGame(false);
    if (events & EVENT_WIN) return finishGame(true);
    if (events & EVENT_MOTE) audio.mote(world.state.combo);
    if (events & EVENT_FLARE) audio.flare();
    if (events & EVENT_HURT) {
      audio.hurt();
      announce(world.state.lives === 1 ? 'Hit. 1 life left.' : `Hit. ${world.state.lives} lives left.`);
    }
    if (events & EVENT_PORTAL) announce('Every mote gathered. The way onward is open.');
    if (events & EVENT_WAVE) audio.wave();
    return undefined;
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, 0, 0, false, true, false);
      return;
    }
    const flare = (actions & ACTION_CONFIRM) !== 0;
    const events = world.step(STEP, input.axisX(), input.axisY(), input.dimming(), false, flare);
    handleEvents(events);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
      return 0;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return 0;
    }
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Drifting.');
      return 0;
    }
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      // A press this frame reaches the first step of the frame; later catch-up steps get none.
      let pending = actions;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(pending);
        pending = 0;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    clock += STEP;
    audio.setTension(Math.min(1, world.state.player.glow));
    renderer.draw(world.state, screen, best, world.sightRadius(), clock);
  }

  // Leaving the tab pauses a running drift rather than letting the dark move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM' && !event.repeat) audio.toggleMute();
  });

  announce('Umbra Drift. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
