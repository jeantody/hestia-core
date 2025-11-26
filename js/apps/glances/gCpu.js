//
import { fetchGlances, drawGraph, HISTORY_SIZE } from "./gCore.js";

export function initCpu(el, config) {
    const { url, apiVer, dataPoints } = config;
    const bodyEl = el.querySelector('.glances-body');

    // 1. Setup DOM
    bodyEl.innerHTML = `
        <div class="canvas-wrapper"><canvas class="glances-graph"></canvas></div>
        <div class="graph-meta"><span id="cpu-meta">--</span></div>`;

    const canvas = el.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const titleEl = el.querySelector('.metric-title');
    const valEl = el.querySelector('.metric-value');

    // 2. Setup Resize Observer
    const wrapper = el.querySelector('.canvas-wrapper');
    if (wrapper) {
        new ResizeObserver(() => {
            canvas.width = wrapper.clientWidth;
            canvas.height = wrapper.clientHeight;
            drawGraph(canvas, ctx, dataPoints, '--red');
        }).observe(wrapper);
    }

    // 3. Return Update Function
    return async () => {
        const [cpu, core] = await Promise.all([
            fetchGlances(url, apiVer, 'cpu'),
            fetchGlances(url, apiVer, 'core').catch(() => null)
        ]);

        titleEl.innerText = "CPU LOAD";
        valEl.innerText = cpu.total.toFixed(1) + '%';

        let metaText = "C: ?";

        if (core && core.phys && core.log) {
            // We have explicit Physical vs Logical data
            metaText = `C: ${core.phys} | T: ${core.log}`;
        } else if (cpu.cpucore) {
            // Fallback: Glances v2/v3 often puts total count here
            metaText = `CPU: ${cpu.cpucore}`;
        }

        el.querySelector('#cpu-meta').innerText = metaText;

        dataPoints.push(cpu.total);
        if (dataPoints.length > HISTORY_SIZE) dataPoints.shift();
        drawGraph(canvas, ctx, dataPoints, '--red');
    };
}