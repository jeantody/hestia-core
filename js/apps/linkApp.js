import { BaseApp } from "./baseApp.js";
import { resolveIconClass } from "../utils.js";
import { registry } from "../registry.js";
import { getImageUrl } from "../imageStore.js"; // Import Image Loader

export class LinkApp extends BaseApp {
    async render(app) {
        const data = app.data || {};
        const url = data.url || '#';
        const hideLabel = data.hideLabel === true || data.hideLabel === 'true';

        let iconInput = data.icon || 'fa-globe';
        let isImage = false;
        let imgSrc = '';

        // 1. Check if it's a Saved Image (IndexedDB)
        if (iconInput.startsWith('img_')) {
            try {
                const dbUrl = await getImageUrl(iconInput);
                if (dbUrl) {
                    imgSrc = dbUrl;
                    isImage = true;
                }
            } catch (e) {
                console.warn("[LinkApp] Failed to load image", e);
            }
        }
        // 2. Check if it's a URL (heuristic: contains / or .)
        else if (iconInput.includes('/') || iconInput.includes('.')) {
            imgSrc = iconInput;
            isImage = true;
        }

        // 3. Render HTML
        let iconHtml;
        if (isImage) {
            iconHtml = `<img src="${imgSrc}" class="link-app-icon" alt="icon">`;
        } else {
            // Fallback to FontAwesome
            const iconClass = resolveIconClass(iconInput);
            iconHtml = `<i class="${iconClass}"></i>`;
        }

        return `
            <a href="${url}" target="_blank" class="app-content app-type-link">
                ${iconHtml}
                ${!hideLabel ? `<span>${app.name}</span>` : ''}
            </a>`;
    }
}

registry.register('link', LinkApp, {
    label: 'Link Button',
    defaultSize: { cols: 1, rows: 1 },
    settings: [
        { name: 'url', label: 'URL', type: 'text', placeholder: 'https://...' },
        // Changed type to 'image-source' to enable Uploads
        { name: 'icon', label: 'Icon (Upload or FA Class)', type: 'image-source', placeholder: 'fa-fire OR https://...' },
        { name: 'hideLabel', label: 'Hide Text Label', type: 'select', options: [{label:'No', value:'false'}, {label:'Yes', value:'true'}], defaultValue: 'false'}
    ],
    css: `
        .app-type-link {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-decoration: none;
            color: inherit;
            height: 100%;
            width: 100%;
            transition: color 0.2s;
        }
        .app-card .app-type-link:hover { transform: scale(1.05); }

        /* FontAwesome Styling */
        .app-type-link i { font-size: 2.5rem; margin-bottom: 10px; }

        /* Image/Upload Styling */
        .link-app-icon {
            height: 2.5rem;
            width: auto;
            margin-bottom: 10px;
            object-fit: contain;
            pointer-events: none; /* Let clicks pass to link */
        }

        .app-type-link span { font-size: 1rem; text-align: center; }

        /* "Only Child" = Large Icon Mode (No Text) */
        .app-card .app-type-link i:only-child {
            font-size: 5rem;
            margin-bottom: 0;
        }
        .app-card .app-type-link .link-app-icon:only-child {
            height: 5rem;
            width: 80%; /* Prevent overflow if wide */
            margin-bottom: 0;
        }

        .edit-mode .app-type-link {
            pointer-events: none;
        }
    `
});