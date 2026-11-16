// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield is
// scaled to fit the window and centred, the margin filled with the void colour. The cave is drawn
// in layers and then the dark is laid over it as a radial hole around the ember, so what the
// player's light does not reach is not drawn at all. Text that holds a number is rebuilt only when
// the number changes.
import { FIELD, FONT, GLOW, PALETTE, PLAYER } from './config.js';
import { createRandom } from './random.js';
import { HUNTER_RADIUS, HUNTER_SENTINEL, HUNTER_STALKER, HUNTER_WISP } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 820, line: 30, padTop: 58, padBottom: 72 };
const LIFE_RADIUS = 8;
const LIFE_GAP = 22;

/**
 * The cave floor is static, so it is painted once into an offscreen canvas at the playfield's
 * size: seams of rock, a scatter of dust and the odd brighter crystal. The seed fixes it, so a
 * screenshot is the same cave every time.
 */
function paintCave(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  const ctx = canvas.getContext('2d');
  const random = createRandom(seed);

  const wash = ctx.createLinearGradient(0, 0, FIELD.width, FIELD.height);
  wash.addColorStop(0, '#081019');
  wash.addColorStop(0.45, '#0a141d');
  wash.addColorStop(1, '#060b12');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  // Rock seams: broken polylines that wander across the floor.
  ctx.strokeStyle = 'rgba(38, 62, 78, 0.5)';
  ctx.lineWidth = 2;
  for (let seam = 0; seam < 26; seam += 1) {
    let x = random() * FIELD.width;
    let y = random() * FIELD.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(random() * 5);
    for (let step = 0; step < steps; step += 1) {
      x += (random() - 0.5) * 180;
      y += (random() - 0.5) * 140;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Dust and a few crystals that catch the light.
  for (let dot = 0; dot < 420; dot += 1) {
    const x = random() * FIELD.width;
    const y = random() * FIELD.height;
    const size = 0.6 + random() * 1.8;
    ctx.fillStyle = random() > 0.9 ? 'rgba(120, 200, 220, 0.5)' : 'rgba(70, 100, 120, 0.35)';
    ctx.fillRect(x, y, size, size);
  }
  for (let crystal = 0; crystal < 26; crystal += 1) {
    const x = random() * FIELD.width;
    const y = random() * FIELD.height;
    const size = 4 + random() * 9;
    ctx.fillStyle = 'rgba(96, 170, 190, 0.22)';
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.6, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.6, y);
    ctx.closePath();
    ctx.fill();
  }

  // The cave wall is a band around the floor, darker, with a lip that catches a little light.
  ctx.fillStyle = 'rgba(3, 6, 10, 0.92)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.wall);
  ctx.fillRect(0, FIELD.height - FIELD.wall, FIELD.width, FIELD.wall);
  ctx.fillRect(0, 0, FIELD.wall, FIELD.height);
  ctx.fillRect(FIELD.width - FIELD.wall, 0, FIELD.wall, FIELD.height);
  ctx.strokeStyle = 'rgba(88, 150, 170, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(FIELD.wall, FIELD.wall, FIELD.width - FIELD.wall * 2, FIELD.height - FIELD.wall * 2);

  return canvas;
}

function cachedLabel(prefix) {
  let value = Number.NaN;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas, seed) {
  const context = canvas.getContext('2d');
  const cave = paintCave(seed);
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const waveLabel = cachedLabel('WAVE ');
  const comboLabel = cachedLabel('x');
  const endScoreLabel = cachedLabel('');
  const bestLabel = cachedLabel('BEST ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${size}|${weight ?? 600}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ?? 600} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawPortal(portal, time) {
    if (!portal.active) return;
    const pulse = 1 + Math.sin(portal.phase) * 0.08;
    const outer = 78 * pulse;
    const glow = context.createRadialGradient(portal.x, portal.y, 4, portal.x, portal.y, outer);
    glow.addColorStop(0, 'rgba(180, 255, 170, 0.85)');
    glow.addColorStop(0.28, 'rgba(90, 220, 140, 0.35)');
    glow.addColorStop(1, 'rgba(40, 120, 90, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(portal.x, portal.y, outer, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = PALETTE.portal;
    context.lineWidth = 3;
    for (let ring = 0; ring < 3; ring += 1) {
      const radius = 20 + ring * 9 + Math.sin(portal.phase + ring) * 3;
      context.globalAlpha = 0.9 - ring * 0.25;
      context.beginPath();
      context.arc(portal.x, portal.y, radius, portal.phase + ring, portal.phase + ring + 4.4);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.fillStyle = '#eafff0';
    text('THE WAY ON', portal.x, portal.y - 54 - Math.sin(time) * 3, 15, '#c8ffd8', 'center', 700);
  }

  function drawMotes(motes, time) {
    for (const mote of motes) {
      if (!mote.active) continue;
      const bob = Math.sin(mote.phase) * 3;
      const x = mote.x;
      const y = mote.y + bob;
      const halo = context.createRadialGradient(x, y, 1, x, y, 30);
      halo.addColorStop(0, 'rgba(255, 214, 130, 0.9)');
      halo.addColorStop(0.35, 'rgba(255, 170, 70, 0.28)');
      halo.addColorStop(1, 'rgba(255, 150, 50, 0)');
      context.fillStyle = halo;
      context.beginPath();
      context.arc(x, y, 30, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.mote;
      context.beginPath();
      context.arc(x, y, 5.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fffaf0';
      context.beginPath();
      context.arc(x - 1, y - 1, 2.4, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawStalker(hunter) {
    const angle = Math.atan2(hunter.vy, hunter.vx);
    const size = 17;
    context.save();
    context.translate(hunter.x, hunter.y);
    context.rotate(angle);
    // A wedge with a trailing tail: it always points where it is going.
    const tail = context.createLinearGradient(-size * 3, 0, 0, 0);
    tail.addColorStop(0, 'rgba(255, 95, 109, 0)');
    tail.addColorStop(1, 'rgba(255, 95, 109, 0.5)');
    context.fillStyle = tail;
    context.beginPath();
    context.moveTo(-size * 3, 0);
    context.lineTo(0, -size * 0.5);
    context.lineTo(0, size * 0.5);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.stalker;
    context.beginPath();
    context.moveTo(size, 0);
    context.lineTo(-size * 0.7, -size * 0.72);
    context.lineTo(-size * 0.3, 0);
    context.lineTo(-size * 0.7, size * 0.72);
    context.closePath();
    context.fill();
    context.fillStyle = '#ffdde0';
    context.beginPath();
    context.arc(size * 0.25, 0, 2.6, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawSentinel(hunter) {
    context.save();
    context.translate(hunter.x, hunter.y);
    context.rotate(hunter.phase);
    context.strokeStyle = PALETTE.sentinel;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(0, -15);
    context.lineTo(15, 0);
    context.lineTo(0, 15);
    context.lineTo(-15, 0);
    context.closePath();
    context.stroke();
    context.fillStyle = 'rgba(192, 107, 255, 0.35)';
    context.fill();
    context.restore();
    context.fillStyle = '#f0dcff';
    context.beginPath();
    context.arc(hunter.x, hunter.y, 3.4, 0, Math.PI * 2);
    context.fill();
  }

  function drawWisp(hunter) {
    const halo = context.createRadialGradient(hunter.x, hunter.y, 2, hunter.x, hunter.y, 26);
    halo.addColorStop(0, 'rgba(140, 175, 255, 0.75)');
    halo.addColorStop(1, 'rgba(70, 110, 220, 0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(hunter.x, hunter.y, 26, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.wisp;
    context.beginPath();
    context.arc(hunter.x, hunter.y, 7.5, 0, Math.PI * 2);
    context.fill();
  }

  function drawHunters(hunters, stunned) {
    for (const hunter of hunters) {
      if (!hunter.active) continue;
      context.globalAlpha = hunter.stun > 0 ? 0.5 : 1;
      context.save();
      // A dark rim under each hunter so it stays readable against the ember's warm bloom.
      context.shadowColor = 'rgba(0, 0, 0, 0.95)';
      context.shadowBlur = 10;
      if (hunter.kind === HUNTER_STALKER) drawStalker(hunter);
      else if (hunter.kind === HUNTER_SENTINEL) drawSentinel(hunter);
      else if (hunter.kind === HUNTER_WISP) drawWisp(hunter);
      context.restore();
      // A faint ring marks a hunter that a flare has stunned.
      if (hunter.stun > 0) {
        context.strokeStyle = 'rgba(255, 236, 190, 0.8)';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(hunter.x, hunter.y, HUNTER_RADIUS[hunter.kind] + 7, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  }

  function drawPlayer(player, time) {
    const flicker = 1 + Math.sin(time * 9) * 0.05;
    const light = (48 + player.glow * 92) * flicker;
    const halo = context.createRadialGradient(player.x, player.y, 2, player.x, player.y, light);
    halo.addColorStop(0, 'rgba(230, 255, 255, 0.95)');
    halo.addColorStop(0.22, 'rgba(142, 242, 255, 0.5)');
    halo.addColorStop(0.6, 'rgba(80, 190, 230, 0.16)');
    halo.addColorStop(1, 'rgba(40, 120, 180, 0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(player.x, player.y, light, 0, Math.PI * 2);
    context.fill();

    if (player.hurt > 0 && Math.floor(player.hurt * 14) % 2 === 0) return;
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y, PLAYER.radius * 0.62, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.arc(player.x - 1.5, player.y - 2, PLAYER.radius * 0.28, 0, Math.PI * 2);
    context.fill();
  }

  /**
   * The dark: a flat wash over the whole cave, then a hole punched around the ember with an
   * inverted radial gradient. Anything the light does not reach is dimmed to the point of gone.
   */
  function drawDarkness(player, radius, flareFlash) {
    context.fillStyle = 'rgba(2, 4, 8, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const hole = context.createRadialGradient(player.x, player.y, radius * 0.22, player.x, player.y, radius);
    hole.addColorStop(0, 'rgba(2, 4, 8, 0)');
    hole.addColorStop(0.55, 'rgba(2, 4, 8, 0.16)');
    hole.addColorStop(1, 'rgba(2, 4, 8, 0.92)');
    context.fillStyle = hole;
    context.beginPath();
    context.arc(player.x, player.y, radius, 0, Math.PI * 2);
    context.fill();

    if (flareFlash > 0) {
      const strength = flareFlash / GLOW.flareSeconds;
      const burst = context.createRadialGradient(player.x, player.y, 4, player.x, player.y, radius * 0.9);
      burst.addColorStop(0, `rgba(255, 236, 190, ${0.5 * strength})`);
      burst.addColorStop(0.4, `rgba(255, 180, 110, ${0.18 * strength})`);
      burst.addColorStop(1, 'rgba(255, 150, 80, 0)');
      context.fillStyle = burst;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawGlowMeter(state) {
    const player = state.player;
    const x = 40;
    const y = FIELD.height - 74;
    const width = 420;
    const height = 22;
    context.fillStyle = 'rgba(8, 16, 24, 0.92)';
    context.fillRect(x - 4, y - 4, width + 8, height + 8);
    context.strokeStyle = 'rgba(96, 140, 162, 0.85)';
    context.lineWidth = 1.5;
    context.strokeRect(x - 4, y - 4, width + 8, height + 8);
    const filled = Math.max(0, Math.min(1, player.glow / GLOW.cap));
    const bar = context.createLinearGradient(x, 0, x + width, 0);
    bar.addColorStop(0, '#3f9fd8');
    bar.addColorStop(0.55, '#8ef2ff');
    bar.addColorStop(1, '#fff3b0');
    context.fillStyle = bar;
    context.fillRect(x, y, width * filled, height);
    // Quarter ticks, so a glance says how much light is left.
    context.strokeStyle = 'rgba(6, 12, 18, 0.55)';
    context.lineWidth = 1;
    for (let tick = 1; tick < 4; tick += 1) {
      const tickX = x + (width * tick) / 4;
      context.beginPath();
      context.moveTo(tickX, y);
      context.lineTo(tickX, y + height);
      context.stroke();
    }
    // The flare's cost is marked, so the player can see what burning a flare takes.
    const costX = x + width * Math.max(0, (player.glow - GLOW.flareCost) / GLOW.cap);
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(costX, y - 7);
    context.lineTo(costX, y + height + 7);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text('LIGHT', x, y - 12, 16, PALETTE.text, 'left', 700);
    text(`${Math.round(filled * 100)}%`, x + width, y - 12, 16, PALETTE.text, 'right', 700);
  }

  function drawHud(state, best) {
    context.textBaseline = 'alphabetic';
    text(scoreLabel(state.score), 40, 52, 32, PALETTE.text, 'left', 700);
    text(`${waveLabel(state.wave + 1)} / ${state.waveCount}`, FIELD.width / 2, 52, 26, PALETTE.text, 'center', 700);
    text(state.waveName.toUpperCase(), FIELD.width / 2, 76, 15, PALETTE.muted, 'center', 600);

    // Lives: one ember per life, dimmed once spent, with the count in words too.
    const right = FIELD.width - 40;
    text(`LIVES ${state.lives}`, right - (PLAYER.lives - 1) * LIFE_GAP - 4, 32, 15, PALETTE.text, 'right', 700);
    for (let life = 0; life < PLAYER.lives; life += 1) {
      const cx = right - (PLAYER.lives - 1 - life) * LIFE_GAP;
      const alive = life < state.lives;
      context.fillStyle = alive ? PALETTE.player : 'rgba(60, 82, 96, 0.85)';
      context.beginPath();
      context.arc(cx, 50, LIFE_RADIUS, 0, Math.PI * 2);
      context.fill();
      if (alive) {
        context.fillStyle = 'rgba(200, 255, 255, 0.85)';
        context.beginPath();
        context.arc(cx - 2, 48, 3, 0, Math.PI * 2);
        context.fill();
      }
    }

    // Motes left in this wave, the light meter, and the keys, along the bottom.
    text(`MOTES ${state.motesTotal - state.motesTaken} / ${state.motesTotal}`, FIELD.width - 40, FIELD.height - 86, 17, PALETTE.mote, 'right', 700);
    text(bestLabel(best), FIELD.width - 40, FIELD.height - 112, 15, PALETTE.muted, 'right', 600);
    text('ARROWS / WASD  MOVE     SHIFT  HIDE     SPACE  FLARE     P  PAUSE     M  MUTE', 40, FIELD.height - 26, 15, 'rgba(206, 226, 238, 0.95)', 'left', 600);
    drawGlowMeter(state);

    if (state.combo > 1 && state.comboTimer > 0) {
      const fade = Math.min(1, state.comboTimer / 0.6);
      context.globalAlpha = fade;
      text(`${comboLabel(state.combo)} CHAIN`, state.player.x, state.player.y - 46, 22, PALETTE.mote, 'center', 800);
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.padTop + lines.length * PANEL.line + PANEL.padBottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(9, 17, 24, 0.94)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.strokeRect(x + 8, y + 8, PANEL.width - 16, height - 16);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 66, 46, PALETTE.text, 'center', 800);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.padTop + 36 + index * PANEL.line, 20, PALETTE.muted, 'center', 600);
    }
    text(prompt, FIELD.width / 2, y + height - 30, 22, accent, 'center', 700);
  }

  const TITLE_LINES = [
    'You are the last ember in a cave that eats light.',
    '',
    'Gather every mote to open the way onward.',
    'Your glow shows the way — and it is the only thing',
    'the hunters can see.',
    '',
    'ARROWS or WASD move · SHIFT hides · SPACE burns a flare',
    'P pauses · M mutes',
    '',
  ];
  const PAUSED_LINES = ['The dark is patient. It will wait.'];
  const OVER_LINES = ['', '', ''];
  const WIN_LINES = ['', '', '', ''];

  /** Paint one frame: the cave and everything lit in it, the dark, then the HUD or a panel. */
  function draw(state, screen, best, sight, time) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.void;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    context.drawImage(cave, 0, 0);
    drawPortal(state.portal, time);
    drawMotes(state.motes, time);
    drawHunters(state.hunters);
    drawPlayer(state.player, time);
    drawDarkness(state.player, sight, state.flareFlash);

    if (state.hurtFlash > 0) {
      context.fillStyle = `rgba(255, 60, 80, ${0.22 * (state.hurtFlash / 0.5)})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }

    if (screen === SCREEN_TITLE) {
      TITLE_LINES[7] = bestLabel(best) === 'BEST 0' ? '' : bestLabel(best);
      drawPanel('UMBRA DRIFT', TITLE_LINES, 'PRESS SPACE OR CLICK TO DRIFT', PALETTE.player);
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) drawPanel('PAUSED', PAUSED_LINES, 'PRESS P TO RESUME', PALETTE.player);
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = `You reached wave ${state.wave + 1} of ${state.waveCount} — ${state.waveName}.`;
      OVER_LINES[1] = `FINAL SCORE ${state.score}`;
      OVER_LINES[2] = bestLabel(best);
      drawPanel('THE DARK CLOSES', OVER_LINES, 'PRESS SPACE OR CLICK TO DRIFT AGAIN', PALETTE.stalker);
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = 'Every wave crossed, every mote gathered.';
      WIN_LINES[1] = 'The cave lets you go — this time.';
      WIN_LINES[2] = `FINAL SCORE ${endScoreLabel(state.score)}`;
      WIN_LINES[3] = bestLabel(best);
      drawPanel('YOU LEFT THE CAVE', WIN_LINES, 'PRESS SPACE OR CLICK TO DRIFT AGAIN', PALETTE.portal);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
