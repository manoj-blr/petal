// headers.js — Headers tab: key-value editor for request headers
//
// Overrides window.getRequestHeaders() (stubbed in request.js) so the
// send flow picks up the correct headers on every send.
//
// Storage format for saved requests:
//   headers: [{key, value, enabled}, ...]   — preserves disabled rows
//
// Send format (returned by getRequestHeaders):
//   {HeaderName: value, ...}               — enabled rows with non-empty keys only

// ---------------------------------------------------------------------------
// Override stub — defined here so it's always live once this file loads
// ---------------------------------------------------------------------------

window.getRequestHeaders = function () {
    const headers = {};
    $('#headers-tbody tr').each(function () {
        const $row    = $(this);
        const checked = $row.find('input[type="checkbox"]').prop('checked');
        const key     = $row.find('.kv-input').eq(0).val().trim();
        const value   = $row.find('.kv-input').eq(1).val();
        if (checked && key !== '') {
            headers[key] = value;
        }
    });
    return headers;
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    initHeadersTab();

    $(document).on('petal:load-request', function (e, req) {
        loadHeadersFromRequest(req);
    });

    $(document).on('petal:clear-request', function () {
        clearHeaders();
    });
});

// ---------------------------------------------------------------------------
// Tab setup
// ---------------------------------------------------------------------------

function initHeadersTab() {
    const $tab = $('#tab-headers').empty();

    const $table = $('<table>').addClass('kv-table w-100');
    const $thead = $('<thead>').append(
        $('<tr>').append(
            $('<th>').css('width', '34px'),   // checkbox
            $('<th>').text('Key'),
            $('<th>').text('Value'),
            $('<th>').css('width', '34px')    // delete
        )
    );
    const $tbody = $('<tbody>').attr('id', 'headers-tbody');
    $table.append($thead, $tbody);

    const $addBtn = $('<button>')
        .addClass('btn-add-row')
        .html('<i class="bi bi-plus"></i> Add header')
        .on('click', function () {
            addHeaderRow('', '', true);
            $('#headers-tbody tr:last-child .kv-input').first().focus();
        });

    $tab.append(
        $('<div>').append($table),
        $('<div>').addClass('px-1 pt-1').append($addBtn)
    );

    // Pre-populate standard JSON API headers (checked by default)
    addHeaderRow('Accept',       'application/json', true);
    addHeaderRow('Content-Type', 'application/json', true);
}

function addHeaderRow(key, value, enabled) {
    const $row = buildHeaderRow(key, value, enabled);
    $('#headers-tbody').append($row);
    updateHeadersBadge();
    return $row;
}

function buildHeaderRow(key, value, enabled) {
    const $row = $('<tr>');

    const $cb = $('<input>')
        .attr({ type: 'checkbox' })
        .prop('checked', enabled !== false)
        .on('change', function () { updateHeadersBadge(); markDirty(); });

    const $keyInput = $('<input>')
        .addClass('kv-input')
        .attr({ type: 'text', value: key, placeholder: 'Header-Name', spellcheck: false })
        .on('input', function () { updateHeadersBadge(); markDirty(); });

    const $valInput = $('<input>')
        .addClass('kv-input')
        .attr({ type: 'text', value: value, placeholder: 'value', spellcheck: false })
        .on('input', function () { markDirty(); });

    const $del = $('<button>')
        .addClass('btn-kv-delete')
        .attr('title', 'Remove')
        .html('<i class="bi bi-x"></i>')
        .on('click', function () {
            $row.remove();
            updateHeadersBadge();
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

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

function updateHeadersBadge() {
    let count = 0;
    $('#headers-tbody tr').each(function () {
        const $row = $(this);
        if ($row.find('input[type="checkbox"]').prop('checked') &&
            $row.find('.kv-input').eq(0).val().trim() !== '') {
            count++;
        }
    });

    const $badge = $('#headers-count');
    if (count > 0) {
        $badge.text(count).removeClass('d-none');
    } else {
        $badge.addClass('d-none');
    }
}

// ---------------------------------------------------------------------------
// Load / clear
// ---------------------------------------------------------------------------

function loadHeadersFromRequest(req) {
    $('#headers-tbody').empty();

    if (Array.isArray(req.headers) && req.headers.length > 0) {
        // New format: [{key, value, enabled}]
        req.headers.forEach(function (h) {
            addHeaderRow(h.key || '', h.value || '', h.enabled !== false);
        });
    } else if (req.headers && typeof req.headers === 'object') {
        // Legacy/fallback: plain {Key: value} object — treat all as enabled
        Object.entries(req.headers).forEach(function ([key, value]) {
            addHeaderRow(key, String(value), true);
        });
    } else {
        // No saved headers — restore standard JSON API defaults
        addHeaderRow('Accept',       'application/json', true);
        addHeaderRow('Content-Type', 'application/json', true);
    }

    updateHeadersBadge();
}

function clearHeaders() {
    $('#headers-tbody').empty();
    // Restore standard JSON API defaults
    addHeaderRow('Accept',       'application/json', true);
    addHeaderRow('Content-Type', 'application/json', true);
    updateHeadersBadge();
}

// ---------------------------------------------------------------------------
// Expose for save flow (TASK 6.2)
// Returns all rows with non-empty keys, including disabled ones.
// ---------------------------------------------------------------------------

function getAllHeaders() {
    const headers = [];
    $('#headers-tbody tr').each(function () {
        const $row  = $(this);
        const key   = $row.find('.kv-input').eq(0).val().trim();
        const value = $row.find('.kv-input').eq(1).val();
        if (key !== '') {
            headers.push({
                enabled: $row.find('input[type="checkbox"]').prop('checked'),
                key,
                value,
            });
        }
    });
    return headers;
}
