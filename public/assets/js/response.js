// response.js — Response panel rendering + JSON syntax highlighter
//
// Listens for petal:response-received  → renders response
// Listens for petal:clear-response    → hides and resets panel

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _rawBody     = '';    // kept for the Copy button and search re-render
let _parsedJson  = null;  // cached parsed object when body_type is json
let _lastBodyType = 'text';
let _wrapActive  = false;
let _searchQuery = '';
let _searchTimer = null;
let _isHtmlResp  = false; // true when response Content-Type is text/html

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    $(document).on('petal:response-received', function (e, data) {
        renderResponse(data);
    });

    $(document).on('petal:clear-response', function () {
        clearResponse();
    });

    // Search input — debounced, triggers on every keystroke
    $('#resp-search-input').on('input', function () {
        clearTimeout(_searchTimer);
        const q = $(this).val().trim();
        $('#resp-search-clear').toggleClass('d-none', q === '');
        _searchTimer = setTimeout(function () { applySearch(q); }, 200);
    });

    // Clear search
    $('#resp-search-clear').on('click', function () {
        $('#resp-search-input').val('');
        $(this).addClass('d-none');
        applySearch('');
    });

    // Copy raw body to clipboard
    $('#copy-response-btn').on('click', function () {
        if (!_rawBody) return;
        navigator.clipboard.writeText(_rawBody).then(function () {
            showToast('Copied to clipboard', 'success');
        }).catch(function () {
            showToast('Copy failed — try selecting + Ctrl+C', 'warning');
        });
    });

    // Toggle word-wrap on the response body
    $('#wrap-response-btn').on('click', function () {
        _wrapActive = !_wrapActive;
        $('#response-body').toggleClass('wrap', _wrapActive);
        $(this).toggleClass('btn-active', _wrapActive);
    });
});

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

function renderResponse(data) {
    _rawBody    = data.body || '';
    _isHtmlResp = getResponseContentType(data.headers || {}).includes('text/html');

    renderStatusBadge(data.status, data.status_text);
    renderMetaBar(data.duration_ms, data.size_bytes);
    renderBody(data.body, data.body_type, data.truncated);
    renderHtmlPreview(data.body, _isHtmlResp);
    renderResponseHeaders(data.headers || {});
    renderResponseInfo(data);

    // Hide placeholder, show panel (CSS animation defined in app.css)
    $('#resp-placeholder').addClass('d-none');
    $('#response-panel').removeClass('d-none');

    // Auto-switch to Preview for HTML responses, otherwise Body
    if (_isHtmlResp) {
        $('[data-bs-target="#resp-preview"]').tab('show');
    } else {
        $('[data-bs-target="#resp-body"]').tab('show');
    }
}

// ---------------------------------------------------------------------------
// HTML preview helpers
// ---------------------------------------------------------------------------

// Returns the lowercased content-type value from response headers ('' if absent).
// Header names from cURL are mixed-case so we normalise with toLowerCase().
function getResponseContentType(headers) {
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-type') return headers[key].toLowerCase();
    }
    return '';
}

// Show/hide the Preview tab and load (or clear) the srcdoc iframe.
function renderHtmlPreview(body, isHtml) {
    const $li   = $('#resp-preview-tab-li');
    const frame = document.getElementById('resp-preview-frame');
    if (!frame) return;

    if (isHtml && body) {
        $li.removeClass('d-none');
        frame.srcdoc = body;   // set via property so large HTML doesn't hit attr limits
    } else {
        $li.addClass('d-none');
        frame.srcdoc = '';
    }
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function renderStatusBadge(status, statusText) {
    const $badge = $('#response-status-badge');
    const label  = status ? (status + ' ' + (statusText || '')) : '—';

    let cls = '';
    if      (status >= 500) cls = 's5xx';
    else if (status >= 400) cls = 's4xx';
    else if (status >= 300) cls = 's3xx';
    else if (status >= 200) cls = 's2xx';

    $badge.text(label).attr('class', 'response-status-badge ' + cls);
}

// ---------------------------------------------------------------------------
// Meta bar — duration + size
// ---------------------------------------------------------------------------

function renderMetaBar(durationMs, sizeBytes) {
    $('#response-duration').text(durationMs  != null ? durationMs + ' ms'   : '—');
    $('#response-size').text(sizeBytes != null ? formatSize(sizeBytes) : '—');
}

function formatSize(bytes) {
    if (bytes < 1024)         return bytes + ' B';
    if (bytes < 1048576)      return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// ---------------------------------------------------------------------------
// Response body
// ---------------------------------------------------------------------------

function renderBody(body, bodyType, truncated) {
    const $el = $('#response-body');
    $el.toggleClass('wrap', _wrapActive);

    // Remove any previous truncation warning
    $('#resp-truncation-warning').remove();

    if (truncated) {
        const $warn = $('<div>', { id: 'resp-truncation-warning' }).addClass('resp-truncation-warning')
            .html('<i class="bi bi-exclamation-triangle-fill me-2"></i>' +
                  'Response truncated at 5 MB — only the first 5 MB are shown. ' +
                  'The full response was <strong>' + formatSize(5 * 1024 * 1024 + 1) + '+</strong>.');
        $('#resp-body').prepend($warn);
    }

    _lastBodyType = bodyType;

    if (body === null || body === undefined || body === '') {
        _parsedJson = null;
        $el.html('<span class="resp-empty">— empty body —</span>');
        return;
    }

    if (bodyType === 'json') {
        try {
            _parsedJson = JSON.parse(body);
            $el.html(highlightJson(JSON.stringify(_parsedJson, null, 2)));
        } catch (_) {
            _parsedJson = null;
            $el.html(escapeHtml(body));
            showToast('Response declared JSON but body could not be parsed — shown as plain text', 'warning');
        }
    } else {
        _parsedJson = null;
        $el.html(escapeHtml(body));
    }

    // Re-apply active search to the freshly rendered body
    if (_searchQuery) applySearch(_searchQuery);
}

// ---------------------------------------------------------------------------
// JSON syntax highlighter  (~50 lines, written from scratch, no library)
//
// Iterates over the pretty-printed JSON string token by token with a regex.
// Between matches the structural characters ({, }, [, ], ,, :, whitespace)
// are HTML-escaped and emitted unchanged.  Every captured token is also
// HTML-escaped before being wrapped in a coloured <span>.
//
// Groups:
//   (1) str   — a full JSON string literal   "..."
//   (2) colon — optional colon after str     : → marks it as an object key
//   (3) num   — a JSON number
//   (4) kw    — true | false | null
// ---------------------------------------------------------------------------

function highlightJson(raw) {
    const esc = s => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const re = /("(?:\\[\s\S]|[^"\\])*")(\s*:)?|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

    let html = '', last = 0, m;

    while ((m = re.exec(raw)) !== null) {
        html += esc(raw.slice(last, m.index));   // gap between tokens

        const [, str, colon, num, kw] = m;

        if (str !== undefined) {
            const cls = colon ? 'json-key' : 'json-string';
            html += '<span class="' + cls + '">' + esc(str) + '</span>';
            if (colon) html += esc(colon);        // emit the colon uncoloured
        } else if (num !== undefined) {
            html += '<span class="json-number">' + esc(num) + '</span>';
        } else {
            const cls = (kw === 'null') ? 'json-null' : 'json-boolean';
            html += '<span class="' + cls + '">' + esc(kw) + '</span>';
        }

        last = re.lastIndex;
    }

    html += esc(raw.slice(last));   // trailing structural characters
    return html;
}

// ---------------------------------------------------------------------------
// Response search — text highlight + $.path navigation
// ---------------------------------------------------------------------------

/**
 * Entry point: called on every input change.
 * Routes to applyJsonPath or applyTextSearch based on the query prefix.
 */
function applySearch(query) {
    _searchQuery = query;

    // Empty or bare "$" / "$." — restore the original render
    if (!query || query === '$' || query === '$.') {
        repaintBody();
        showSearchResult('');
        return;
    }

    if (query.startsWith('$.')) {
        applyJsonPath(query);
    } else {
        applyTextSearch(query);
    }
}

/**
 * Re-renders the body from cached state without touching search variables.
 * Used as the "clean slate" before applying highlights.
 */
function repaintBody() {
    const $el = $('#response-body');
    if (!_rawBody) return;
    if (_lastBodyType === 'json' && _parsedJson !== null) {
        $el.html(highlightJson(JSON.stringify(_parsedJson, null, 2)));
    } else {
        $el.html(escapeHtml(_rawBody));
    }
}

/**
 * JSON path navigation — $.data.name  or  $.cme.0.cme_id
 * Dot-separated segments; numeric segments index into arrays.
 */
function applyJsonPath(path) {
    if (_parsedJson === null) {
        showSearchResult('JSON responses only');
        return;
    }

    const segments = path.slice(2).split('.').filter(Boolean);
    let cur = _parsedJson;

    for (let i = 0; i < segments.length; i++) {
        if (cur === null || cur === undefined) { cur = undefined; break; }
        if (typeof cur !== 'object')            { cur = undefined; break; }

        const seg    = segments[i];
        const numIdx = parseInt(seg, 10);
        if (!isNaN(numIdx) && String(numIdx) === seg && Array.isArray(cur)) {
            cur = cur[numIdx];
        } else {
            cur = cur[seg];
        }
    }

    const $el = $('#response-body');

    if (cur === undefined) {
        showSearchResult('Not found');
        repaintBody();   // keep showing original, hint says "not found"
        return;
    }

    if (cur !== null && typeof cur === 'object') {
        $el.html(highlightJson(JSON.stringify(cur, null, 2)));
        const label = Array.isArray(cur)
            ? cur.length + (cur.length === 1 ? ' item' : ' items')
            : 'object';
        showSearchResult(label);
    } else {
        // Scalar — pick the right colour class
        const cls = cur === null ? 'json-null' : 'json-' + typeof cur;
        $el.html('<span class="' + cls + '">' + escapeHtml(JSON.stringify(cur)) + '</span>');
        showSearchResult(typeof cur + ': ' + JSON.stringify(cur).slice(0, 40));
    }
}

/**
 * Text search — case-insensitive substring highlight using a TreeWalker.
 * Walks every text node inside #response-body and wraps matches in <mark>.
 */
function applyTextSearch(query) {
    repaintBody();   // fresh render first, then highlight

    const lq        = query.toLowerCase();
    const container = $('#response-body')[0];
    const walker    = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    let count = 0;
    nodes.forEach(function (textNode) {
        const text  = textNode.nodeValue;
        const lower = text.toLowerCase();
        if (!lower.includes(lq)) return;

        const frag = document.createDocumentFragment();
        let start = 0, idx;

        while ((idx = lower.indexOf(lq, start)) !== -1) {
            if (idx > start) {
                frag.appendChild(document.createTextNode(text.slice(start, idx)));
            }
            const mark = document.createElement('mark');
            mark.className = 'resp-search-match';
            mark.textContent = text.slice(idx, idx + query.length);
            frag.appendChild(mark);
            count++;
            start = idx + query.length;
        }

        if (start < text.length) {
            frag.appendChild(document.createTextNode(text.slice(start)));
        }
        textNode.parentNode.replaceChild(frag, textNode);
    });

    showSearchResult(count === 0 ? 'No matches' : count + (count === 1 ? ' match' : ' matches'));
}

function showSearchResult(text) {
    const $c = $('#resp-search-count');
    if (!text) { $c.addClass('d-none'); return; }
    $c.text(text).removeClass('d-none');
}

// HTML-escape a string for injection into the DOM as plain text
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Response headers tab
// ---------------------------------------------------------------------------

function renderResponseHeaders(headers) {
    const $tbody = $('#response-headers-tbody').empty();
    const keys   = Object.keys(headers).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    if (keys.length === 0) {
        $tbody.append(
            $('<tr>').append(
                $('<td>').attr('colspan', 2)
                         .addClass('text-center py-3')
                         .css('color', 'var(--text-muted)')
                         .text('No response headers captured')
            )
        );
        return;
    }

    keys.forEach(function (key) {
        $tbody.append(
            $('<tr>').append(
                $('<td>').text(key),
                $('<td>').text(headers[key])
            )
        );
    });
}

// ---------------------------------------------------------------------------
// Response info tab
// ---------------------------------------------------------------------------

function renderResponseInfo(data) {
    const $dl = $('#response-info-list').empty();

    function row(label, value) {
        $dl.append($('<dt>').text(label), $('<dd>').append(value));
    }

    row('URL',       $('<span>').text(data.final_url || '—'));
    row('Method',    $('<span>').text(data.method    || '—'));
    row('Status',    $('<span>').text(data.status ? data.status + ' ' + (data.status_text || '') : '—'));
    row('Duration',  $('<span>').text(data.duration_ms  != null ? data.duration_ms + ' ms'   : '—'));
    row('Size',      $('<span>').text(data.size_bytes   != null ? formatSize(data.size_bytes) : '—'));
    row('Timestamp', $('<span>').text(data.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString()));

    const envId = typeof getActiveEnvironmentId === 'function' ? getActiveEnvironmentId() : null;
    row('Environment', $('<span>').text(envId ? 'ID ' + envId : 'None'));

    // Unresolved {{variable}} warnings
    const unresolved = Array.isArray(data.unresolved_variables) ? data.unresolved_variables : [];
    if (unresolved.length > 0) {
        const $wrap = $('<div>').addClass('d-flex flex-wrap gap-1 mt-1');
        unresolved.forEach(function (v) {
            $wrap.append(
                $('<span>').addClass('unresolved-var-warning')
                           .html('<i class="bi bi-exclamation-triangle-fill"></i> {{' + escapeHtml(v) + '}}')
            );
        });
        row('Unresolved vars', $wrap);
        showToast('Warning: ' + unresolved.length + ' variable(s) not resolved — ' + unresolved.map(v => '{{' + v + '}}').join(', '), 'warning');
    }
}

// ---------------------------------------------------------------------------
// Clear / reset
// ---------------------------------------------------------------------------

function clearResponse() {
    $('#resp-placeholder').removeClass('d-none');
    $('#response-panel').addClass('d-none');
    $('#response-status-badge').text('').attr('class', 'response-status-badge');
    $('#response-duration').text('—');
    $('#response-size').text('—');
    $('#response-body').html('');
    $('#response-headers-tbody').empty();
    $('#response-info-list').empty();
    _rawBody      = '';
    _parsedJson   = null;
    _lastBodyType = 'text';
    _wrapActive   = false;
    _searchQuery  = '';
    _isHtmlResp   = false;
    $('#resp-preview-tab-li').addClass('d-none');
    const _previewFrame = document.getElementById('resp-preview-frame');
    if (_previewFrame) _previewFrame.srcdoc = '';
    $('#wrap-response-btn').removeClass('btn-active');
    $('#response-body').removeClass('wrap');
    $('#resp-search-input').val('');
    $('#resp-search-count').addClass('d-none');
    $('#resp-search-clear').addClass('d-none');
}
