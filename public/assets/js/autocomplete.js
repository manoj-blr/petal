// autocomplete.js — URL bar fuzzy autocomplete
//
// Sources (both searched on every keystroke, in-memory, no AJAX):
//   getAllRequests()    from collections.js  → match on name OR url
//   getRecentHistory() from history.js       → match on url
//
// Saved request → loadRequestById(id)   full load (method, headers, body, auth…)
// History item  → fill URL + set method only

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _acTimer   = null;   // debounce handle
let _acFocused = -1;     // keyboard-focused item index (-1 = none)
let _acItems   = [];     // [{type:'saved'|'history', score, data}]

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    const $input = $('#url-input');

    // Debounced input — rebuild suggestions after each keystroke
    $input.on('input', function () {
        clearTimeout(_acTimer);
        const q = this.value.trim();
        if (q.length < 1) { closeAc(); return; }
        _acTimer = setTimeout(function () { buildSuggestions(q); }, 130);
    });

    // Keyboard navigation inside the dropdown
    $input.on('keydown', function (e) {
        if ($('#url-ac').hasClass('d-none')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAcFocus(Math.min(_acFocused + 1, _acItems.length - 1));

        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAcFocus(Math.max(_acFocused - 1, 0));

        } else if (e.key === 'Tab') {
            // Tab completes the focused item (or first item)
            if (_acItems.length > 0) {
                e.preventDefault();
                selectAcItem(_acFocused >= 0 ? _acFocused : 0);
            }

        } else if (e.key === 'Enter' && _acFocused >= 0) {
            // Enter selects only when an item is explicitly focused via arrow keys
            e.preventDefault();
            e.stopImmediatePropagation(); // don't also fire petal:send
            selectAcItem(_acFocused);

        } else if (e.key === 'Escape') {
            closeAc();
        }
    });

    // Close with a small delay so a click on an item can register first
    $input.on('blur', function () {
        setTimeout(closeAc, 160);
    });

    // Close after any request load or workspace clear
    $(document).on('petal:load-request petal:clear-request petal:send', closeAc);
});

// ---------------------------------------------------------------------------
// Build + score suggestions
// ---------------------------------------------------------------------------

function buildSuggestions(query) {
    const q   = query.toLowerCase();
    const out = [];

    // ── Saved requests (name OR url match) ───────────────────────────────────
    const reqs = (typeof getAllRequests === 'function') ? (getAllRequests() || []) : [];

    reqs.forEach(function (r) {
        const s = Math.max(acScore(r.name || '', q), acScore(r.url || '', q));
        if (s > 0) out.push({ type: 'saved', score: s + 0.5, data: r });
        // +0.5 bias: saved requests float above history at equal score
    });

    // ── History (url match, skip urls already shown via saved requests) ───────
    const hist    = (typeof getRecentHistory === 'function') ? (getRecentHistory() || []) : [];
    const usedUrl = new Set(out.map(function (i) { return i.data.url; }));

    hist.forEach(function (h) {
        if (usedUrl.has(h.url)) return;
        const s = acScore(h.url || '', q);
        if (s > 0) out.push({ type: 'history', score: s, data: h });
    });

    if (!out.length) { closeAc(); return; }

    // Sort by score desc (saved already floats above history at equal score via +0.5)
    out.sort(function (a, b) { return b.score - a.score; });

    renderAc(out.slice(0, 10));
}

// 2 = substring anywhere · 1 = subsequence (all chars appear in order) · 0 = no match
function acScore(text, q) {
    const t = text.toLowerCase();
    if (t.includes(q)) return 2;

    let ti = 0, qi = 0;
    while (ti < t.length && qi < q.length) {
        if (t[ti] === q[qi]) qi++;
        ti++;
    }
    return qi === q.length ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Render dropdown
// ---------------------------------------------------------------------------

function renderAc(items) {
    _acItems   = items;
    _acFocused = -1;

    let $drop = $('#url-ac');
    if (!$drop.length) {
        $drop = $('<div>').attr('id', 'url-ac').addClass('url-ac d-none');
        $('body').append($drop);
    }

    $drop.empty();

    let lastType = null;
    items.forEach(function (item, idx) {
        // Section label whenever the type changes
        if (item.type !== lastType) {
            $drop.append(
                $('<div>').addClass('ac-section')
                          .text(item.type === 'saved' ? 'Saved requests' : 'Recent')
            );
            lastType = item.type;
        }
        $drop.append(buildAcItem(item, idx));
    });

    positionAc($drop);
    $drop.removeClass('d-none');
}

function buildAcItem(item, idx) {
    const d      = item.data;
    const method = (d.method || 'GET').toUpperCase();

    const $row = $('<div>')
        .addClass('ac-item')
        .attr('data-idx', idx)
        .on('mousedown', function (e) { e.preventDefault(); }) // keep input focus
        .on('click',     function () { selectAcItem(idx); })
        .on('mouseenter', function () { setAcFocus(idx); });

    $row.append($('<span>').addClass('method-badge ' + method).text(method));

    if (item.type === 'saved') {
        $row.append(
            $('<div>').addClass('ac-info').append(
                $('<span>').addClass('ac-name').text(d.name || ''),
                $('<span>').addClass('ac-url').text(acTrimUrl(d.url || ''))
            )
        );
    } else {
        // History item — just the URL (no saved name)
        $row.append($('<span>').addClass('ac-url').text(acTrimUrl(d.url || '')));
    }

    return $row;
}

// ---------------------------------------------------------------------------
// Focus management
// ---------------------------------------------------------------------------

function setAcFocus(idx) {
    _acFocused = idx;
    const $items = $('#url-ac .ac-item');
    $items.removeClass('ac-focused');
    if (idx >= 0) $items.eq(idx).addClass('ac-focused');
}

// ---------------------------------------------------------------------------
// Select an item
// ---------------------------------------------------------------------------

function selectAcItem(idx) {
    const item = _acItems[idx];
    if (!item) return;
    closeAc();

    if (item.type === 'saved') {
        // Full load — same as clicking the request in the sidebar
        if (typeof loadRequestById === 'function') {
            loadRequestById(item.data.id);
        }
    } else {
        // History — fill URL + method only
        $('#url-input').val(item.data.url || '');
        if (item.data.method) {
            $('#method-select').val(item.data.method).trigger('change');
        }
    }
}

// ---------------------------------------------------------------------------
// Position + close
// ---------------------------------------------------------------------------

function positionAc($drop) {
    const rect = document.getElementById('url-input').getBoundingClientRect();
    $drop.css({
        position: 'fixed',
        top:      rect.bottom + 3,
        left:     rect.left,
        width:    rect.width,
        'z-index': 8000,
    });
}

function closeAc() {
    const $drop = $('#url-ac');
    if ($drop.length && !$drop.hasClass('d-none')) {
        $drop.addClass('d-none');
    }
    _acFocused = -1;
    _acItems   = [];
}

function acTrimUrl(url) {
    const clean = url.replace(/^https?:\/\//, '');
    return clean.length > 65 ? clean.slice(0, 62) + '…' : clean;
}
