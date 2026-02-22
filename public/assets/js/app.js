// app.js — bootstrap/init code loaded first after CDN scripts

// Set to true in your browser console to enable debug logging:  window.DEBUG = true
window.DEBUG = false;

// API base path — derived from the current page URL so it works at any sub-path.
// e.g. http://localhost/petal/public/  →  /petal/api
window.API_BASE = (function () {
    const path = location.pathname.replace(/\/[^/]*$/, ''); // strip filename or trailing slash
    return path.replace(/\/public$/, '') + '/api';
}());

function debug(msg, ...args) {
    if (window.DEBUG) console.log('[Petal]', msg, ...args);
}

// ---------------------------------------------------------------------------
// Toast notifications (stub — full implementation in TASK 9.1)
// ---------------------------------------------------------------------------

/**
 * showToast(message, type)
 * Types: 'success' | 'error' | 'warning' | 'info'
 * Toasts appear top-right, auto-dismiss after 3s, click to dismiss.
 */
function showToast(message, type = 'info') {
    const icons = {
        success: 'bi-check-circle-fill',
        error:   'bi-exclamation-circle-fill',
        warning: 'bi-exclamation-triangle-fill',
        info:    'bi-info-circle-fill',
    };

    const toast = $('<div>')
        .addClass(`petal-toast toast-${type}`)
        .html(`
            <i class="bi ${icons[type] || icons.info} toast-icon"></i>
            <span>${$('<span>').text(message).html()}</span>
        `);

    $('#toast-container').append(toast);

    // Auto-dismiss after 3s
    const dismiss = () => {
        toast.addClass('toast-hiding');
        setTimeout(() => toast.remove(), 210);
    };

    setTimeout(dismiss, 3000);
    toast.on('click', dismiss);
}

// ---------------------------------------------------------------------------
// Method selector — keep data-method attribute in sync for CSS coloring
// ---------------------------------------------------------------------------

function syncMethodColor(selectEl) {
    $(selectEl).attr('data-method', $(selectEl).val());
}

// ---------------------------------------------------------------------------
// Sidebar toggle  (persists via settings.js)
// ---------------------------------------------------------------------------

function toggleSidebar() {
    const isNowHidden = $('body').hasClass('sidebar-hidden');
    $('body').toggleClass('sidebar-hidden', !isNowHidden);
    // Persist new state — saveSetting is defined in settings.js
    saveSetting('sidebar_visible', isNowHidden ? 'true' : 'false');
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    debug('Petal init');

    // Sync method color on load and on change
    syncMethodColor('#method-select');
    $('#method-select').on('change', function () {
        syncMethodColor(this);
    });

    // Sidebar toggle button
    $('#sidebar-toggle').on('click', toggleSidebar);

    // Layout toggle button — toggleLayout() defined in settings.js
    $('#layout-toggle-btn').on('click', toggleLayout);

    // Load and sync settings from DB (localStorage pre-apply already happened
    // in settings.js IIFE, so this is just the background DB sync)
    initSettings();

    debug('Init complete');
});
