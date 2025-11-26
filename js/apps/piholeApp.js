//
import { BaseApp } from "./baseApp.js";
import { registry } from "../registry.js";
import { initSummary } from "./pihole/piSummary.js";

export class PiholeApp extends BaseApp {
    async render(app) {
        return `
            <div class="app-content app-type-pihole">
                <div class="pihole-header">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <img src="https://pi-hole.net/images/favicon.png" style="width:16px; filter:grayscale(100%);">
                        <span class="ph-title">PI-HOLE</span>
                    </div>
                    <div class="ph-status-wrapper">
                        <div class="ph-status-dot"></div>
                        <span class="ph-status-text">--</span>
                    </div>
                </div>
                <div class="pihole-body"></div>
            </div>`;
    }

    onMount(el, app) {
        // DEFAULT TO PROXY URL
        // We use the relative path "/pi-api" which Nginx will forward to 192.168.100.85
        const defaultUrl = '/pi-api/admin/api.php';

        const rawUrl = app.data.url || defaultUrl;
        const token = app.data.token || '';
        const intervalTime = parseInt(app.data.interval) || 5000;

        const config = { url: rawUrl, token };

        const updateLogic = initSummary(el, config);

        const runUpdate = async () => {
            if (!el.isConnected) return;
            try {
                if (updateLogic) await updateLogic();
            } catch (err) {
                console.error("[Pi-hole] Error:", err);
                const statusText = el.querySelector('.ph-status-text');
                if (statusText) statusText.innerText = "ERR";
            }
        };

        const timer = setInterval(runUpdate, intervalTime);
        runUpdate();
    }
}

registry.register('pihole', PiholeApp, {
    label: 'Pi-hole Stats',
    category: 'data',
    defaultSize: { cols: 2, rows: 2 },
    settings: [
        // Note the instructions in placeholder
        { name: 'url', label: 'API URL (Use /pi-api/...)', type: 'text', defaultValue: '/pi-api/admin/api.php' },
        { name: 'token', label: 'API Token / Password', type: 'text', placeholder: 'From Pi-hole Settings > API' },
        { name: 'interval', label: 'Interval (ms)', type: 'text', defaultValue: '5000' }
    ],
    css: `
        /* ... (Reuse the CSS from the previous message) ... */
        .app-type-pihole {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            display: flex; flex-direction: column;
            padding: 12px; box-sizing: border-box;
            gap: 10px; background: inherit; color: inherit;
        }
        .pihole-header {
            display: flex; justify-content: space-between; align-items: center;
            flex-shrink: 0;
            border-bottom: 1px solid var(--border-dim);
            padding-bottom: 8px; margin-bottom: 5px;
        }
        .ph-title { font-weight: bold; font-size: 0.8rem; letter-spacing: 1px; color: var(--text-main); }
        .ph-status-wrapper { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; }
        .ph-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); transition: all 0.3s; }
        .ph-status-dot.active { background: var(--status-success); box-shadow: 0 0 8px var(--status-success); }
        .ph-status-dot.disabled { background: var(--status-error); }
        .ph-status-text { font-weight: bold; color: var(--text-muted); }
        .pihole-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .ph-grid { display: grid; grid-template-rows: repeat(3, 1fr); gap: 8px; height: 100%; }
        .ph-card {
            background: rgba(0,0,0,0.15); border: 1px solid var(--border-dim); border-radius: var(--radius);
            padding: 0 12px; display: flex; align-items: center; justify-content: space-between;
            position: relative; overflow: hidden;
        }
        .ph-label { font-size: 0.65rem; font-weight: bold; color: var(--text-muted); }
        .ph-val { font-size: 1.2rem; font-weight: bold; font-family: monospace; z-index: 2; }
        .ph-card.total .ph-val { color: var(--text-main); }
        .ph-card.blocked .ph-val { color: var(--status-info); }
        .ph-card.percent .ph-val { color: var(--status-success); }
        .ph-bar-bg { position: absolute; bottom: 0; left: 0; width: 100%; height: 4px; background: rgba(255,255,255,0.05); }
        .ph-bar-fill { height: 100%; background: var(--status-success); transition: width 1s ease-out; }
        .app-card[data-cols="1"] .ph-label { font-size: 0.55rem; }
        .app-card[data-cols="1"] .ph-val { font-size: 1rem; }
    `
});