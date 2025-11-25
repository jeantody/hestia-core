import { state } from "../state.js";
import { saveState, exportStateToFile, importStateFromFile } from "../storage.js";
import { applyTheme, applyBase16Theme, applyCustomPreset, renderPresetOptions, saveCustomPreset } from "./theme.js";
import { qs, qsa } from "../dom.js";
import { showToast } from "./toasts.js";
import { openColorPicker } from "./colorPicker.js";
import { formatColor } from "../utils.js";
import { renderGridLines, sanitizeGrid } from "../grid.js";

export function initSettingsPanel() {
    // Toggles
    const settingsBtn = qs('#settingsBtn');
    const closeBtn = qs('.settings-modal-header .fa-xmark')?.parentElement; // Assuming icon inside button
    if (settingsBtn) settingsBtn.onclick = toggleSettingsPanel;
    if (closeBtn) closeBtn.onclick = toggleSettingsPanel;

    // Import/Export/Reset
    const exportBtn = qs('button[title="Download current theme and layout"]');
    if (exportBtn) exportBtn.onclick = exportStateToFile;

    const importBtn = qs('button[title="Load theme and layout from a file"]');
    const importInput = qs('#file-import');
    if (importBtn && importInput) {
        importBtn.onclick = () => importInput.click();
        importInput.onchange = async (e) => {
            try {
                await importStateFromFile(e.target.files[0]);
                window.location.reload();
            } catch (err) {
                showToast("Import failed: " + err, "error");
            }
        };
    }

    // Reset calls global wrapper in index.js
    const resetBtn = qs('button[onclick="confirmReset()"]');
    if (resetBtn) resetBtn.onclick = () => window.confirmReset();

    // Initialize UI
    renderPresetOptions();
    syncInputs();
    wireUpInputs();
}

function toggleSettingsPanel() {
    const panel = qs('#settingsPanel');
    const isActive = panel.classList.contains('active');

    if (isActive) {
        panel.classList.remove('active');
        saveState();
        showToast("Settings saved!", "success");
    } else {
        panel.classList.add('active');
        syncInputs();
    }
}

function wireUpInputs() {
    // 1. Text Inputs
    qsa('.setting-val').forEach(input => {
        if (input.id === 'newThemeName') return;
        const key = input.id.replace('input-', '');

        input.onchange = (e) => updateSetting(key, e.target.value);
    });

    // 2. Toggles
    qsa('.toggle-switch input').forEach(input => {
        const key = input.id.replace('input-', '');
        input.onchange = (e) => updateSetting(key, e.target.checked);
    });

    // 3. Color Previews
    qsa('.color-preview').forEach(preview => {
        if (preview.id.includes('modal')) return; // Skip modal previews
        const key = preview.id.replace('preview-', '');

        preview.onclick = () => {
            openColorPicker(preview, (color) => {
                updateSetting(key, color);
            }, () => {
                // Custom trigger
                const native = qs(`#input-${key}.hidden-native-picker`);
                if (native) native.click();
            });
        };
    });

    // 4. Native Pickers
    qsa('.hidden-native-picker').forEach(picker => {
        const key = picker.id.replace('input-', '');
        picker.onchange = (e) => updateSetting(key, e.target.value);
    });

    // 5. Presets
    const presetSelect = qs('#presetSelect');
    if (presetSelect) {
        presetSelect.onchange = (e) => {
            const [type, name] = e.target.value.split(':');
            if (type === 'base16') applyBase16Theme(name);
            if (type === 'custom') applyCustomPreset(name);
            syncInputs();
        };
    }

    // 6. Save Preset
    const savePresetBtn = qs('button[title="Save Preset"]');
    if (savePresetBtn) {
        savePresetBtn.onclick = () => {
            saveCustomPreset(qs('#newThemeName').value);
        };
    }

    // 7. Reset Icons
    qsa('.reset-icon').forEach(icon => {
        const key = icon.id.replace('reset-', '');
        icon.onclick = () => resetSetting(key);
    });
}

function updateSetting(key, value) {
    // Auto-append px for geometry
    if (typeof value === 'string' && !isNaN(value) && value.trim() !== '' &&
       (key.includes('Size') || key.includes('Padding') || key.includes('Radius'))) {
         value += 'px';
    }

    state.settings.theme[key] = value;
    applyTheme(state.settings.theme);
    syncInputs();

    // Special handling for Grid Dimensions
    if (key === 'gridColumns' || key === 'gridRows') {
        renderGridLines();
        sanitizeGrid(); // Prevent apps from falling off the edge!
    }
}

function resetSetting(key) {
    const input = qs(`#input-${key}`);
    const def = input.getAttribute('data-default');
    if (!def) return;

    const isBool = input.type === 'checkbox';
    updateSetting(key, isBool ? (def === 'true') : def);
}

function syncInputs() {
    const theme = state.settings.theme;

    qsa('[id^="input-"]').forEach(input => {
        if (input.classList.contains('hidden-native-picker')) return;

        const key = input.id.replace('input-', '');
        const val = theme[key];

        if (val !== undefined) {
            if (input.type === 'checkbox') input.checked = val;
            else input.value = val;

            const preview = qs(`#preview-${key}`);
            if (preview) preview.style.backgroundColor = val;

            const native = qs(`#input-${key}.hidden-native-picker`);
            if (native) native.value = formatColor(val);

            // Toggle Reset Icon
            const resetBtn = qs(`#reset-${key}`);
            if (resetBtn) {
                const def = input.getAttribute('data-default');
                const isDiff = input.type === 'checkbox' ? (input.checked !== (def === 'true')) : (String(val) !== def);
                if (isDiff) resetBtn.classList.add('visible');
                else resetBtn.classList.remove('visible');
            }
        }
    });
}