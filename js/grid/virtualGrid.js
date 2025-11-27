// js/grid/virtualGrid.js

export class VirtualGrid {
    constructor(cols, rows, apps) {
        this.cols = cols;
        this.rows = rows;
        this.apps = apps;
        this.matrix = this.buildMatrix(apps);
        this.appMap = new Map(apps.map(a => [a.id, a]));
    }

    buildMatrix(apps) {
        const m = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
        for (const app of apps) {
            for (let r = 0; r < app.rows; r++) {
                for (let c = 0; c < app.cols; c++) {
                    const y = app.y + r - 1;
                    const x = app.x + c - 1;
                    if (this.isInBounds(x, y)) {
                        m[y][x] = app.id;
                    }
                }
            }
        }
        return m;
    }

    isInBounds(x, y) {
        return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
    }

    /**
     * Simple boolean check for empty space (Used by Resize Logic)
     */
    isAreaFree(x, y, w, h, ignoreId = null) {
        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
                const targetY = y + r - 1;
                const targetX = x + c - 1;

                // 1. Check Bounds
                if (!this.isInBounds(targetX, targetY)) return false;

                // 2. Check Collision
                const cellId = this.matrix[targetY][targetX];
                if (cellId !== null && cellId !== ignoreId) {
                    return false;
                }
            }
        }
        return true;
    }

    getAppsInArea(x, y, w, h, ignoreId = null) {
        const foundIds = new Set();
        const foundApps = [];

        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
                const targetY = y + r - 1;
                const targetX = x + c - 1;

                if (!this.isInBounds(targetX, targetY)) continue;

                const cellId = this.matrix[targetY][targetX];
                if (cellId !== null && cellId !== ignoreId) {
                    if (!foundIds.has(cellId)) {
                        foundIds.add(cellId);
                        foundApps.push(this.appMap.get(cellId));
                    }
                }
            }
        }
        return foundApps;
    }

    checkMove(sourceApp, targetX, targetY) {
        // 1. Basic Boundary Check
        if (targetX < 1 || targetY < 1 ||
            targetX + sourceApp.cols - 1 > this.cols ||
            targetY + sourceApp.rows - 1 > this.rows) {
            return { possible: false, reason: 'bounds' };
        }

        const collisions = this.getAppsInArea(targetX, targetY, sourceApp.cols, sourceApp.rows, sourceApp.id);

        // CASE A: FREE MOVE
        if (collisions.length === 0) {
            return { possible: true, type: 'move', targetX, targetY, displaced: [] };
        }

        // CASE B: ATOMIC SWAP (Big moves to Small/Empty)
        // Check integrity: Are all collided apps fully inside our footprint?
        const isIntegritySound = collisions.every(c => {
            return c.x >= targetX &&
                   c.y >= targetY &&
                   (c.x + c.cols) <= (targetX + sourceApp.cols) &&
                   (c.y + c.rows) <= (targetY + sourceApp.rows);
        });

        if (isIntegritySound) {
            const proposedMoves = collisions.map(c => {
                const relX = c.x - targetX;
                const relY = c.y - targetY;
                return {
                    app: c,
                    nx: sourceApp.x + relX,
                    ny: sourceApp.y + relY
                };
            });

            if (this.canFitAt(proposedMoves, [sourceApp.id, ...collisions.map(c => c.id)])) {
                return { possible: true, type: 'swap', targetX, targetY, displaced: proposedMoves };
            }
        }

        // CASE C: REVERSE CLEARANCE (Small moves to Big)
        // If we hit exactly one app that is bigger/different
        if (collisions.length === 1) {
            const bigApp = collisions[0];

            // Calculate Offset: Cursor vs Big App Origin
            const offsetX = targetX - bigApp.x;
            const offsetY = targetY - bigApp.y;

            // Project Shadow: Big App moves to Source Origin, maintaining alignment
            const shadowX = sourceApp.x - offsetX;
            const shadowY = sourceApp.y - offsetY;

            const moveProposal = [{ app: bigApp, nx: shadowX, ny: shadowY }];

            // CRITICAL FIX: If swapping Small -> Big, snap Small to Big's Origin
            // This prevents the Small app from "floating" inside the Big app's old hole
            // and potentially colliding with the Big App's new location if close by.
            if (this.canFitAt(moveProposal, [sourceApp.id, bigApp.id])) {
                return {
                    possible: true,
                    type: 'swap',
                    targetX: bigApp.x, // SNAP TO ORIGIN
                    targetY: bigApp.y, // SNAP TO ORIGIN
                    displaced: moveProposal
                };
            }

            // Fallback: Try snapping Big App strictly to Source Origin
            const strictProposal = [{ app: bigApp, nx: sourceApp.x, ny: sourceApp.y }];
            if (this.canFitAt(strictProposal, [sourceApp.id, bigApp.id])) {
                 return {
                    possible: true,
                    type: 'swap',
                    targetX: bigApp.x,
                    targetY: bigApp.y,
                    displaced: strictProposal
                };
            }
        }

        return { possible: false, reason: 'collision' };
    }

    canFitAt(moves, ignoreIds) {
        for (const m of moves) {
            // 1. Bounds Check
            if (m.nx < 1 || m.ny < 1 ||
                m.nx + m.app.cols - 1 > this.cols ||
                m.ny + m.app.rows - 1 > this.rows) {
                return false;
            }

            // 2. Collision Check
            const obstacles = this.getAppsInArea(m.nx, m.ny, m.app.cols, m.app.rows, null);
            for (const obs of obstacles) {
                if (!ignoreIds.includes(obs.id)) return false;
            }
        }
        return true;
    }
}