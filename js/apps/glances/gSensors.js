import { fetchGlances } from "./gCore.js";

export function initSensors(el, config) {
    const { url, apiVer } = config;
    const bodyEl = el.querySelector('.glances-body');

    bodyEl.innerHTML = `<div class="sensor-grid" id="sensor-grid">Scanning...</div>`;
    const titleEl = el.querySelector('.metric-title');
    const valEl = el.querySelector('.metric-value');

    // 2. Return Update Function
    return async () => {
        const rawSensors = await fetchGlances(url, apiVer, 'sensors');
        let sensors = Array.isArray(rawSensors) ? rawSensors : Object.values(rawSensors || {});

        // Filter weird units if needed
        if (sensors.length > 0 && sensors[0].unit !== 'C' && sensors[0].unit !== 'F') {
             sensors = sensors.filter(s => s.unit === 'C' || s.unit === 'F');
        }

        titleEl.innerText = "TEMPS";
        valEl.innerText = sensors.length > 0 ? sensors.length + " Active" : "--";

        const grid = el.querySelector('#sensor-grid');
        grid.innerHTML = '';

        if (sensors.length > 0) {
            sensors.forEach(s => {
                let label = s.label || s.adapter || 'Unknown';
                if (label.startsWith('Package id')) label = 'Package';
                else if (label.startsWith('Core')) label = label.replace('Core ', 'Core');
                else if (label === 'Composite') label = 'CPU';
                else if (label.startsWith('acpitz')) label = 'Mobo ' + (label.split(' ')[1] || '');
                else if (label.startsWith('nvme')) label = 'SSD';

                const max = s.critical || 100;
                const warn = s.warning || 80;

                // Determine State Class
                let stateClass = 'normal';
                if (s.value >= max) stateClass = 'critical';
                else if (s.value >= warn) stateClass = 'warning';

                // Create Card
                const box = document.createElement('div');
                box.className = `sensor-box ${stateClass}`;
                box.innerHTML = `
                    <div class="sb-name">${label}</div>
                    <div class="sb-temp">${s.value.toFixed(0)}°</div>
                `;
                grid.appendChild(box);
            });
        } else {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;">No sensors found</div>';
        }
    };
}