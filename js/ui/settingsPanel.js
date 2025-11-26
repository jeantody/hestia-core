import { state } from "../state.js";
import { saveState, exportStateToFile, importStateFromFile } from "../storage.js";
import { applyTheme, applyBase16Theme, applyCustomPreset, renderPresetOptions, saveCustomPreset } from "./theme.js";
import { qs, qsa } from "../dom.js";
import { showToast } from "./toasts.js";
import { openColorPicker } from "./colorPicker.js";
import { formatColor, toHex,resolveToHex } from "../utils.js";
import { renderGridLines, sanitizeGrid } from "../grid.js";
import { logger } from "../logger.js";
import { DEFAULT_THEME } from "../constants.js";

export function initSettingsPanel() {
    const settingsBtn = qs('#settingsBtn');
    const closeBtn = qs('.settings-modal-header .fa-xmark')?.parentElement;
    if (settingsBtn) settingsBtn.onclick = toggleSettingsPanel;
    if (closeBtn) closeBtn.onclick = toggleSettingsPanel;

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

    const resetBtn = qs('button[onclick="confirmReset()"]');
    if (resetBtn) resetBtn.onclick = () => window.confirmReset();

    renderPresetOptions();
    wireUpInputs();

    // Wait a tick for DOM updates
    requestAnimationFrame(syncInputs);
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
        requestAnimationFrame(syncInputs);
    }
}

function wireUpInputs() {
    qsa('.setting-val').forEach(input => {
        if (input.id === 'newThemeName') return;
        const key = input.id.replace('input-', '');
        input.onchange = (e) => updateSetting(key, e.target.value);
    });
    qsa('.toggle-switch input').forEach(input => {
        const key = input.id.replace('input-', '');
        input.onchange = (e) => updateSetting(key, e.target.checked);
    });

    qsa('.color-preview').forEach(preview => {
        if (preview.id.includes('modal')) return;
        const key = preview.id.replace('preview-', '');

        preview.onclick = () => {
            openColorPicker(preview, (colorVar) => {
                updateSetting(key, colorVar);
            }, () => {
                // FIX: Target the Unique ID 'native-input-...'
                const native = qs(`#native-input-${key}`);
                if (native) native.click();
            });
        };
    });

    // FIX: Wire up native pickers with new ID format
    qsa('.hidden-native-picker').forEach(picker => {
        // ID is now "native-input-bgCanvas", so replace "native-input-"
        const key = picker.id.replace('native-input-', '');
        picker.onchange = (e) => updateSetting(key, e.target.value);
    });

    const presetSelect = qs('#presetSelect');
    if (presetSelect) {
        presetSelect.onchange = (e) => {
            const [type, name] = e.target.value.split(':');
            if (type === 'base16') applyBase16Theme(name);
            if (type === 'custom') applyCustomPreset(name);
            syncInputs();
        };
    }
    const savePresetBtn = qs('button[title="Save Preset"]');
    if (savePresetBtn) {
        savePresetBtn.onclick = () => {
            saveCustomPreset(qs('#newThemeName').value);
        };
    }
    qsa('.reset-icon').forEach(icon => {
        const key = icon.id.replace('reset-', '');
        icon.onclick = () => resetSetting(key);
    });
}

/**
 * INTELLIGENT DEFAULT RESOLVER
 * Finds the correct default value based on the ACTIVE PALETTE.
 */
function resolveThemeDefault(key) {
    const theme = state.settings.theme;
    const activePal = theme.activePalette;

    // 1. If we have an active Base16 palette, look up the color from there
    if (activePal && window.HESTIA_PALETTES && window.HESTIA_PALETTES[activePal]) {
        const palette = window.HESTIA_PALETTES[activePal];

        // Map Semantic Key -> Base16 Key (Same mapping as in theme.js)
        const mapping = {
            'bgCanvas': 'base00', 'bgSurface': 'base01', 'bgHighlight': 'base02',
            'borderDim': 'base02', 'borderBright': 'base03',
            'textMain': 'base05', 'textMuted': 'base04', 'textFaint': 'base03', 'textInverse': 'base00',
            'brandPrimary': 'base0B', 'brandSecondary': 'base0D', 'brandTertiary': 'base0E',
            'statusError': 'base08', 'statusWarning': 'base09', 'statusSuccess': 'base0B'
        };

        const baseKey = mapping[key];
        if (baseKey && palette[baseKey]) {
            return formatColor(palette[baseKey]);
        }
    }

    // 2. If no palette is active (or key is geometry/font), use the System Default
    return DEFAULT_THEME[key];
}

function updateSetting(key, value) {
    if (typeof value === 'string' && !isNaN(value) && value.trim() !== '' &&
       (key.includes('Size') || key.includes('Padding') || key.includes('Radius'))) {
         value += 'px';
    }
    state.settings.theme[key] = value;
    applyTheme(state.settings.theme);
    syncInputs();
    if (key === 'gridColumns' || key === 'gridRows') {
        renderGridLines();
        sanitizeGrid();
    }
}

function resetSetting(key) {
    // FIX: Use the smart resolver instead of hardcoded constant
    let def = resolveThemeDefault(key);

    // Fallback to attribute if logic fails (rare)
    if (def === undefined) {
        const input = qs(`#input-${key}`);
        if (input) def = input.getAttribute('data-default');
    }

    if (def === undefined) return;

    // Handle boolean toggles vs strings
    const input = qs(`#input-${key}`);
    const isBool = input && input.type === 'checkbox';

    updateSetting(key, isBool ? (String(def) === 'true') : def);
}

function syncInputs() {
    const theme = state.settings.theme;
    const rootStyle = getComputedStyle(document.documentElement);

    qsa('[id^="input-"]').forEach(input => {
        const key = input.id.replace('input-', '');
        let val = theme[key];

        if (val === undefined || val === null) {
            val = resolveThemeDefault(key);
        }
        if ((!val || val === '') && input.type !== 'checkbox') {
             val = input.getAttribute('data-default');
        }
        if ((!val || val === '') && input.type !== 'checkbox') {
             const cssVar = '--' + key.replace(/([A-Z])/g, "-$1").toLowerCase();
             const computed = rootStyle.getPropertyValue(cssVar).trim();
             if (computed && computed !== '') val = computed;
        }

        // Update Inputs
        if (val !== undefined && val !== null) {
            if (input.type === 'checkbox') {
                input.checked = (String(val) === 'true');
            } else if (input.type === 'color') {
                // FIX: Convert stored variable to Hex for the native picker
                input.value = resolveToHex(val);
            } else {
                input.value = val;
            }
        }

        // Update Previews
        const preview = qs(`#preview-${key}`);
        if (preview && val) {
            preview.style.backgroundColor = formatColor(val);
        }

        // Update Reset Buttons
        const resetBtn = qs(`#reset-${key}`);
        if (resetBtn) {
            let def = resolveThemeDefault(key);
            if (def === undefined) def = input.getAttribute('data-default');

            let isDiff = false;
            if (input.type === 'checkbox') {
                 isDiff = (input.checked !== (String(def) === 'true'));
            } else {
                const currentVal = input.type === 'color' ? toHex(val).toLowerCase() : String(val).trim().toLowerCase();
                const defaultVal = input.type === 'color' ? toHex(def).toLowerCase() : String(def || '').trim().toLowerCase();
                isDiff = (currentVal !== defaultVal);
            }

            if (isDiff) resetBtn.classList.add('visible');
            else resetBtn.classList.remove('visible');
        }
    });
}