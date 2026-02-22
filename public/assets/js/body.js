// body.js — Body tab: None / JSON / Form-data / Raw editor
//
// Overrides window.getRequestBody() and window.getRequestBodyType()
// (stubbed in request.js) so the send flow picks up the correct body.
//
// Body is hidden and disabled for GET and HEAD methods.

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _bodyType = 'none'; // 'none' | 'json' | 'form' | 'raw'

// ---------------------------------------------------------------------------
// Override stubs
// ---------------------------------------------------------------------------

// Called by sendRequest() before the XHR fires.
// Returns false (and shows an error) if JSON body is invalid.
window.validateRequestBody = function () {
    if (_bodyType === 'json') {
        const raw = $('#body-textarea').val().trim();
        if (raw !== '') {
            try {
                JSON.parse(raw);
                $('#body-textarea').removeClass('body-invalid');
            } catch (_) {
                $('#body-textarea').addClass('body-invalid');
                showToast('JSON body is invalid — fix it before sending', 'error');
                $('[data-bs-target="#tab-body"]').tab('show');
                return false;
            }
        }
    }
    return true;
};

window.getRequestBody = function () {
    if (_bodyType === 'none') return null;
    if (_bodyType === 'json' || _bodyType === 'raw') {
        const val = $('#body-textarea').val();
        return val === '' ? null : val;
    }
    if (_bodyType === 'form') {
        // Serialize enabled form rows as URL-encoded string
        const pairs = [];
        $('#body-form-tbody tr').each(function () {
            const $row    = $(this);
            const checked = $row.find('input[type="checkbox"]').prop('checked');
            const key     = $row.find('.kv-input').eq(0).val().trim();
            const value   = $row.find('.kv-input').eq(1).val();
            if (checked && key !== '') {
                pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
            }
        });
        return pairs.length > 0 ? pairs.join('&') : null;
    }
    return null;
};

window.getRequestBodyType = function () {
    return _bodyType;
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    initBodyTab();

    // Hide body tab when method is GET or HEAD
    $('#method-select').on('change', function () {
        syncBodyVisibility($(this).val());
    });
    syncBodyVisibility($('#method-select').val());

    $(document).on('petal:load-request', function (e, req) {
        loadBodyFromRequest(req);
    });

    $(document).on('petal:clear-request', function () {
        clearBody();
    });
});

// ---------------------------------------------------------------------------
// Tab setup
// ---------------------------------------------------------------------------

function initBodyTab() {
    const $tab = $('#tab-body').empty();

    // ── Type selector ──────────────────────────────────────────────────────
    const $typeBar = $('<div>').addClass('body-type-bar');

    ['none', 'json', 'form', 'raw'].forEach(function (type) {
        const label = { none: 'None', json: 'JSON', form: 'Form', raw: 'Raw' }[type];
        const $radio = $('<input>')
            .attr({ type: 'radio', name: 'body-type', id: 'body-type-' + type, value: type });
        const $label = $('<label>')
            .attr('for', 'body-type-' + type)
            .text(label);
        $typeBar.append($radio, $label);
    });

    $tab.append($typeBar);

    // ── JSON / Raw textarea ────────────────────────────────────────────────
    const $textareaWrap = $('<div>').addClass('body-textarea-wrap');

    const $formatBtn = $('<button>')
        .addClass('btn-icon btn-icon-sm body-format-btn')
        .attr({ id: 'body-format-btn', title: 'Format JSON' })
        .html('<i class="bi bi-braces"></i> Format')
        .on('click', formatJsonBody);

    const $textarea = $('<textarea>')
        .attr({ id: 'body-textarea', spellcheck: false, autocomplete: 'off' })
        .addClass('body-textarea font-mono')
        .on('input', function () {
            $(this).removeClass('body-invalid');
            markDirty();
        });

    $textareaWrap.append($formatBtn, $textarea);
    $tab.append($textareaWrap);

    // ── Form data table ────────────────────────────────────────────────────
    const $formWrap = $('<div>').addClass('body-form-wrap d-none');

    const $table = $('<table>').addClass('kv-table w-100');
    const $thead = $('<thead>').append(
        $('<tr>').append(
            $('<th>').css('width', '34px'),
            $('<th>').text('Key'),
            $('<th>').text('Value'),
            $('<th>').css('width', '34px')
        )
    );
    const $tbody = $('<tbody>').attr('id', 'body-form-tbody');
    $table.append($thead, $tbody);

    const $addBtn = $('<button>')
        .addClass('btn-add-row')
        .html('<i class="bi bi-plus"></i> Add field')
        .on('click', function () {
            addBodyFormRow('', '', true);
            $('#body-form-tbody tr:last-child .kv-input').first().focus();
        });

    $formWrap.append(
        $('<div>').append($table),
        $('<div>').addClass('px-1 pt-1').append($addBtn)
    );
    $tab.append($formWrap);

    // ── None placeholder ───────────────────────────────────────────────────
    const $nonePlaceholder = $('<div>')
        .attr('id', 'body-none-placeholder')
        .addClass('tab-placeholder')
        .html('<i class="bi bi-slash-circle"></i><p>No body will be sent</p>');
    $tab.append($nonePlaceholder);

    // ── Wire type switcher ─────────────────────────────────────────────────
    $typeBar.on('change', 'input[name="body-type"]', function () {
        switchBodyType($(this).val());
    });

    // Set initial state
    $('input[name="body-type"][value="none"]').prop('checked', true);
    applyBodyType('none');
}

// ---------------------------------------------------------------------------
// Type switching
// ---------------------------------------------------------------------------

function switchBodyType(newType) {
    if (newType === _bodyType) return;

    // Warn if switching away from a type that has content
    if (_bodyTypeHasContent()) {
        if (!confirm('Switch body type? Current body content will be cleared.')) {
            // Revert radio
            $('input[name="body-type"][value="' + _bodyType + '"]').prop('checked', true);
            return;
        }
    }

    _clearBodyContent();
    applyBodyType(newType);
    markDirty();
}

function _bodyTypeHasContent() {
    if (_bodyType === 'json' || _bodyType === 'raw') {
        return $('#body-textarea').val().trim() !== '';
    }
    if (_bodyType === 'form') {
        return $('#body-form-tbody tr').length > 0;
    }
    return false;
}

function _clearBodyContent() {
    $('#body-textarea').val('').removeClass('body-invalid');
    $('#body-form-tbody').empty();
}

function applyBodyType(type) {
    _bodyType = type;

    const showTextarea = (type === 'json' || type === 'raw');
    const showForm     = (type === 'form');
    const showNone     = (type === 'none');

    $('.body-textarea-wrap').toggleClass('d-none', !showTextarea);
    $('.body-form-wrap').toggleClass('d-none', !showForm);
    $('#body-none-placeholder').toggleClass('d-none', !showNone);

    // Format button only visible in JSON mode
    $('#body-format-btn').toggleClass('d-none', type !== 'json');

    // Add a default row when switching to form if empty
    if (showForm && $('#body-form-tbody tr').length === 0) {
        addBodyFormRow('', '', true);
    }
}

// ---------------------------------------------------------------------------
// Form data rows
// ---------------------------------------------------------------------------

function addBodyFormRow(key, value, enabled) {
    const $row = buildBodyFormRow(key, value, enabled);
    $('#body-form-tbody').append($row);
    return $row;
}

function buildBodyFormRow(key, value, enabled) {
    const $row = $('<tr>');

    const $cb = $('<input>')
        .attr({ type: 'checkbox' })
        .prop('checked', enabled !== false)
        .on('change', function () { markDirty(); });

    const $keyInput = $('<input>')
        .addClass('kv-input')
        .attr({ type: 'text', value: key, placeholder: 'field', spellcheck: false })
        .on('input', function () { markDirty(); });

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
// JSON formatter
// ---------------------------------------------------------------------------

function formatJsonBody() {
    const raw = $('#body-textarea').val().trim();
    if (raw === '') return;

    try {
        const pretty = JSON.stringify(JSON.parse(raw), null, 2);
        $('#body-textarea').val(pretty).removeClass('body-invalid');
    } catch (_) {
        $('#body-textarea').addClass('body-invalid');
        showToast('Cannot format — invalid JSON', 'error');
    }
}

// ---------------------------------------------------------------------------
// Method visibility (hide body for GET / HEAD)
// ---------------------------------------------------------------------------

function syncBodyVisibility(method) {
    const noBody = (method === 'GET' || method === 'HEAD');
    const $bodyTabBtn = $('[data-bs-target="#tab-body"]');

    if (noBody) {
        $bodyTabBtn.addClass('tab-muted').prop('disabled', true);
        // If body tab is currently active, switch to Params
        if ($('#tab-body').hasClass('show')) {
            $('[data-bs-target="#tab-params"]').tab('show');
        }
    } else {
        $bodyTabBtn.removeClass('tab-muted').prop('disabled', false);
    }
}

// ---------------------------------------------------------------------------
// Load / clear
// ---------------------------------------------------------------------------

function loadBodyFromRequest(req) {
    const type = req.body_type || 'none';

    // Set radio without triggering the confirmation dialog
    $('input[name="body-type"][value="' + type + '"]').prop('checked', true);
    _clearBodyContent();
    applyBodyType(type);

    if (type === 'json' || type === 'raw') {
        $('#body-textarea').val(req.body || '');
    } else if (type === 'form') {
        // Form rows are saved as a JSON array in req.body: [{key, value, enabled}]
        let rows = [];
        try { rows = JSON.parse(req.body || '[]'); } catch (_) { rows = []; }
        if (Array.isArray(rows) && rows.length > 0) {
            rows.forEach(function (f) {
                addBodyFormRow(f.key || '', f.value || '', f.enabled !== false);
            });
        }
    }
}

function clearBody() {
    $('input[name="body-type"][value="none"]').prop('checked', true);
    _clearBodyContent();
    applyBodyType('none');
}

// ---------------------------------------------------------------------------
// Expose for save flow (TASK 6.2)
// ---------------------------------------------------------------------------

function getBodyType() {
    return _bodyType;
}

// Returns form rows as [{key, value, enabled}] for saving.
// Textarea body is read directly via getRequestBody() / body-textarea value.
function getAllBodyFormRows() {
    const rows = [];
    $('#body-form-tbody tr').each(function () {
        const $row  = $(this);
        const key   = $row.find('.kv-input').eq(0).val().trim();
        const value = $row.find('.kv-input').eq(1).val();
        if (key !== '') {
            rows.push({
                enabled: $row.find('input[type="checkbox"]').prop('checked'),
                key,
                value,
            });
        }
    });
    return rows;
}
