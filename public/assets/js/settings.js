// settings.js — Dual-write user preference store
//
// Read path:  localStorage → apply immediately (zero flash on load)
//             DB            → sync in background, update localStorage, re-apply
//
// Write path: localStorage → instant  (reflects change before the XHR returns)
//             DB            → async PUT, fire-and-forget
//
// Exposed globals:
//   initSettings()              — call once from app.js $(function(){})
//   getSetting(key)             — returns current value (string) or default
//   saveSetting(key, value)     — persist to localStorage + DB
//   toggleLayout()              — flip stacked ↔ split and persist
//   applyLayoutMode(mode)       — apply without persisting (used by initSettings)
//   toggleTheme()               — flip dark ↔ light and persist
//   applyTheme(mode)            — apply without persisting (used by initSettings)

// ---------------------------------------------------------------------------
// Known settings and their factory defaults
// ---------------------------------------------------------------------------

const SETTING_DEFAULTS = {
    layout:          'stacked',
    sidebar_visible: 'true',
    theme:           'dark',
};

const _LS = 'petal_';   // localStorage key prefix

// ---------------------------------------------------------------------------
// Zero-flash pre-apply — runs synchronously when the script loads.
// Scripts are at the bottom of <body> so the DOM is fully parsed at this point.
// This applies saved preferences BEFORE the first paint, eliminating any flash.
// ---------------------------------------------------------------------------

(function () {
    const layout  = localStorage.getItem(_LS + 'layout');
    const sidebar = localStorage.getItem(_LS + 'sidebar_visible');
    const theme   = localStorage.getItem(_LS + 'theme');

    if (layout === 'split') {
        const ws  = document.getElementById('workspace');
        const btn = document.getElementById('layout-toggle-btn');
        if (ws)  ws.classList.add('layout-split');
        if (btn) btn.classList.add('btn-active');
    }

    if (sidebar === 'false') {
        document.body.classList.add('sidebar-hidden');
    }

    // Apply theme before first paint — eliminates any flash
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.setAttribute('data-bs-theme', 'light');
        const btn  = document.getElementById('theme-toggle-btn');
        const icon = btn && btn.querySelector('i');
        if (icon) icon.className = 'bi bi-moon';
        if (btn)  btn.title = 'Switch to dark theme';
    }
}());

// ---------------------------------------------------------------------------
// Public: init — call once after $(document).ready
// ---------------------------------------------------------------------------

function initSettings() {
    // Background sync from DB — DB is the source of truth across sessions
    $.ajax({ url: API_BASE + '/settings.php', method: 'GET' })
        .done(function (res) {
            if (!res.success || !res.data) return;

            // Merge DB values into localStorage
            $.each(res.data, function (k, v) {
                localStorage.setItem(_LS + k, v);
            });

            // Re-apply (DB may differ from what localStorage had)
            _applyAll(res.data);
        });
}

// ---------------------------------------------------------------------------
// Public: read / write
// ---------------------------------------------------------------------------

function getSetting(key) {
    const v = localStorage.getItem(_LS + key);
    if (v !== null) return v;
    return SETTING_DEFAULTS[key] !== undefined ? String(SETTING_DEFAULTS[key]) : null;
}

function saveSetting(key, value) {
    const str = String(value);
    localStorage.setItem(_LS + key, str);

    // Fire-and-forget — UI already reflects the change
    $.ajax({
        url:         API_BASE + '/settings.php?key=' + encodeURIComponent(key),
        method:      'PUT',
        contentType: 'application/json',
        data:        JSON.stringify({ value: str }),
    });
}

// ---------------------------------------------------------------------------
// Public: high-level actions
// ---------------------------------------------------------------------------

/** Toggle layout and persist. Called by button click and Ctrl+\ shortcut. */
function toggleLayout() {
    const next = getSetting('layout') === 'split' ? 'stacked' : 'split';
    saveSetting('layout', next);
    applyLayoutMode(next);
}

/** Apply a layout mode without persisting (used during init). */
function applyLayoutMode(mode) {
    const isSplit = mode === 'split';
    $('#workspace').toggleClass('layout-split', isSplit);
    $('#layout-toggle-btn').toggleClass('btn-active', isSplit);
}

/** Toggle dark ↔ light theme and persist. */
function toggleTheme() {
    const next = getSetting('theme') === 'light' ? 'dark' : 'light';
    saveSetting('theme', next);
    applyTheme(next);
}

/** Apply a theme without persisting (used during init). */
function applyTheme(mode) {
    const isLight = mode === 'light';
    document.documentElement.setAttribute('data-theme',    mode);
    document.documentElement.setAttribute('data-bs-theme', isLight ? 'light' : 'dark');
    const btn  = document.getElementById('theme-toggle-btn');
    const icon = btn && btn.querySelector('i');
    if (icon) icon.className = isLight ? 'bi bi-moon' : 'bi bi-sun';
    if (btn)  btn.title = isLight ? 'Switch to dark theme' : 'Switch to light theme';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _applyAll(s) {
    if (s.layout          !== undefined) applyLayoutMode(s.layout);
    if (s.sidebar_visible !== undefined) _applySidebar(s.sidebar_visible);
    if (s.theme           !== undefined) applyTheme(s.theme);
}

function _applySidebar(visible) {
    $('body').toggleClass('sidebar-hidden', visible === 'false');
}
