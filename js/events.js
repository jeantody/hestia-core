// js/events.js
import { state, setState } from "./state.js";
import { qs } from "./dom.js";
import { saveGridState, renderGrid, applyGridPosition } from "./grid.js";
import { VirtualGrid } from "./grid/virtualGrid.js";
import { showToast } from "./ui/toasts.js";

// Drag State
let actItem = null;
let ghost = null;
let dragOffsetX, dragOffsetY; // Mouse offset within card
let sGX, sGY, sC, sR; // Start Grid X, Y, Cols, Rows
let mode = null;
let gridRect;
let updateFrame = null;

// Swap Throttling
let lastSwapTime = 0;
const SWAP_COOLDOWN = 200;

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

        if (e.target.classList.contains('resize-handle')) {
            mode = 'resize';
            actItem = e.target.parentElement;
        } else if (e.target.closest('.app-card')) {
            mode = 'move';
            actItem = e.target.closest('.app-card');
        } else {
            return;
        }

        e.preventDefault();

        // Capture Grid Start
        sGX = parseInt(actItem.dataset.x);
        sGY = parseInt(actItem.dataset.y);
        sC = parseInt(actItem.dataset.cols);
        sR = parseInt(actItem.dataset.rows);

        gridRect = gridLines.getBoundingClientRect();
        actItem.classList.add('moving');

        // --- GHOST & FLOATING LOGIC ---
        if (mode === 'move') {
            const rect = actItem.getBoundingClientRect();

            // Calculate where we grabbed the card relative to its top-left
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;

            // 1. Create Ghost
            ghost = document.createElement('div');
            ghost.classList.add('grid-ghost');
            applyGridPosition(ghost, sGX, sGY, sC, sR);
            dashboard.appendChild(ghost);

            // 2. Detach Card
            actItem.style.width = rect.width + 'px';
            actItem.style.height = rect.height + 'px';
            actItem.style.position = 'fixed';
            actItem.style.left = rect.left + 'px';
            actItem.style.top = rect.top + 'px';
            actItem.style.zIndex = '1000';
        }
        // RESIZE MODE SETUP
        else if (mode === 'resize') {
            // For resize, we still need initX/Y for delta calculation
            // We store them on the element dataset or just reuse the vars
            // But since we switched move to Absolute, let's keep Resize on Delta for now
            // as resize is naturally a "delta" operation.
            actItem.dataset.initX = e.clientX;
            actItem.dataset.initY = e.clientY;
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!actItem) return;

        // Handle Floating Movement (Immediate Visual Feedback)
        if (mode === 'move') {
            actItem.style.left = (e.clientX - dragOffsetX) + 'px';
            actItem.style.top = (e.clientY - dragOffsetY) + 'px';
        }

        // Throttled Grid Logic
        if (updateFrame) return;
        updateFrame = requestAnimationFrame(() => {
            handleDrag(e);
            updateFrame = null;
        });
    }

    function handleDrag(e) {
        const cols = state.settings.theme.gridColumns || 10;
        const rows = state.settings.theme.gridRows || 6;
        const cW = gridRect.width / cols;
        const cH = gridRect.height / rows;

        if (mode === 'move') {
            // --- ABSOLUTE POSITION CALCULATION ---
            // Instead of delta, we calculate exactly where the card is floating
            const rawX = e.clientX - dragOffsetX - gridRect.left;
            const rawY = e.clientY - dragOffsetY - gridRect.top;

            // Map pixel position to Grid Coordinates
            // We simply round to the nearest cell
            let nX = Math.round(rawX / cW) + 1;
            let nY = Math.round(rawY / cH) + 1;

            // Clamp to Grid
            if (nX < 1) nX = 1;
            if (nY < 1) nY = 1;
            if (nX + sC - 1 > cols) nX = cols - sC + 1;
            if (nY + sR - 1 > rows) nY = rows - sR + 1;

            const currentApp = state.apps.find(a => a.id === parseInt(actItem.dataset.id));

            // Optimization: If we haven't crossed a grid line, do nothing
            if (currentApp.x === nX && currentApp.y === nY) return;

            const vGrid = new VirtualGrid(cols, rows, state.apps);
            const targetId = vGrid.scanForCollision(nX, nY, sC, sR, currentApp.id);

            // Case A: Free Move
            if (!targetId) {
                if (vGrid.isAreaFree(nX, nY, sC, sR, currentApp.id)) {
                    currentApp.x = nX;
                    currentApp.y = nY;
                    renderGrid();
                    updateGhost(currentApp);
                }
            }
            // Case B: Collision
            else {
                if (Date.now() - lastSwapTime < SWAP_COOLDOWN) return;

                const targetApp = state.apps.find(a => a.id === targetId);
                let swapSuccess = false;

                // 1. Try Flow Swap
                if (tryFlowSwap(currentApp, targetApp, vGrid)) {
                    swapSuccess = true;
                }
                // 2. Try Standard/Smart Swaps
                else {
                    const sourceOld = {x: currentApp.x, y: currentApp.y, w: currentApp.cols, h: currentApp.rows};
                    const sourceNew = {x: nX, y: nY, w: currentApp.cols, h: currentApp.rows};

                    const bestSpot = vGrid.findBestSwapLocation(
                        sourceOld, sourceNew,
                        targetApp.cols, targetApp.rows,
                        [currentApp.id, targetApp.id]
                    );

                    const canSourceMove = vGrid.isAreaFree(targetApp.x, targetApp.y, currentApp.cols, currentApp.rows, [currentApp.id, targetApp.id]);

                    if (bestSpot && canSourceMove) {
                        currentApp.x = targetApp.x;
                        currentApp.y = targetApp.y;
                        targetApp.x = bestSpot.x;
                        targetApp.y = bestSpot.y;
                        swapSuccess = true;
                    } else {
                        const canTargetMove = vGrid.isAreaFree(currentApp.x, currentApp.y, targetApp.cols, targetApp.rows, [currentApp.id, targetApp.id]);
                        if (canTargetMove && canSourceMove) {
                            const oldX = currentApp.x;
                            const oldY = currentApp.y;
                            currentApp.x = targetApp.x;
                            currentApp.y = targetApp.y;
                            targetApp.x = oldX;
                            targetApp.y = oldY;
                            swapSuccess = true;
                        }
                    }
                }

                if (swapSuccess) {
                    lastSwapTime = Date.now();
                    // Note: No need to re-anchor initX here because
                    // we are now using Absolute Position (nX calculated from rawX)
                    // which is stateless and self-correcting!
                    renderGrid();
                    updateGhost(currentApp);
                }
            }

        } else if (mode === 'resize') {
            // Resize still uses Delta logic because it feels better for stretching
            const initX = parseFloat(actItem.dataset.initX);
            const initY = parseFloat(actItem.dataset.initY);

            const gDx = Math.round((e.clientX - initX) / cW);
            const gDy = Math.round((e.clientY - initY) / cH);

            let nC = sC + gDx;
            let nR = sR + gDy;

            if (nC < 1) nC = 1;
            if (nR < 1) nR = 1;
            if (sGX + nC - 1 > cols) nC = cols - sGX + 1;
            if (sGY + nR - 1 > rows) nR = rows - sGY + 1;

            const currentApp = state.apps.find(a => a.id === parseInt(actItem.dataset.id));
            if (currentApp.cols === nC && currentApp.rows === nR) return;

            const vGrid = new VirtualGrid(cols, rows, state.apps);

            if (vGrid.isAreaFree(sGX, sGY, nC, nR, currentApp.id)) {
                currentApp.cols = nC;
                currentApp.rows = nR;
                renderGrid();
            }
        }
    }

    function updateGhost(app) {
        if (ghost) {
            applyGridPosition(ghost, app.x, app.y, app.cols, app.rows);
        }
    }

    function onMouseUp() {
        // Clean up Ghost
        if (ghost) {
            ghost.remove();
            ghost = null;
        }

        // Clean up ActItem
        if (actItem) {
            actItem.classList.remove('moving');

            // Remove inline styles (position:fixed, etc)
            actItem.style.position = '';
            actItem.style.width = '';
            actItem.style.height = '';
            actItem.style.left = '';
            actItem.style.top = '';
            actItem.style.zIndex = '';

            // Clean up temp data
            delete actItem.dataset.initX;
            delete actItem.dataset.initY;

            saveGridState();
            renderGrid();
        }

        actItem = null;
        if (updateFrame) cancelAnimationFrame(updateFrame);
        updateFrame = null;

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

// Flow Logic Helpers (Same as before)
function tryFlowSwap(source, target, vGrid) {
    const minX = Math.min(source.x, target.x);
    const minY = Math.min(source.y, target.y);

    const yOverlap = Math.max(0, Math.min(source.y + source.rows, target.y + target.rows) - Math.max(source.y, target.y));
    if (yOverlap > 0) {
        if (source.x < target.x) {
            if (attemptPlacement(target, minX, target.y, source, minX + target.cols, source.y, vGrid)) return true;
        } else {
            if (attemptPlacement(source, minX, source.y, target, minX + source.cols, target.y, vGrid)) return true;
        }
    }

    const xOverlap = Math.max(0, Math.min(source.x + source.cols, target.x + target.cols) - Math.max(source.x, target.x));
    if (xOverlap > 0) {
        if (source.y < target.y) {
            if (attemptPlacement(target, target.x, minY, source, source.x, minY + target.rows, vGrid)) return true;
        } else {
            if (attemptPlacement(source, source.x, minY, target, target.x, minY + source.rows, vGrid)) return true;
        }
    }

    return false;
}

function attemptPlacement(itemA, ax, ay, itemB, bx, by, vGrid) {
    const ignore = [itemA.id, itemB.id];
    const aFits = vGrid.isAreaFree(ax, ay, itemA.cols, itemA.rows, ignore);
    const bFits = vGrid.isAreaFree(bx, by, itemB.cols, itemB.rows, ignore);

    if (aFits && bFits) {
        itemA.x = ax; itemA.y = ay;
        itemB.x = bx; itemB.y = by;
        return true;
    }
    return false;
}

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
        editBtn.title = 'Save Layout';
        editBtn.classList.remove('btn-primary');
        editBtn.style.borderColor = "var(--brand-primary)";
        addBtn.disabled = false;
        if(clearBtn) clearBtn.disabled = false;
        showToast("Edit Mode Enabled");
    } else {
        dashboard.classList.remove('edit-mode');
        editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
        editBtn.title = 'Edit Layout';
        editBtn.classList.add('btn-primary');
        addBtn.disabled = true;
        if(clearBtn) clearBtn.disabled = true;
        saveGridState();
        showToast("Layout Saved");
    }
}