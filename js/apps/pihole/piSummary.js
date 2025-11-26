//
import { fetchPihole, formatNumber } from "./piCore.js";

export function initSummary(el, config) {
    const { url, token } = config;
    const bodyEl = el.querySelector('.pihole-body');

    // Setup DOM
    bodyEl.innerHTML = `
        <div class="ph-grid">
            <div class="ph-card total">
                <div class="ph-label">QUERIES</div>
                <div class="ph-val" id="val-total">--</div>
            </div>
            <div class="ph-card blocked">
                <div class="ph-label">BLOCKED</div>
                <div class="ph-val" id="val-blocked">--</div>
            </div>
            <div class="ph-card percent">
                <div class="ph-label">RATIO</div>
                <div class="ph-val" id="val-percent">--%</div>
                <div class="ph-bar-bg"><div class="ph-bar-fill" id="bar-percent" style="width:0%"></div></div>
            </div>
        </div>
    `;

    const statusDot = el.querySelector('.ph-status-dot');
    const statusText = el.querySelector('.ph-status-text');

    return async () => {
        // Ensure URL doesn't have a trailing slash for cleaner concatenation
        const cleanBase = url.endsWith('/') ? url.slice(0, -1) : url;

        // Target: /pi-api/api/stats/summary
        const targetUrl = `${cleanBase}/stats/summary`;

        // PASS cleanBase as 4th arg so piCore can find /auth
        const data = await fetchPihole(targetUrl, {}, token, cleanBase);

        // v6 Data Structure
        const queries = data.queries || {};
        el.querySelector('#val-total').innerText = formatNumber(queries.total);
        el.querySelector('#val-blocked').innerText = formatNumber(queries.blocked);

        const percent = parseFloat(queries.percent_blocked || 0).toFixed(1);
        el.querySelector('#val-percent').innerText = percent + '%';
        el.querySelector('#bar-percent').style.width = percent + '%';

        statusDot.className = 'ph-status-dot active';
        statusText.innerText = 'ACTIVE';
    };
}