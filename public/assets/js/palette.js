// palette.js — Command Palette (Ctrl+K)
//
// Searches saved requests by name and URL.
// On open: shows 10 most recently updated requests.
// On type: filters with case-insensitive substring match.
// Arrow keys + Enter navigate and load. Esc closes (Bootstrap native).
//
// Depends on collections.js: getAllRequests(), getCollections(), loadRequestById()

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _palettePool  = [];  // full request list for current palette session, sorted recent-first
let _focusIdx     = -1;  // index of keyboard-focused result row (-1 = none)

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    // Populate when modal opens (fired by shortcuts.js openCommandPalette)
    $('#cmd-palette-modal').on('show.bs.modal', onPaletteOpen);

    // Reset state when modal fully closes
    $('#cmd-palette-modal').on('hidden.bs.modal', onPaletteClose);

    // Filter as user types
    $('#cmd-palette-input').on('input', function () {
        _focusIdx = -1;
        filterAndRender($(this).val().trim());
    });

    // Keyboard navigation inside the input
    $('#cmd-palette-input').on('keydown', function (e) {
        const $items = $('#cmd-palette-results .cmd-result-item');
        const count  = $items.length;
        if (count === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusIdx(_focusIdx + 1 >= count ? 0 : _focusIdx + 1);

        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusIdx(_focusIdx - 1 < 0 ? count - 1 : _focusIdx - 1);

        } else if (e.key === 'Enter') {
            e.preventDefault();
            // If nothing explicitly focused, pick the first result
            const target = _focusIdx >= 0 ? _focusIdx : 0;
            const $row   = $items.eq(target);
            if ($row.length) loadFromPalette(parseInt($row.attr('data-request-id'), 10));
        }
    });

    // Click on a result row
    $('#cmd-palette-results').on('click', '.cmd-result-item', function () {
        loadFromPalette(parseInt($(this).attr('data-request-id'), 10));
    });

    // Hover syncs keyboard focus so they don't fight each other
    $('#cmd-palette-results').on('mouseenter', '.cmd-result-item', function () {
        const idx = $('#cmd-palette-results .cmd-result-item').index(this);
        setFocusIdx(idx);
    });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function onPaletteOpen() {
    // Snapshot and sort requests: most recently updated first
    const all = (typeof getAllRequests === 'function') ? getAllRequests() : [];
    _palettePool = all.slice().sort(function (a, b) {
        return new Date(b.updated_at) - new Date(a.updated_at);
    });

    $('#cmd-palette-input').val('');
    _focusIdx = -1;
    filterAndRender('');
}

function onPaletteClose() {
    _palettePool = [];
    _focusIdx    = -1;
    $('#cmd-palette-results').empty();
    $('#cmd-palette-empty').addClass('d-none');
}

// ---------------------------------------------------------------------------
// Filter + render
// ---------------------------------------------------------------------------

function filterAndRender(query) {
    let results;

    if (!query) {
        results = _palettePool.slice(0, 10);
    } else {
        const q = query.toLowerCase();
        results = _palettePool
            .filter(function (req) {
                return req.name.toLowerCase().includes(q) ||
                       req.url.toLowerCase().includes(q);
            })
            .slice(0, 10);
    }

    renderResults(results);
}

function renderResults(requests) {
    const $list  = $('#cmd-palette-results').empty();
    const $empty = $('#cmd-palette-empty');

    if (requests.length === 0) {
        $empty.removeClass('d-none');
        return;
    }
    $empty.addClass('d-none');

    // Build a collection-id → name lookup from the cached collection list
    const collMap = {};
    const cols = (typeof getCollections === 'function') ? getCollections() : [];
    cols.forEach(function (c) { collMap[c.id] = c.name; });

    requests.forEach(function (req) {
        $list.append(buildResultItem(req, collMap[req.collection_id] || null));
    });
}

function buildResultItem(req, collectionName) {
    const $item = $('<li>')
        .addClass('cmd-result-item')
        .attr('data-request-id', req.id);

    // Method badge
    $item.append(
        $('<span>').addClass('method-badge ' + req.method).text(req.method)
    );

    // Name + URL stacked
    const $info = $('<div>').addClass('cmd-result-info');
    $info.append($('<span>').addClass('item-name').text(req.name));
    if (req.url) {
        $info.append($('<span>').addClass('item-url').text(paletteUrl(req.url)));
    }
    $item.append($info);

    // Collection chip (optional)
    if (collectionName) {
        $item.append(
            $('<span>').addClass('item-collection').text(collectionName)
        );
    }

    return $item;
}

// ---------------------------------------------------------------------------
// Keyboard focus
// ---------------------------------------------------------------------------

function setFocusIdx(idx) {
    const $items = $('#cmd-palette-results .cmd-result-item');
    $items.removeClass('focused');

    if (idx >= 0 && idx < $items.length) {
        _focusIdx = idx;
        const el = $items.eq(idx).addClass('focused').get(0);
        el?.scrollIntoView({ block: 'nearest' });
    } else {
        _focusIdx = -1;
    }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

function loadFromPalette(requestId) {
    bootstrap.Modal.getInstance($('#cmd-palette-modal')[0])?.hide();
    if (typeof loadRequestById === 'function') {
        loadRequestById(requestId);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paletteUrl(url) {
    const clean = url.replace(/^https?:\/\//, '');
    return clean.length > 58 ? clean.slice(0, 58) + '…' : clean;
}
