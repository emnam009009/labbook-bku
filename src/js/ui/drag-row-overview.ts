// src/js/ui/drag-row-overview.ts
// Round 77c: Drag-to-open Tong quan modal — drag a hydro/electrode row
// LEFT by >= 150px to open the overview modal for that experiment.
//
// State machine:
//   idle: no mouse pressed, nothing tracked
//   tracking: mousedown on tr.clickable-row, recording start position
//   dragging: deltaX < -10px and |deltaX| > |deltaY| → committed to drag
//   released: mouseup → if past threshold open modal, else reset
//
// Cancellation conditions:
//   - target is button/input/anchor (let normal click happen)
//   - deltaY > 30px before commitment (user wants to scroll)
//   - mouseleave the window
//   - row has no data-key or unknown ref-type

const THRESHOLD_PX = 150;        // user requested distance (Round 77c Q2)
const COMMIT_DEAD_ZONE = 10;     // dead zone before we steal the click
const VERTICAL_TOLERANCE = 30;   // if |deltaY| > this before commit, abort

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
    };

let _state: RowDragState = { phase: 'idle' };
let _attached = false;

function _resetRowVisuals(row: HTMLElement): void {
  row.style.transform = '';
  row.style.transition = '';
  row.classList.remove('dragging-overview', 'drag-overview-trigger');
}

function _onMouseDown(e: MouseEvent): void {
  // Only left mouse button
  if (e.button !== 0) return;

  const target = e.target as HTMLElement;
  // Don't hijack clicks on interactive elements
  if (target.closest('button, input, textarea, select, a, label, [data-action]:not([data-action="edit-hydro-row"]):not([data-action="edit-electrode-row"]), .lock-toggle, .plusButton, .del-btn, .exp-bar')) {
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
  // 'edit-electrochem-row' isn't part of attachment tracking — skip
  if (!refType) return;

  // Try to read code from a child <strong data-action="show-X-image">
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
  };
}

function _onMouseMove(e: MouseEvent): void {
  if (_state.phase === 'idle') return;

  const dx = e.clientX - _state.startX;
  const dy = e.clientY - _state.startY;

  // If user clearly wants to scroll vertically, abort
  if (_state.phase === 'tracking' && Math.abs(dy) > VERTICAL_TOLERANCE && Math.abs(dy) > Math.abs(dx)) {
    _resetRowVisuals(_state.row);
    _state = { phase: 'idle' };
    return;
  }

  // Commit to dragging once user moves left past dead zone
  if (_state.phase === 'tracking' && dx < -COMMIT_DEAD_ZONE && Math.abs(dx) > Math.abs(dy)) {
    _state = { ..._state, phase: 'dragging' };
    _state.row.classList.add('dragging-overview');
    _state.row.style.transition = 'none';
    e.preventDefault();
  }

  if (_state.phase === 'dragging') {
    // Apply translation, but only allow leftward movement
    const tx = Math.min(0, dx);
    _state.row.style.transform = `translateX(${tx}px)`;

    if (tx <= -THRESHOLD_PX) {
      _state.row.classList.add('drag-overview-trigger');
    } else {
      _state.row.classList.remove('drag-overview-trigger');
    }
    e.preventDefault();
  }
}

function _onMouseUp(e: MouseEvent): void {
  if (_state.phase === 'idle') return;

  const dx = e.clientX - _state.startX;

  if (_state.phase === 'dragging' && dx <= -THRESHOLD_PX) {
    // Animate back to origin, then open modal
    const { row, refType, refId, code } = _state;
    row.style.transition = 'transform 0.2s ease';
    row.style.transform = '';
    setTimeout(() => _resetRowVisuals(row), 200);

    const fn = (window as any).openOverviewModal;
    if (typeof fn === 'function') {
      fn({ refType, refId, title: code });
    } else {
      console.warn('[drag-row-overview] openOverviewModal not available');
    }
  } else if (_state.phase === 'dragging') {
    // Released before threshold — animate back
    const row = _state.row;
    row.style.transition = 'transform 0.2s ease';
    row.style.transform = '';
    setTimeout(() => _resetRowVisuals(row), 200);
  } else {
    // tracking only — never committed, just clean up
    _resetRowVisuals(_state.row);
  }

  _state = { phase: 'idle' };
}

function _onMouseLeave(): void {
  if (_state.phase === 'idle') return;
  if (_state.phase !== 'tracking') {
    const row = _state.row;
    row.style.transition = 'transform 0.2s ease';
    row.style.transform = '';
    setTimeout(() => _resetRowVisuals(row), 200);
  } else {
    _resetRowVisuals(_state.row);
  }
  _state = { phase: 'idle' };
}

export function bindRowDragOverview(): void {
  if (_attached) return;
  _attached = true;
  document.addEventListener('mousedown', _onMouseDown);
  document.addEventListener('mousemove', _onMouseMove);
  document.addEventListener('mouseup', _onMouseUp);
  document.addEventListener('mouseleave', _onMouseLeave);
}
