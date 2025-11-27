// js/grid.js
import { state } from "./state.js";
import { saveState } from "./storage.js";
import { createEl, qs, qsa } from "./dom.js";
import { registry } from "./registry.js";
import { VirtualGrid } from "./grid/virtualGrid.js";

// -----------------------------
// GRID RENDERING (Reconciliation + FLIP Animation)
// -----------------------------

export async function renderGrid(dragInfo = null) {
    const dashboard = qs('#dashboard');
    if (!dashboard) return;

    renderGridLines();

    const apps = state.apps;
    const domMap = new Map();
    const prevRects = new Map();

    // 1. Snapshot OLD Positions (First)
    qsa('.app-card', dashboard).forEach(el => {
        const id = parseInt(el.dataset.id);
        if (id) {
            domMap.set(id, el);
            prevRects.set(id, el.getBoundingClientRect());
        }
    });

    // Override the dragged item's "Old" position with its "Floating" position
    if (dragInfo && dragInfo.id && dragInfo.rect) {
        prevRects.set(dragInfo.id, dragInfo.rect);
    }

    // 2. Update DOM (Last)
    for (const app of apps) {
        let el = domMap.get(app.id);

        if (el) {
            // Check for position/size changes
            const currentX = parseInt(el.dataset.x);
            const currentY = parseInt(el.dataset.y);
            const currentW = parseInt(el.dataset.cols);
            const currentH = parseInt(el.dataset.rows);

            if (currentX !== app.x || currentY !== app.y || currentW !== app.cols || currentH !== app.rows) {
                applyGridPosition(el, app.x, app.y, app.cols, app.rows);
            }

            // Check for content changes
            const dataHash = JSON.stringify(app.data || {}) + app.name;
            const currentHash = el.dataset.contentHash;

            if (app.data?.bgColor) el.style.backgroundColor = app.data.bgColor;
            if (app.data?.textColor) el.style.color = app.data.textColor;

            if (dataHash !== currentHash) {
                await mountAppContent(el, app);
                el.dataset.contentHash = dataHash;
            }

            domMap.delete(app.id);
        } else {
            // Create New
            el = await createAppElement(app);
            dashboard.appendChild(el);
        }
    }

    // Cleanup removed apps
    domMap.forEach(el => el.remove());

    // 3. Invert & Play (Animate)
    // Double RAF ensures the DOM update is fully processed before we calculate deltas
    requestAnimationFrame(() => {
        const animations = [];

        apps.forEach(app => {
            const el = document.getElementById(`app-${app.id}`);
            const oldRect = prevRects.get(app.id);

            if (el && oldRect) {
                const newRect = el.getBoundingClientRect();

                // Calculate Delta
                const dX = oldRect.left - newRect.left;
                const dY = oldRect.top - newRect.top;

                // Only animate significant moves
                if (Math.abs(dX) > 1 || Math.abs(dY) > 1) {
                    // INVERT (Start State): Move back to old position instantly
                    el.style.transition = 'none';
                    el.style.transform = `translate(${dX}px, ${dY}px)`;
                    el.style.zIndex = '100'; // Float above others

                    animations.push(el);
                }
            }
        });

        // PLAY (End State): Remove transform smoothly
        // Nested RAF forces the browser to paint the 'Invert' state first
        requestAnimationFrame(() => {
            animations.forEach(el => {
                el.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                el.style.transform = '';

                // Cleanup Z-Index
                const cleanup = () => {
                    el.style.zIndex = '';
                    el.style.transition = '';
                    el.removeEventListener('transitionend', cleanup);
                };
                el.addEventListener('transitionend', cleanup);
            });
        });
    });
}

// ... (Rest of helpers remain identical) ...

async function createAppElement(app) {
    const el = createEl('div', {
        class: 'app-card',
        attrs: {
            id: `app-${app.id}`,
            'data-id': app.id
        }
    });

    applyGridPosition(el, app.x, app.y, app.cols, app.rows);

    if (app.data?.bgColor) el.style.backgroundColor = app.data.bgColor;
    if (app.data?.textColor) el.style.color = app.data.textColor;

    el.dataset.contentHash = JSON.stringify(app.data || {}) + app.name;

    await mountAppContent(el, app);

    return el;
}

async function mountAppContent(el, app) {
    const appDef = registry.get(app.subtype);
    let innerHTML = 'Unknown App';
    if (appDef) {
        const appInstance = new appDef.Class();
        innerHTML = await appInstance.render(app);
        el.innerHTML = `
            ${innerHTML}
            <div class="resize-handle"></div>
            <div class="card-meta">${app.cols}x${app.rows}</div>
            <div class="edit-btn" title="Edit App"><i class="fa-solid fa-pencil"></i></div>
            <div class="delete-btn" title="Delete App"><i class="fa-solid fa-trash"></i></div>
        `;
        if (appInstance.onMount) setTimeout(() => appInstance.onMount(el, app), 0);
    } else {
        el.innerHTML = innerHTML;
    }
}

export function applyGridPosition(el, x, y, w, h) {
    el.style.gridColumn = `${x} / span ${w}`;
    el.style.gridRow = `${y} / span ${h}`;
    el.dataset.x = x;
    el.dataset.y = y;
    el.dataset.cols = w;
    el.dataset.rows = h;
    const meta = el.querySelector('.card-meta');
    if (meta) meta.innerText = `${w}x${h}`;
}

export function renderGridLines() {
    const gridLines = qs('#gridLines');
    if (!gridLines) return;
    const cols = parseInt(state.settings.theme.gridColumns) || 10;
    const rows = parseInt(state.settings.theme.gridRows) || 6;
    const count = cols * rows;
    if (gridLines.childElementCount !== count) {
        gridLines.innerHTML = '';
        for (let i = 0; i < count; i++) {
            gridLines.appendChild(createEl('div', { class: 'grid-cell' }));
        }
    }
}

export function findEmptySlot(w, h) {
    const cols = parseInt(state.settings.theme.gridColumns) || 10;
    const rows = parseInt(state.settings.theme.gridRows) || 6;
    const vGrid = new VirtualGrid(cols, rows, state.apps);
    for (let y = 1; y <= rows; y++) {
        for (let x = 1; x <= cols; x++) {
            if (x + w - 1 > cols || y + h - 1 > rows) continue;
            if (vGrid.isAreaFree(x, y, w, h)) return { x, y };
        }
    }
    return { x: 1, y: 1 };
}

export function saveGridState() { saveState(); }
export function sanitizeGrid() {}