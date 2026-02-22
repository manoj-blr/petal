// history.js — Sidebar history panel
//
// loadHistory() is called by request.js after every successful send.
// Groups entries by date, shows last 20, supports click-to-load and clear-all.

// ---------------------------------------------------------------------------
// State (exposed via getRecentHistory() for autocomplete.js)
// ---------------------------------------------------------------------------

let _history = [];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    loadHistory();

    // Clear History button
    $('#clear-history-btn').on('click', function () {
        if (!confirm('Clear all history? This cannot be undone.')) return;
        clearHistory();
    });

    // Ctrl+H — scroll history section into view
    $(document).on('petal:toggle-history', function () {
        const $section = $('.sidebar-section-history');
        $section[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

// ---------------------------------------------------------------------------
// Load & render
// ---------------------------------------------------------------------------

function loadHistory() {
    $.ajax({ url: API_BASE + '/history.php', method: 'GET' })
        .done(function (res) {
            renderHistory(res.success ? (res.data || []) : []);
        })
        .fail(function () {
            $('#history-list').html(
                '<div class="sidebar-empty">' +
                '<i class="bi bi-exclamation-triangle"></i>' +
                '<p>Failed to load history</p></div>'
            );
        });
}

// Expose cached history for autocomplete.js
function getRecentHistory() { return _history; }

function renderHistory(entries) {
    _history = entries;   // cache for autocomplete
    const $list = $('#history-list').empty();

    if (entries.length === 0) {
        $list.html(
            '<div class="sidebar-empty">' +
            '<i class="bi bi-clock-history"></i>' +
            '<p>No history yet</p></div>'
        );
        return;
    }

    // Cap at 20 for sidebar display (API already returns latest first)
    const shown = entries.slice(0, 20);

    // Group by date label
    const groups = [];
    const groupMap = {};

    shown.forEach(function (entry) {
        const label = dateGroupLabel(entry.created_at);
        if (!groupMap[label]) {
            groupMap[label] = [];
            groups.push(label);
        }
        groupMap[label].push(entry);
    });

    groups.forEach(function (label) {
        // Date group header
        $list.append(
            $('<div>').addClass('history-date-group').text(label)
        );
        groupMap[label].forEach(function (entry) {
            $list.append(buildHistoryItem(entry));
        });
    });
}

// ---------------------------------------------------------------------------
// History item
// ---------------------------------------------------------------------------

function buildHistoryItem(entry) {
    const statusCls = statusClass(entry.response_status);

    const $item = $('<div>').addClass('history-item').attr('data-history-id', entry.id);

    const $left = $('<div>').addClass('history-item-main');
    $left.append(
        $('<span>').addClass('method-badge ' + entry.method).text(entry.method),
        $('<span>').addClass('history-url').text(truncateUrl(entry.url))
    );

    const $right = $('<div>').addClass('history-item-meta');
    if (entry.response_status) {
        $right.append(
            $('<span>').addClass('history-status ' + statusCls).text(entry.response_status)
        );
    }
    $right.append(
        $('<span>').addClass('history-time').text(timeAgo(entry.created_at))
    );

    $item.append($left, $right);

    $item.on('click', function () {
        loadHistoryEntryIntoWorkspace(entry.id);
    });

    return $item;
}

// ---------------------------------------------------------------------------
// Load a history entry into the workspace (request only, not response)
// ---------------------------------------------------------------------------

function loadHistoryEntryIntoWorkspace(historyId) {
    $.ajax({ url: API_BASE + '/history.php?id=' + historyId, method: 'GET' })
        .done(function (res) {
            if (!res.success) {
                showToast(res.error || 'Could not load history entry', 'error');
                return;
            }

            const h = res.data;

            // Convert history headers ({Key: value}) → [{key, value, enabled}] for headers.js
            const headers = adaptHistoryHeaders(h.request_headers);

            // Infer body_type — check Content-Type from request headers
            const bodyType = inferBodyType(h.request_headers, h.request_body);

            // Build a pseudo-request object — no saved id (this is a replay, not a load)
            const req = {
                id:        null,
                name:      h.method + '  ' + truncateUrl(h.url),
                method:    h.method,
                url:       h.url,
                headers:   headers,
                body:      h.request_body || null,
                body_type: bodyType,
                params:    [],    // params are already encoded in the URL
            };

            // After request loads, also render the stored response
            loadSavedRequest(req, function () {
                if (h.response_status) {
                    $(document).trigger('petal:response-received', [{
                        status:               h.response_status,
                        status_text:          '',
                        duration_ms:          h.duration_ms,
                        size_bytes:           h.response_size_bytes,
                        headers:              h.response_headers || {},
                        body:                 h.response_body    || '',
                        body_type:            inferResponseBodyType(h.response_headers),
                        method:               h.method,
                        final_url:            h.url,
                        timestamp:            h.created_at,
                        unresolved_variables: [],
                    }]);
                }
            });
        })
        .fail(function () {
            showToast('Could not load history entry', 'error');
        });
}

function adaptHistoryHeaders(headers) {
    if (!headers || typeof headers !== 'object') return [];
    return Object.entries(headers).map(function ([key, value]) {
        return { key: key, value: String(value), enabled: true };
    });
}

function inferResponseBodyType(responseHeaders) {
    if (!responseHeaders) return 'text';
    const ct = Object.entries(responseHeaders)
        .find(function ([k]) { return k.toLowerCase() === 'content-type'; });
    if (!ct) return 'text';
    return String(ct[1]).toLowerCase().includes('json') ? 'json' : 'text';
}

function inferBodyType(requestHeaders, body) {
    if (!body) return 'none';
    const ct = Object.entries(requestHeaders || {})
        .find(function ([k]) { return k.toLowerCase() === 'content-type'; });
    if (!ct) return 'raw';
    const val = String(ct[1]).toLowerCase();
    if (val.includes('json')) return 'json';
    // form-urlencoded bodies stored as raw string in history — show as raw
    return 'raw';
}

// ---------------------------------------------------------------------------
// Clear all history
// ---------------------------------------------------------------------------

function clearHistory() {
    $.ajax({ url: API_BASE + '/history.php', method: 'DELETE' })
        .done(function (res) {
            if (res.success) {
                renderHistory([]);
                showToast('History cleared', 'success');
            } else {
                showToast(res.error || 'Failed to clear history', 'error');
            }
        })
        .fail(function () {
            showToast('Failed to clear history', 'error');
        });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateGroupLabel(dateStr) {
    const d     = new Date(dateStr);
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yest  = new Date(+today - 86400000);
    const entry = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (+entry >= +today) return 'Today';
    if (+entry >= +yest)  return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)  return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
}

function truncateUrl(url) {
    // Strip protocol, keep path; truncate to ~40 chars
    const clean = url.replace(/^https?:\/\//, '');
    return clean.length > 42 ? clean.slice(0, 42) + '…' : clean;
}

function statusClass(status) {
    if (!status)      return '';
    if (status >= 500) return 'text-5xx';
    if (status >= 400) return 'text-4xx';
    if (status >= 300) return 'text-3xx';
    return 'text-2xx';
}
