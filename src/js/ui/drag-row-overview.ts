// src/js/ui/drag-row-overview.ts
// Round 77c + Round 80: Drag-to-open Tong quan modal — drag a hydro/electrode row
// LEFT by >= 150px to open the overview modal for that experiment.
//
// Round 80 improvements:
//   - rAF batching for transform updates (smoother 60fps)
//   - will-change + translate3d for GPU compositing
//   - SUPPRESS click event after any drag commit (>10px) so modal sua
//     khong bi mo nham khi user drag ngan roi tha
//
// State machine:
//   idle: no mouse pressed, nothing tracked
//   tracking: mousedown on tr.clickable-row, recording start position
//   dragging: deltaX < -10px and |deltaX| > |deltaY| → committed (will suppress click)
//   released: mouseup → if past 150px open modal, else animate back
//
// Cancellation:
//   - target is button/input/anchor/.exp-bar (let normal click happen)
//   - deltaY > 30px before commit (user wants to scroll)
//   - mouseleave the window
//   - contextmenu (right-click while dragging)

const THRESHOLD_PX = 150;
const COMMIT_DEAD_ZONE = 10;
const VERTICAL_TOLERANCE = 30;
const ANIMATE_BACK_MS = 220;

type RowDragState =
  | { phase: 'idle' }
  | {
      phase: 'tracking' | 'dragging';
      row: HTMLTableRowElement;
      refType: 'hydro' | 'electrode';
      refId: string;
      code: string;
      startX: number;
      startY: number;
      currentDx: number;
      pastThreshold: boolean;
    };

let _state: RowDragState = { phase: 'idle' };
let _attached = false;
let _rafId: number | null = null;

// Round 80: suppress flag — when true, the next click event globally
// is cancelled so the row's edit-modal handler doesn't fire.
let _suppressNextClick = false;
// Last drag commit timestamp — fallback time-based suppress window
// in case 'click' doesn't fire (eg dragend without click event).
let _lastCommitTime = 0;
const SUPPRESS_WINDOW_MS = 350;

function _resetRowVisuals(row: HTMLElement): void {
  row.style.transform = '';
  row.style.transition = '';
  row.style.willChange = '';
  row.classList.remove('dragging-overview', 'drag-overview-trigger');
}

function _cancelRaf(): void {
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

/**
 * rAF tick: read current state and apply transform + threshold class.
 * Called once per animation frame (typically 60Hz) regardless of how
 * many mousemove events fired in between.
 */
function _applyFrame(): void {
  _rafId = null;
  if (_state.phase !== 'dragging') return;
  const tx = Math.min(0, _state.currentDx);
  // translate3d forces GPU compositing on most browsers
  _state.row.style.transform = `translate3d(${tx}px, 0, 0)`;

  const shouldTrigger = tx <= -THRESHOLD_PX;
  if (shouldTrigger !== _state.pastThreshold) {
    _state.pastThreshold = shouldTrigger;
    if (shouldTrigger) {
      _state.row.classList.add('drag-overview-trigger');
    } else {
      _state.row.classList.remove('drag-overview-trigger');
    }
  }
}

function _scheduleFrame(): void {
  if (_rafId !== null) return;
  _rafId = requestAnimationFrame(_applyFrame);
}

function _onMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return;

  const target = e.target as HTMLElement;
  // Don't hijack clicks on interactive elements within the row
  if (target.closest('button, input, textarea, select, a, label, .lock-toggle, .plusButton, .del-btn, .exp-bar')) {
    return;
  }

  const row = target.closest<HTMLTableRowElement>('tr.clickable-row');
  if (!row) return;

  const action = row.dataset.action || '';
  const key = row.dataset.key || '';
  if (!key) return;

  let refType: 'hydro' | 'electrode' | null = null;
  if (action === 'edit-hydro-row') refType = 'hydro';
  else if (action === 'edit-electrode-row') refType = 'electrode';
  if (!refType) return;

  const codeEl = row.querySelector<HTMLElement>('strong[data-action^="show-"]');
  const code = codeEl?.textContent?.trim() || key;

  _state = {
    phase: 'tracking',
    row,
    refType,
    refId: key,
    code,
    startX: e.clientX,
    startY: e.clientY,
    currentDx: 0,
    pastThreshold: false,
  };
  // Pre-allocate compositor layer for smoothness
  row.style.willChange = 'transform';
}

function _onMouseMove(e: MouseEvent): void {
  if (_state.phase === 'idle') return;

  const dx = e.clientX - _state.startX;
  const dy = e.clientY - _state.startY;

  // Vertical scroll intention — abort tracking
  if (_state.phase === 'tracking' && Math.abs(dy) > VERTICAL_TOLERANCE && Math.abs(dy) > Math.abs(dx)) {
    _resetRowVisuals(_state.row);
    _state = { phase: 'idle' };
    return;
  }

  // Commit to dragging
  if (_state.phase === 'tracking' && dx < -COMMIT_DEAD_ZONE && Math.abs(dx) > Math.abs(dy)) {
    _state = {
      ..._state,
      phase: 'dragging',
      currentDx: dx,
      pastThreshold: false,
    };
    _state.row.classList.add('dragging-overview');
    _state.row.style.transition = 'none';
    // Round 80: arm click suppression NOW (any further click event must be cancelled)
    _suppressNextClick = true;
    _lastCommitTime = performance.now();
    e.preventDefault();
  }

  if (_state.phase === 'dragging') {
    _state.currentDx = dx;
    _scheduleFrame();
    e.preventDefault();
  }
}

function _animateBack(row: HTMLElement): void {
  // Schedule via rAF to ensure transition starts after current paint frame
  requestAnimationFrame(() => {
    row.style.transition = `transform ${ANIMATE_BACK_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
    row.style.transform = 'translate3d(0, 0, 0)';
  });
  setTimeout(() => _resetRowVisuals(row), ANIMATE_BACK_MS + 30);
}

function _onMouseUp(e: MouseEvent): void {
  if (_state.phase === 'idle') return;
  _cancelRaf();

  const dx = e.clientX - _state.startX;

  if (_state.phase === 'dragging' && dx <= -THRESHOLD_PX) {
    // Past threshold → open modal + animate back
    const { row, refType, refId, code } = _state;
    _animateBack(row);

    const fn = (window as any).openOverviewModal;
    if (typeof fn === 'function') {
      fn({ refType, refId, title: code });
    } else {
      console.warn('[drag-row-overview] openOverviewModal not available');
    }
  } else if (_state.phase === 'dragging') {
    // Released before threshold → animate back (no modal)
    _animateBack(_state.row);
  } else {
    // Tracking-only (no commit) → just clean up; no click suppression
    _resetRowVisuals(_state.row);
    _suppressNextClick = false;
  }

  _state = { phase: 'idle' };
}

function _onMouseLeave(): void {
  if (_state.phase === 'idle') return;
  _cancelRaf();
  if (_state.phase === 'dragging') {
    _animateBack(_state.row);
  } else {
    _resetRowVisuals(_state.row);
  }
  _suppressNextClick = false;  // browser will fire its own dragend, no click follows
  _state = { phase: 'idle' };
}

function _onContextMenu(): void {
  // Right-click while dragging → cancel
  if (_state.phase !== 'idle') {
    _cancelRaf();
    if (_state.phase === 'dragging') {
      _animateBack(_state.row);
    } else {
      _resetRowVisuals(_state.row);
    }
    _state = { phase: 'idle' };
  }
}

/**
 * Round 80: Click suppressor.
 * Fires in CAPTURE phase (3rd arg true) so it runs BEFORE the tbody
 * click handler in pages/experiments.ts that opens the edit modal.
 * Cancels propagation if _suppressNextClick is set OR within window
 * after last drag commit (defensive — covers cases where click fires
 * unexpectedly delayed).
 */
function _onClickCapture(e: MouseEvent): void {
  const inWindow = (performance.now() - _lastCommitTime) < SUPPRESS_WINDOW_MS;
  if (_suppressNextClick || inWindow) {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    _suppressNextClick = false;
  }
}

export function bindRowDragOverview(): void {
  if (_attached) return;
  _attached = true;
  document.addEventListener('mousedown', _onMouseDown);
  document.addEventListener('mousemove', _onMouseMove, { passive: false });
  document.addEventListener('mouseup', _onMouseUp);
  document.addEventListener('mouseleave', _onMouseLeave);
  document.addEventListener('contextmenu', _onContextMenu);
  // Round 80: capture-phase click handler — runs before tbody listener
  document.addEventListener('click', _onClickCapture, true);
}
