// js/grid/virtualGrid.js

export class VirtualGrid {
    constructor(cols, rows, apps) {
        this.cols = cols;
        this.rows = rows;
        this.matrix = this.buildMatrix(apps);
    }

    // Build a 2D representation of the grid [row][col]
    buildMatrix(apps) {
        const m = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));

        for (const app of apps) {
            for (let r = 0; r < app.rows; r++) {
                for (let c = 0; c < app.cols; c++) {
                    const y = app.y + r - 1; // Convert 1-based to 0-based
                    const x = app.x + c - 1;
                    if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
                        m[y][x] = app.id;
                    }
                }
            }
        }
        return m;
    }

    // Check if a specific area is empty (optionally ignoring specific app IDs)
    isAreaFree(x, y, w, h, excludeIds = []) {
        const excludes = Array.isArray(excludeIds) ? excludeIds : [excludeIds];

        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
                const targetY = y + r - 1;
                const targetX = x + c - 1;

                // 1. Bounds check
                if (targetY < 0 || targetY >= this.rows || targetX < 0 || targetX >= this.cols) {
                    return false;
                }

                // 2. Occupancy check
                const cell = this.matrix[targetY][targetX];
                if (cell !== null && !excludes.includes(cell)) {
                    return false;
                }
            }
        }
        return true;
    }

    // Scan a rectangular area for ANY app ID (returns the first collision)
    scanForCollision(x, y, w, h, ignoreId) {
        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
                const targetY = y + r - 1;
                const targetX = x + c - 1;

                if (targetY >= 0 && targetY < this.rows && targetX >= 0 && targetX < this.cols) {
                    const cell = this.matrix[targetY][targetX];
                    if (cell !== null && cell !== ignoreId) {
                        return cell;
                    }
                }
            }
        }
        return null;
    }

    // Helper: Check if two rectangles intersect
    rectsIntersect(a, b) {
        return (a.x < b.x + b.w && a.x + a.w > b.x &&
                a.y < b.y + b.h && a.y + a.h > b.y);
    }
}