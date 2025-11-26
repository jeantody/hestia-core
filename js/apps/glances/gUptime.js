//
import { fetchGlances } from "./gCore.js";

export function initUptime(el, config) {
    const { url, apiVer } = config;
    const bodyEl = el.querySelector('.glances-body');

    // 1. Setup DOM
    bodyEl.innerHTML = `
        <div class="uptime-container">
            <div class="ut-icon"><i class="fa-solid fa-stopwatch"></i></div>
            <div class="ut-val" id="uptime-val">--</div>
            <div class="ut-boot" id="boot-time">Booted: --</div>
        </div>
    `;

    const titleEl = el.querySelector('.metric-title');
    const valEl = el.querySelector('.metric-value');

    // 2. Return Update Function
    return async () => {
        // Fetch Uptime
        const raw = await fetchGlances(url, apiVer, 'uptime');

        let seconds = 0;

        // --- FIX: Handle String Response ("4 days, 14:14:22") ---
        if (typeof raw === 'string' && raw.includes(':')) {
            // Regex for "X days, HH:MM:SS"
            const daysMatch = raw.match(/(\d+)\s+days?,\s+(\d+):(\d+):(\d+)/);
            // Regex for just "HH:MM:SS" (less than a day)
            const timeMatch = raw.match(/^(\d+):(\d+):(\d+)$/);

            if (daysMatch) {
                const d = parseInt(daysMatch[1]);
                const h = parseInt(daysMatch[2]);
                const m = parseInt(daysMatch[3]);
                const s = parseInt(daysMatch[4]);
                seconds = (d * 86400) + (h * 3600) + (m * 60) + s;
            } else if (timeMatch) {
                const h = parseInt(timeMatch[1]);
                const m = parseInt(timeMatch[2]);
                const s = parseInt(timeMatch[3]);
                seconds = (h * 3600) + (m * 60) + s;
            }
        } else {
            // Handle numeric or object response
            if (typeof raw === 'object' && raw.seconds) seconds = parseFloat(raw.seconds);
            else if (typeof raw === 'string') seconds = parseFloat(raw.split(' ')[0]);
            else seconds = parseFloat(raw);
        }
        // -------------------------------------------------------

        // Calculate Display Values
        const d = Math.floor(seconds / (3600*24));
        const h = Math.floor(seconds % (3600*24) / 3600);
        const m = Math.floor(seconds % 3600 / 60);

        let timeStr = "";
        if (d > 0) timeStr += `${d}d `;
        if (h > 0) timeStr += `${h}h `;
        timeStr += `${m}m`;

        // Update Header
        titleEl.innerText = "SYSTEM UP";
        // If days > 0, show days; else show hours
        valEl.innerText = d > 0 ? `${d} Days` : `${h} Hours`;

        // Update Body
        el.querySelector('#uptime-val').innerText = timeStr || "Just started";

        // Calculate Boot Date
        // Note: This might be slightly off if 'seconds' isn't precise, but it's a good estimate
        if (seconds > 0) {
            const bootDate = new Date(Date.now() - (seconds * 1000));
            el.querySelector('#boot-time').innerText = "Booted: " + bootDate.toLocaleDateString();
        }
    };
}