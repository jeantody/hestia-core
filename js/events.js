import { state, setState } from "./state.js";
import { qs } from "./dom.js";
import { renderGrid, applyGridPosition, saveGridState } from "./grid.js";
import { VirtualGrid } from "./grid/virtualGrid.js";
import { showToast } from "./ui/toasts.js";

// Drag State
let actItem = null;
let ghosts = [];
let dragOffsetX, dragOffsetY;
let gridRect;
let updateFrame = null;
let lastMoveResult = null;
let mode = null; // 'move' or 'resize'

// Resize State
let initResizeX, initResizeY;
let startCols, startRows;

export function initGlobalEvents() {
    const dashboard = qs('#dashboard');
    const gridLines = qs('#gridLines');

    if (!dashboard || !gridLines) {
        setTimeout(initGlobalEvents, 100);
        return;
    }

    dashboard.addEventListener('mousedown', e => {
        if (!state.ui.editMode) return;
        if (e.target.closest('.delete-btn') || e.target.closest('.edit-btn')) return;

        const card = e.target.closest('.app-card');
        if (!card) return;

        e.preventDefault();
        actItem = card;
        gridRect = gridLines.getBoundingClientRect();

        // 1. CHECK MODE
        // Use closest() to ensure we catch the handle even if clicking an icon inside it
        if (e.target.closest('.resize-handle')) {
            mode = 'resize';
            initResizeX = e.clientX;
            initResizeY = e.clientY;
            startCols = parseInt(actItem.dataset.cols);
            startRows = parseInt(actItem.dataset.rows);
        } else {
            mode = 'move';
            // Setup Drag Visuals
            const rect = actItem.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;

            actItem.classList.add('moving');
            actItem.style.width = rect.width + 'px';
            actItem.style.height = rect.height + 'px';
            actItem.style.position = 'fixed';
            actItem.style.left = rect.left + 'px';
            actItem.style.top = rect.top + 'px';
            actItem.style.zIndex = '1000';
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!actItem) return;

        if (mode === 'move') {
            actItem.style.left = (e.clientX - dragOffsetX) + 'px';
            actItem.style.top = (e.clientY - dragOffsetY) + 'px';
        }

        if (updateFrame) return;
        updateFrame = requestAnimationFrame(() => {
            if (mode === 'move') handleMoveLogic(e);
            else if (mode === 'resize') handleResizeLogic(e);
            updateFrame = null;
        });
    }

    function handleMoveLogic(e) {
        const cols = state.settings.theme.gridColumns || 10;
        const rows = state.settings.theme.gridRows || 6;
        const cW = gridRect.width / cols;
        const cH = gridRect.height / rows;

        const rawX = e.clientX - dragOffsetX - gridRect.left;
        const rawY = e.clientY - dragOffsetY - gridRect.top;

        let nX = Math.round(rawX / cW) + 1;
        let nY = Math.round(rawY / cH) + 1;

        const appId = parseInt(actItem.dataset.id);
        const sourceApp = state.apps.find(a => a.id === appId);

        const vGrid = new VirtualGrid(cols, rows, state.apps);
        const result = vGrid.checkMove(sourceApp, nX, nY);

        lastMoveResult = result;
        renderGhosts(result, sourceApp);
    }

    function handleResizeLogic(e) {
        const cols = state.settings.theme.gridColumns || 10;
        const rows = state.settings.theme.gridRows || 6;
        const cW = gridRect.width / cols;
        const cH = gridRect.height / rows;

        const deltaX = Math.round((e.clientX - initResizeX) / cW);
        const deltaY = Math.round((e.clientY - initResizeY) / cH);

        let newCols = Math.max(1, startCols + deltaX);
        let newRows = Math.max(1, startRows + deltaY);

        const x = parseInt(actItem.dataset.x);
        const y = parseInt(actItem.dataset.y);

        // Boundary Check
        if (x + newCols - 1 > cols) newCols = cols - x + 1;
        if (y + newRows - 1 > rows) newRows = rows - y + 1;

        // COLLISION CHECK
        // We prevent the resize if it would overlap with another app
        const vGrid = new VirtualGrid(cols, rows, state.apps);
        const appId = parseInt(actItem.dataset.id);

        if (vGrid.isAreaFree(x, y, newCols, newRows, appId)) {
             // Only apply if space is free
            actItem.style.gridColumnEnd = `span ${newCols}`;
            actItem.style.gridRowEnd = `span ${newRows}`;

            // Store temp state for mouseup
            actItem.dataset.newCols = newCols;
            actItem.dataset.newRows = newRows;
        }
    }

    function renderGhosts(result, sourceApp) {
        ghosts.forEach(g => g.remove());
        ghosts = [];

        const dashboard = qs('#dashboard');

        // Main Ghost
        const mainGhost = createGhost(
            result.targetX || sourceApp.x,
            result.targetY || sourceApp.y,
            sourceApp.cols,
            sourceApp.rows,
            result.possible ? 'valid' : 'invalid'
        );
        dashboard.appendChild(mainGhost);
        ghosts.push(mainGhost);

        // Displaced Ghosts
        if (result.possible && result.displaced && result.displaced.length > 0) {
            result.displaced.forEach(disp => {
                const g = createGhost(
                    disp.nx,
                    disp.ny,
                    disp.app.cols,
                    disp.app.rows,
                    'displaced'
                );
                dashboard.appendChild(g);
                ghosts.push(g);
            });
        }
    }

    function createGhost(x, y, w, h, type) {
        const el = document.createElement('div');
        el.className = `grid-ghost ghost-${type}`;
        applyGridPosition(el, x, y, w, h);
        return el;
    }

    function onMouseUp() {
        // Clean Ghosts
        ghosts.forEach(g => g.remove());
        ghosts = [];

        const appId = parseInt(actItem.dataset.id);
        const app = state.apps.find(a => a.id === appId);

        if (mode === 'move') {
            // FIX: Clean styles immediately
            actItem.classList.remove('moving');
            actItem.style.position = '';
            actItem.style.width = '';
            actItem.style.height = '';
            actItem.style.left = '';
            actItem.style.top = '';
            actItem.style.zIndex = '';

            if (lastMoveResult && lastMoveResult.possible) {
                // Apply Move
                app.x = lastMoveResult.targetX;
                app.y = lastMoveResult.targetY;

                if (lastMoveResult.displaced) {
                    lastMoveResult.displaced.forEach(disp => {
                        const target = state.apps.find(a => a.id === disp.app.id);
                        if (target) {
                            target.x = disp.nx;
                            target.y = disp.ny;
                        }
                    });
                }
                saveGridState();
                renderGrid();
            } else {
                // REVERT: Explicitly restore original grid position
                applyGridPosition(actItem, app.x, app.y, app.cols, app.rows);
                renderGrid();
            }
        }
        else if (mode === 'resize') {
            // Commit Resize
            if (actItem.dataset.newCols) {
                app.cols = parseInt(actItem.dataset.newCols);
                app.rows = parseInt(actItem.dataset.newRows);
                delete actItem.dataset.newCols;
                delete actItem.dataset.newRows;
                saveGridState();
            }
            // Ensure visual consistency
            applyGridPosition(actItem, app.x, app.y, app.cols, app.rows);
            // Remove inline styles that might conflict
            actItem.style.gridColumnEnd = '';
            actItem.style.gridRowEnd = '';
            renderGrid();
        }

        // Reset Global State
        actItem = null;
        lastMoveResult = null;
        mode = null;
        if (updateFrame) cancelAnimationFrame(updateFrame);

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

// Basic toggle
export function toggleEditMode() {
    const isEdit = !state.ui.editMode;
    setState('ui.editMode', isEdit);
    const dashboard = qs('#dashboard');
    const editBtn = qs('#editBtn');
    const addBtn = qs('#addBtn');
    const clearBtn = qs('#clearBtn');

    if (isEdit) {
        dashboard.classList.add('edit-mode');
        editBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
        addBtn.disabled = false;
        if(clearBtn) clearBtn.disabled = false;
        showToast("Edit Mode Enabled");
    } else {
        dashboard.classList.remove('edit-mode');
        editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
        addBtn.disabled = true;
        if(clearBtn) clearBtn.disabled = true;
        saveGridState();
        showToast("Layout Saved");
    }
}