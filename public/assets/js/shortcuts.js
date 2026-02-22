// shortcuts.js — central keyboard shortcut registry
//
// Rules:
//   - All shortcuts live here. No inline onkeydown handlers anywhere else.
//   - Other modules listen for custom jQuery events on $(document).
//   - e.preventDefault() fires as soon as a shortcut key is matched, so the
//     browser NEVER sees Ctrl+S / Ctrl+N / Ctrl+H / etc.
//   - The action itself is gated by isTyping() UNLESS alwaysFire is set.
//     alwaysFire=true → fires even when an input/textarea is focused.

$(function () {

    // -------------------------------------------------------------------------
    // Shortcut map
    // -------------------------------------------------------------------------
    //
    // key        — event.key value (case-insensitive match)
    // ctrl       — requires Ctrl held
    // alwaysFire — fires even when an input/textarea is focused
    // action     — function to call

    const shortcuts = [
        {
            key:        'Enter',
            ctrl:       true,
            alwaysFire: true,   // primary rule: always send, even from URL bar
            action:     () => $(document).trigger('petal:send'),
        },
        {
            key:        's',
            ctrl:       true,
            alwaysFire: true,   // save should work regardless of where focus is
            action:     () => $(document).trigger('petal:save'),
        },
        {
            key:  'n',
            ctrl: false,
            alt:  true,
            action: () => $(document).trigger('petal:new-request'),
        },
        {
            key:    'k',
            ctrl:   true,
            action: openCommandPalette,
        },
        {
            key:    'e',
            ctrl:   true,
            action: focusEnvironmentSwitcher,
        },
        {
            key:        '/',
            ctrl:       true,
            alwaysFire: true,   // must work even when URL input is focused
            action:     () => toggleSidebar(),   // defined in app.js
        },
        {
            key:    '\\',
            ctrl:   true,
            action: () => toggleLayout(),    // defined in settings.js
        },
        {
            key:    'h',
            ctrl:   true,
            action: () => $(document).trigger('petal:toggle-history'),
        },
        {
            key:    '?',
            ctrl:   false,
            action: openShortcutsModal,
        },

        // Focus URL bar — select all so the user can type a new URL immediately
        {
            key:        'l',
            ctrl:       true,
            alwaysFire: true,
            action: function () {
                const input = document.getElementById('url-input');
                if (input) { input.focus(); input.select(); }
            },
        },

        // HTTP method selector — focus the <select>, arrow keys do the rest
        {
            key:        'm',
            ctrl:       false,
            alt:        true,
            alwaysFire: true,
            action: function () {
                const sel = document.getElementById('method-select');
                if (sel) sel.focus();
            },
        },

        // Request tabs: Params / Headers / Body / Auth / Notes
        { key: '1', ctrl: false, alt: true, alwaysFire: true, action: () => switchTab('[data-bs-target="#tab-params"]') },
        { key: '2', ctrl: false, alt: true, alwaysFire: true, action: () => switchTab('[data-bs-target="#tab-headers"]') },
        { key: '3', ctrl: false, alt: true, alwaysFire: true, action: () => switchTab('[data-bs-target="#tab-body"]') },
        { key: '4', ctrl: false, alt: true, alwaysFire: true, action: () => switchTab('[data-bs-target="#tab-auth"]') },
        { key: '5', ctrl: false, alt: true, alwaysFire: true, action: () => switchTab('[data-bs-target="#tab-notes"]') },

        // Response tabs: Body / Headers
        { key: '6', ctrl: false, alt: true, alwaysFire: true, action: () => switchTab('[data-bs-target="#resp-body"]') },
        { key: '7', ctrl: false, alt: true, alwaysFire: true, action: () => switchTab('[data-bs-target="#resp-headers"]') },
    ];

    // -------------------------------------------------------------------------
    // Helper: is the user currently typing in an input/textarea?
    // -------------------------------------------------------------------------

    function isTyping() {
        const el = document.activeElement;
        if (!el) return false;
        const tag = el.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    }

    // -------------------------------------------------------------------------
    // Global keydown handler
    // -------------------------------------------------------------------------

    $(document).on('keydown', function (e) {
        for (const sc of shortcuts) {
            // Must match ctrl requirement
            if (sc.ctrl && !e.ctrlKey) continue;
            if (!sc.ctrl && e.ctrlKey)  continue;

            // Must match alt requirement (sc.alt defaults to false)
            if (sc.alt  && !e.altKey)  continue;
            if (!sc.alt &&  e.altKey)  continue;

            // Must match key (case-insensitive)
            if (e.key.toLowerCase() !== sc.key.toLowerCase()) continue;

            // Shortcut matched — ALWAYS block the browser default so the
            // browser never acts on Ctrl+S / Ctrl+N / Ctrl+H / etc.
            e.preventDefault();

            // Only fire the action when not typing, unless alwaysFire is set
            if (sc.alwaysFire || !isTyping()) {
                sc.action(e);
            }

            return; // first match wins
        }

        // Esc: fire petal:escape so any module can react (Bootstrap handles modals natively)
        if (e.key === 'Escape') {
            $(document).trigger('petal:escape');
        }
    });

    // -------------------------------------------------------------------------
    // Action implementations
    // -------------------------------------------------------------------------

    function openCommandPalette() {
        const modalEl = document.getElementById('cmd-palette-modal');
        if (!modalEl) return;

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

        // Focus the search input as soon as the modal finishes animating in
        $(modalEl).one('shown.bs.modal', function () {
            $('#cmd-palette-input').val('').trigger('input').focus();
        });

        modal.show();
    }

    function openShortcutsModal() {
        const modalEl = document.getElementById('shortcuts-modal');
        if (!modalEl) return;
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    function focusEnvironmentSwitcher() {
        const btn = document.getElementById('env-dropdown-btn');
        if (!btn) return;
        btn.focus();
        // Open the dropdown so the user can navigate it with the keyboard
        bootstrap.Dropdown.getOrCreateInstance(btn).show();
    }

    function switchTab(selector) {
        const el = document.querySelector(selector);
        if (el) bootstrap.Tab.getOrCreateInstance(el).show();
    }

    // -------------------------------------------------------------------------
    // Dev-mode helper: log all fired petal: events when window.DEBUG is true
    // -------------------------------------------------------------------------

    $(document).on('petal:send petal:save petal:new-request petal:toggle-history petal:escape', function (e) {
        debug('shortcut event:', e.type);
    });

});
