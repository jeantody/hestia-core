import { fetchJellyfin, getJellyfinImage } from "./jCore.js";

export function initJellyfin(el, config) {
    const { url, apiKey, userId } = config;
    const bodyEl = el.querySelector('.jellyfin-body');

    // 1. Setup DOM (Two Views: Player & Shelf)
    bodyEl.innerHTML = `
        <div class="jf-player" style="display:none;">
            <div class="jf-backdrop"></div>
            <div class="jf-overlay">
                <div class="jf-meta-top">
                    <span class="jf-user badge">User</span>
                    <span class="jf-state">Playing</span>
                </div>
                <div class="jf-info">
                    <div class="jf-title">Title</div>
                    <div class="jf-subtitle">Subtitle</div>
                </div>
                <div class="jf-progress-track">
                    <div class="jf-progress-fill"></div>
                </div>
            </div>
        </div>

        <div class="jf-shelf" style="display:none;">
            <div class="jf-shelf-header">RECENTLY ADDED</div>
            <div class="jf-grid" id="jf-grid"></div>
        </div>
    `;

    // 2. Return Update Function
    return async () => {
        // --- CHECK ACTIVE SESSIONS ---
        const sessions = await fetchJellyfin(url, '/Sessions', {}, apiKey);

        // Filter for "Now Playing" items (Video/Audio)
        const activeSession = sessions.find(s => s.NowPlayingItem && s.NowPlayingItem.MediaType === 'Video');

        if (activeSession) {
            renderPlayer(el, url, activeSession);
        } else {
            // Fallback to Latest
            await renderShelf(el, url, apiKey, userId);
        }
    };
}

function renderPlayer(el, baseUrl, session) {
    const player = el.querySelector('.jf-player');
    const shelf = el.querySelector('.jf-shelf');
    const item = session.NowPlayingItem;

    // Toggle Views
    player.style.display = 'flex';
    shelf.style.display = 'none';

    // 1. Backdrop
    const backdropUrl = getJellyfinImage(baseUrl, item.Id, "Backdrop");
    const backdropEl = el.querySelector('.jf-backdrop');
    // Simple cache check to prevent flashing
    if (backdropEl.dataset.current !== item.Id) {
        backdropEl.style.backgroundImage = `url('${backdropUrl}')`;
        backdropEl.dataset.current = item.Id;
    }

    // 2. Text Info
    el.querySelector('.jf-user').innerText = session.UserName;
    el.querySelector('.jf-title').innerText = item.Name;

    // Subtitle logic (Series vs Movie)
    let sub = item.ProductionYear || '';
    if (item.SeriesName) {
        sub = `${item.SeriesName} - S${item.ParentIndexNumber}E${item.IndexNumber}`;
    }
    el.querySelector('.jf-subtitle').innerText = sub;

    // 3. Progress
    if (session.PlayState) {
        const pct = (session.PlayState.PositionTicks / item.RunTimeTicks) * 100;
        el.querySelector('.jf-progress-fill').style.width = `${pct}%`;
        el.querySelector('.jf-state').innerText = session.PlayState.IsPaused ? "PAUSED" : "PLAYING";
    }
}

async function renderShelf(el, baseUrl, apiKey, userId) {
    const player = el.querySelector('.jf-player');
    const shelf = el.querySelector('.jf-shelf');

    player.style.display = 'none';
    shelf.style.display = 'flex';

    if (!userId) {
        el.querySelector('#jf-grid').innerHTML = '<div style="opacity:0.5; font-size:0.8rem;">Add User ID in settings<br>to see recent items.</div>';
        return;
    }

    // Fetch Latest (Movies & Episodes)
    const latest = await fetchJellyfin(baseUrl, `/Users/${userId}/Items/Latest`, {
        Limit: 6,
        IncludeItemTypes: "Movie,Episode"
    }, apiKey);

    const grid = el.querySelector('#jf-grid');
    grid.innerHTML = '';

    latest.forEach(item => {
        const imgUrl = getJellyfinImage(baseUrl, item.Id, "Primary"); // Poster
        const card = document.createElement('div');
        card.className = 'jf-poster';
        card.style.backgroundImage = `url('${imgUrl}')`;
        card.title = item.Name; // Tooltip

        // Overlay for Episodes
        if (item.SeriesName) {
            const epBadge = document.createElement('div');
            epBadge.className = 'jf-ep-badge';
            epBadge.innerText = `S${item.ParentIndexNumber} E${item.IndexNumber}`;
            card.appendChild(epBadge);
        }

        grid.appendChild(card);
    });
}