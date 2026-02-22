// request.js — request builder: URL bar, method select, send/cancel logic
//
// Architecture note: this file owns the send flow.
// Other tab modules (params, headers, body) plug in by implementing:
//   getRequestHeaders()   → object   (TASK 4.3)
//   getRequestBody()      → string|null (TASK 4.4)
//   getRequestBodyType()  → 'none'|'json'|'form'|'raw' (TASK 4.4)
// Params (TASK 4.2) modify the URL input directly — no getter needed.

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _currentXhr  = null;   // the in-flight jQuery XHR object (for abort)
let _isSending   = false;  // guard against double-send

// Track the currently loaded saved request (null = unsaved/new)
let _currentRequestId   = null;
let _currentRequestName = 'New Request';
let _isDirty            = false; // unsaved changes indicator

// ---------------------------------------------------------------------------
// Stubs — overridden by TASK 4.3 and 4.4 when those tabs are built
// ---------------------------------------------------------------------------

// Returns an object of { HeaderName: value } for enabled header rows.
// Overridden by headers.js in TASK 4.3.
if (typeof getRequestHeaders === 'undefined') {
    window.getRequestHeaders = function () { return {}; };
}

// Returns the raw body string (or null for no body).
// Overridden by body logic in TASK 4.4.
if (typeof getRequestBody === 'undefined') {
    window.getRequestBody = function () { return null; };
}

// Returns the body type: 'none' | 'json' | 'form' | 'raw'.
// Overridden by body logic in TASK 4.4.
if (typeof getRequestBodyType === 'undefined') {
    window.getRequestBodyType = function () { return 'none'; };
}

// Returns true if the body is valid and the send can proceed; false to abort.
// Overridden by body.js in TASK 4.4 to validate JSON.
if (typeof validateRequestBody === 'undefined') {
    window.validateRequestBody = function () { return true; };
}

// Returns auth headers to merge into the send payload (e.g. Authorization header).
// Overridden by auth.js.
if (typeof getAuthHeaders === 'undefined') {
    window.getAuthHeaders = function () { return {}; };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    // Send button: send when idle, cancel when in-flight
    $('#send-btn').on('click', function () {
        if (_isSending) {
            cancelRequest();
        } else {
            sendRequest();
        }
    });

    // Keyboard shortcut (Ctrl+Enter) — fired by shortcuts.js
    $(document).on('petal:send', sendRequest);

    // Mark workspace dirty whenever method, URL, or timeout changes
    $('#method-select, #url-input').on('change input', function () {
        markDirty();
    });

    $('#timeout-input').on('change', function () {
        // Clamp to valid range on blur/change
        const val = parseInt($(this).val(), 10);
        if (isNaN(val) || val < 1)   $(this).val(1);
        if (val > 300)               $(this).val(300);
        markDirty();
    });

    // SSL verification toggle
    $('#ssl-toggle-btn').on('click', function () {
        setSslToggle($('#ssl-toggle-btn').hasClass('ssl-off'));  // flip current state
        markDirty();
    });

    // New request — sidebar button, topbar button, and keyboard shortcut (Alt+N)
    $(document).on('petal:new-request', newRequest);
    $('#new-request-btn, #topbar-new-btn').on('click', newRequest);

    // ── Params tab init ──────────────────────────────────────────────────────
    initParamsTab();

    $(document).on('petal:load-request', function (e, req) {
        loadParamsFromRequest(req);
    });

    $(document).on('petal:clear-request', function () {
        clearParams();
    });
});

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

function sendRequest() {
    if (_isSending) return; // hard guard against double-trigger

    const method   = $('#method-select').val();
    const url      = $('#url-input').val().trim();

    if (!url) {
        showToast('Enter a URL first', 'warning');
        $('#url-input').focus();
        return;
    }

    // Let the body module validate before we send (e.g. JSON syntax check)
    if (!window.validateRequestBody()) return;

    // Auth headers are merged first; user-set headers in the Headers tab override them.
    const headers = Object.assign({}, window.getAuthHeaders(), window.getRequestHeaders());

    const payload = {
        method:         method,
        url:            url,
        headers:        headers,
        body:           window.getRequestBody(),
        body_type:      window.getRequestBodyType(),
        environment_id: getActiveEnvironmentId(),
        verify_ssl:     getSslVerify() ? 1 : 0,
        timeout_sec:    getTimeoutSec(),
    };

    debug('sending request', payload);

    setSendingState(true);

    _currentXhr = $.ajax({
        url:         API_BASE + '/send_request.php',
        method:      'POST',
        contentType: 'application/json',
        data:        JSON.stringify(payload),
        dataType:    'json',
    })
    .done(function (res) {
        setSendingState(false);
        if (res.success) {
            debug('response received', res.data);
            $(document).trigger('petal:response-received', [res.data]);
            // Refresh history panel after every send
            if (typeof loadHistory === 'function') loadHistory();
        } else {
            showToast(res.error || 'Request failed', 'error');
        }
    })
    .fail(function (xhr, status) {
        setSendingState(false);
        if (status === 'abort') {
            showToast('Request cancelled', 'info');
            return;
        }
        const msg = xhr.responseJSON?.error || 'Request failed — check the console';
        showToast(msg, 'error');
        debug('send failed', xhr.responseText);
    });
}

function cancelRequest() {
    if (_currentXhr) {
        _currentXhr.abort();
        _currentXhr = null;
    }
    setSendingState(false);
}

// ---------------------------------------------------------------------------
// Sending state — spinner, disable inputs, swap label to Cancel
// ---------------------------------------------------------------------------

function setSendingState(on) {
    _isSending = on;

    const $btn      = $('#send-btn');
    const $label    = $btn.find('.send-label');
    const $shortcut = $btn.find('.send-shortcut');
    const $spinner  = $('#send-spinner');

    if (on) {
        $label.text('Cancel');
        $shortcut.addClass('d-none');
        $spinner.removeClass('d-none');
        $btn.addClass('sending');
        // Disable method + URL so the user can't change them mid-flight
        $('#method-select, #url-input').prop('disabled', true);
    } else {
        $label.text('Send');
        $shortcut.removeClass('d-none');
        $spinner.addClass('d-none');
        $btn.removeClass('sending');
        $('#method-select, #url-input').prop('disabled', false);
        _currentXhr = null;
    }
}

// ---------------------------------------------------------------------------
// New request — clear workspace
// ---------------------------------------------------------------------------

function newRequest() {
    if (_isDirty && !confirm('Discard unsaved changes?')) return;

    _currentRequestId   = null;
    _currentRequestName = 'New Request';

    // Reset URL bar
    $('#url-input').val('');
    $('#method-select').val('GET');
    syncMethodColor('#method-select');
    setSslToggle(true);       // reset to verified for new requests
    $('#timeout-input').val(30); // reset to 30s for new requests

    // Reset tabs (4.2-4.4 will clear their own content)
    $(document).trigger('petal:clear-request');

    // Clear response panel
    $(document).trigger('petal:clear-response');

    updateRequestNameBar();
    markClean();
    $('#url-input').focus();
}

// ---------------------------------------------------------------------------
// Load a saved request into the workspace
// ---------------------------------------------------------------------------

function loadSavedRequest(req, onLoaded) {
    if (_isDirty && !confirm('Discard unsaved changes?')) return;

    _currentRequestId   = req.id;
    _currentRequestName = req.name;

    $('#url-input').val(req.url || '');

    // Use .trigger('change') so syncMethodColor (app.js) AND
    // syncBodyVisibility (body.js) both fire automatically.
    $('#method-select').val(req.method || 'GET').trigger('change');

    // verify_ssl: 0 = skip, anything else (1, null) = verify (safe default)
    setSslToggle(req.verify_ssl !== 0);
    $('#timeout-input').val(req.timeout_sec || 30);

    // Broadcast to tab modules so they can populate their editors
    $(document).trigger('petal:load-request', [req]);

    // Clear any previous response
    $(document).trigger('petal:clear-response');

    updateRequestNameBar();
    markClean();

    // Optional callback — used by history.js to render the stored response
    if (typeof onLoaded === 'function') onLoaded();
}

// ---------------------------------------------------------------------------
// Dirty / clean tracking
// ---------------------------------------------------------------------------

function markDirty() {
    if (_isDirty) return;
    _isDirty = true;
    $('#unsaved-dot').removeClass('d-none');
}

function markClean() {
    _isDirty = false;
    $('#unsaved-dot').addClass('d-none');
}

function updateRequestNameBar() {
    $('#request-name-label').text(_currentRequestName);
}

// Expose for collections.js / save flow
function getCurrentRequestId()   { return _currentRequestId; }
function getCurrentRequestName() { return _currentRequestName; }
function setCurrentRequest(id, name) {
    _currentRequestId   = id;
    _currentRequestName = name;
    updateRequestNameBar();
    markClean();
}

// ---------------------------------------------------------------------------
// SSL verification toggle
// ---------------------------------------------------------------------------

function setSslToggle(verify) {
    const $btn = $('#ssl-toggle-btn');
    if (verify) {
        $btn.removeClass('ssl-off')
            .attr('title', 'SSL verification ON — click to disable for self-signed certs')
            .find('i').attr('class', 'bi bi-shield-check');
    } else {
        $btn.addClass('ssl-off')
            .attr('title', 'SSL verification OFF — self-signed certs accepted')
            .find('i').attr('class', 'bi bi-shield-x');
    }
}

function getSslVerify() {
    return !$('#ssl-toggle-btn').hasClass('ssl-off');
}

function getTimeoutSec() {
    const val = parseInt($('#timeout-input').val(), 10);
    return isNaN(val) || val < 1 ? 30 : Math.min(val, 300);
}

// =============================================================================
// PARAMS TAB  (TASK 4.2)
// =============================================================================
//
// Params are the source of truth for the URL query string.
// Every change to a param row rebuilds the ?key=value portion of the URL bar.
// The send function simply reads the URL input — no separate getter needed.

function initParamsTab() {
    const $tab = $('#tab-params').empty();

    const $table = $('<table>').addClass('kv-table w-100');
    const $thead = $('<thead>').append(
        $('<tr>').append(
            $('<th>').css('width', '34px'),   // checkbox
            $('<th>').text('Key'),
            $('<th>').text('Value'),
            $('<th>').css('width', '34px')    // delete
        )
    );
    const $tbody = $('<tbody>').attr('id', 'params-tbody');
    $table.append($thead, $tbody);

    const $addBtn = $('<button>')
        .addClass('btn-add-row')
        .html('<i class="bi bi-plus"></i> Add parameter')
        .on('click', function () {
            addParamRow('', '', true);
            $('#params-tbody tr:last-child .kv-input').first().focus();
        });

    $tab.append(
        $('<div>').append($table),
        $('<div>').addClass('px-1 pt-1').append($addBtn)
    );
}

function addParamRow(key, value, enabled) {
    const $row = buildParamRow(key, value, enabled);
    $('#params-tbody').append($row);
    syncUrlFromParams();
    return $row;
}

function buildParamRow(key, value, enabled) {
    const $row = $('<tr>');

    const $cb = $('<input>')
        .attr({ type: 'checkbox' })
        .prop('checked', enabled !== false)
        .on('change', function () { syncUrlFromParams(); markDirty(); });

    const $keyInput = $('<input>')
        .addClass('kv-input')
        .attr({ type: 'text', value: key, placeholder: 'key', spellcheck: false })
        .on('input', function () { syncUrlFromParams(); markDirty(); });

    const $valInput = $('<input>')
        .addClass('kv-input')
        .attr({ type: 'text', value: value, placeholder: 'value', spellcheck: false })
        .on('input', function () { syncUrlFromParams(); markDirty(); });

    const $del = $('<button>')
        .addClass('btn-kv-delete')
        .attr('title', 'Remove')
        .html('<i class="bi bi-x"></i>')
        .on('click', function () {
            $row.remove();
            syncUrlFromParams();
            markDirty();
        });

    $row.append(
        $('<td>').addClass('text-center').append($cb),
        $('<td>').append($keyInput),
        $('<td>').append($valInput),
        $('<td>').append($del)
    );
    return $row;
}

// Strips the query string from a URL and returns the base
function stripQueryString(url) {
    const idx = url.indexOf('?');
    return idx === -1 ? url : url.substring(0, idx);
}

// Rebuilds the URL bar query string from enabled param rows with non-empty keys
function syncUrlFromParams() {
    const base   = stripQueryString($('#url-input').val());
    const params = getEnabledParams();

    if (params.length === 0) {
        $('#url-input').val(base);
    } else {
        const qs = params
            .map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value))
            .join('&');
        $('#url-input').val(base + '?' + qs);
    }

    updateParamsBadge();
}

// Returns enabled rows that have a non-empty key
function getEnabledParams() {
    const params = [];
    $('#params-tbody tr').each(function () {
        const $row    = $(this);
        const checked = $row.find('input[type="checkbox"]').prop('checked');
        const key     = $row.find('.kv-input').eq(0).val().trim();
        const value   = $row.find('.kv-input').eq(1).val();
        if (checked && key !== '') {
            params.push({ key, value });
        }
    });
    return params;
}

// Returns all rows (including disabled) with non-empty keys — used when saving
function getAllParams() {
    const params = [];
    $('#params-tbody tr').each(function () {
        const $row  = $(this);
        const key   = $row.find('.kv-input').eq(0).val().trim();
        const value = $row.find('.kv-input').eq(1).val();
        if (key !== '') {
            params.push({
                enabled: $row.find('input[type="checkbox"]').prop('checked'),
                key,
                value,
            });
        }
    });
    return params;
}

function updateParamsBadge() {
    const count = getEnabledParams().length;
    const $badge = $('#params-count');
    if (count > 0) {
        $badge.text(count).removeClass('d-none');
    } else {
        $badge.addClass('d-none');
    }
}

// Populate params tab from a saved request object
function loadParamsFromRequest(req) {
    $('#params-tbody').empty();
    if (Array.isArray(req.params) && req.params.length > 0) {
        req.params.forEach(function (p) {
            // Stored params are {key, value, enabled} objects
            addParamRow(p.key || '', p.value || '', p.enabled !== false);
        });
    }
    // URL is already set by loadSavedRequest() — don't re-sync to avoid double-encoding
    updateParamsBadge();
}

function clearParams() {
    $('#params-tbody').empty();
    updateParamsBadge();
    // Don't touch URL here — newRequest() already cleared it
}
