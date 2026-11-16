// Keyboard and pointer input. Movement is read as a direction every frame; one-shot presses
// (start, restart, pause) are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice. Dimming is a held key, so it is a level, not
// an action.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const DIM = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter', 'NumpadEnter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, dim: false };
  let actions = 0;

  function setKey(code, value) {
    if (UP.has(code)) held.up = value;
    else if (DOWN.has(code)) held.down = value;
    else if (LEFT.has(code)) held.left = value;
    else if (RIGHT.has(code)) held.right = value;
    else if (DIM.has(code)) held.dim = value;
    else return false;
    return true;
  }

  window.addEventListener('keydown', (event) => {
    if (setKey(event.code, true)) {
      event.preventDefault();
      return;
    }
    if (CONFIRM.has(event.code)) {
      // A held Space must not fire a flare every frame.
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    setKey(event.code, false);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    held.dim = false;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1, 0 or 1 on each axis: left/right and up/down, 0 when neither or both are held. */
    axisX() {
      return (held.right ? 1 : 0) - (held.left ? 1 : 0);
    },
    axisY() {
      return (held.down ? 1 : 0) - (held.up ? 1 : 0);
    },
    /** True while a Shift key is down: the player is dimming to hide. */
    dimming() {
      return held.dim;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
