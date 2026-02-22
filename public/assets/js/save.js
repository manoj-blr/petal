// save.js — Save & update request flow
//
// New request  (no id) → open save modal → POST  → setCurrentRequest + refresh sidebar
// Existing request     → silent PUT               → markClean + refresh sidebar
//
// Depends on:
//   request.js   — getCurrentRequestId(), getCurrentRequestName(), setCurrentRequest(), markClean()
//   collections.js — getCollections(), setActiveRequestId(), loadCollections()
//   headers.js   — getAllHeaders()
//   body.js      — getBodyType(), getAllBodyFormRows()
//   request.js   — getAllParams()

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    // Ctrl+S shortcut (fired by shortcuts.js)
    $(document).on('petal:save', handleSave);

    // Save button in request name bar
    $('#save-btn').on('click', handleSave);

    // Modal confirm button
    $('#save-request-confirm-btn').on('click', confirmSave);

    // Enter in name input submits
    $('#save-name-input').on('keydown', function (e) {
        if (e.key === 'Enter') confirmSave();
    });

    // Clear validation state when user starts typing again
    $('#save-name-input').on('input', function () {
        $(this).removeClass('is-invalid');
    });

    // Populate collection dropdown each time modal opens
    $('#save-request-modal').on('show.bs.modal', function () {
        populateCollectionDropdown();
    });

    // Focus name input once modal is fully visible
    $('#save-request-modal').on('shown.bs.modal', function () {
        $('#save-name-input').trigger('select').focus();
    });

    // Notes textarea — load, clear, dirty tracking
    $(document).on('petal:load-request', function (e, req) {
        $('#notes-textarea').val(req.notes || '');
    });

    $(document).on('petal:clear-request', function () {
        $('#notes-textarea').val('');
    });

    $('#notes-textarea').on('input', function () {
        if (typeof markDirty === 'function') markDirty();
    });
});

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function handleSave() {
    const id = getCurrentRequestId();   // null for new, int for existing
    if (id) {
        updateRequest(id);
    } else {
        openSaveModal();
    }
}

// ---------------------------------------------------------------------------
// New request — modal flow
// ---------------------------------------------------------------------------

function openSaveModal() {
    const currentName = getCurrentRequestName();
    $('#save-name-input')
        .val(currentName === 'New Request' ? '' : currentName)
        .removeClass('is-invalid');

    populateCollectionDropdown();

    const modal = new bootstrap.Modal($('#save-request-modal')[0]);
    modal.show();
}

function populateCollectionDropdown() {
    const $select = $('#save-collection-select')
        .empty()
        .append($('<option>').val('').text('— No collection —'));

    const collections = (typeof getCollections === 'function') ? getCollections() : [];

    // Pre-select the collection of whichever request is currently active in the sidebar
    let preselectedId = null;
    const activeReqId = (typeof getActiveRequestId === 'function') ? getActiveRequestId() : null;
    if (activeReqId) {
        const allReqs = (typeof getAllRequests === 'function') ? getAllRequests() : [];
        const activeReq = allReqs.find(function (r) { return r.id === activeReqId; });
        if (activeReq && activeReq.collection_id) {
            preselectedId = activeReq.collection_id;
        }
    }

    collections.forEach(function (coll) {
        $select.append(
            $('<option>').val(coll.id).text(coll.name)
                         .prop('selected', coll.id === preselectedId)
        );
    });
}

function confirmSave() {
    const name = $('#save-name-input').val().trim();
    if (!name) {
        $('#save-name-input').addClass('is-invalid').focus();
        return;
    }

    const collectionId = $('#save-collection-select').val()
        ? parseInt($('#save-collection-select').val(), 10)
        : null;

    const payload = buildSavePayload(name, collectionId);

    const $btn = $('#save-request-confirm-btn')
        .prop('disabled', true)
        .text('Saving…');

    $.ajax({
        url:         API_BASE + '/requests.php',
        method:      'POST',
        contentType: 'application/json',
        data:        JSON.stringify(payload),
    })
    .done(function (res) {
        if (res.success) {
            const req = res.data;
            bootstrap.Modal.getInstance($('#save-request-modal')[0])?.hide();
            setCurrentRequest(req.id, req.name);    // marks clean, updates name bar
            if (typeof setActiveRequestId === 'function') setActiveRequestId(req.id);
            if (typeof loadCollections   === 'function') loadCollections();
            $(document).trigger('petal:request-saved', [req]);
            showToast('Request saved', 'success');
        } else {
            showToast(res.error || 'Save failed', 'error');
        }
    })
    .fail(function () { showToast('Save failed', 'error'); })
    .always(function () {
        $btn.prop('disabled', false).text('Save');
    });
}

// ---------------------------------------------------------------------------
// Existing request — silent update
// ---------------------------------------------------------------------------

function updateRequest(id) {
    const payload = buildSavePayload(getCurrentRequestName(), null);
    // Don't touch collection_id on update — preserve whatever collection it's in

    $.ajax({
        url:         API_BASE + '/requests.php?id=' + id,
        method:      'PUT',
        contentType: 'application/json',
        data:        JSON.stringify(payload),
    })
    .done(function (res) {
        if (res.success) {
            markClean();                                        // clears unsaved dot
            if (typeof loadCollections === 'function') loadCollections();
            $(document).trigger('petal:request-saved', [res.data]);
            showToast('Saved', 'success');
        } else {
            showToast(res.error || 'Save failed', 'error');
        }
    })
    .fail(function () { showToast('Save failed', 'error'); });
}

// ---------------------------------------------------------------------------
// Build the payload from all tab editors
// ---------------------------------------------------------------------------

function buildSavePayload(name, collectionId) {
    const method   = $('#method-select').val();
    const url      = $('#url-input').val().trim();
    const bodyType = (typeof getBodyType === 'function') ? getBodyType() : 'none';
    const params   = (typeof getAllParams  === 'function') ? getAllParams()  : [];
    const headers  = (typeof getAllHeaders === 'function') ? getAllHeaders() : [];

    // Body: textarea content for json/raw; JSON-serialized row array for form
    let body = null;
    if (bodyType === 'json' || bodyType === 'raw') {
        const raw = $('#body-textarea').val();
        body = raw !== '' ? raw : null;
    } else if (bodyType === 'form') {
        const rows = (typeof getAllBodyFormRows === 'function') ? getAllBodyFormRows() : [];
        body = rows.length > 0 ? JSON.stringify(rows) : null;
    }

    const auth       = (typeof getAuthData    === 'function') ? getAuthData()    : { type: 'none' };
    const notes      = $('#notes-textarea').val().trim() || null;
    const verifySsl  = (typeof getSslVerify   === 'function') ? (getSslVerify() ? 1 : 0) : 1;
    const timeoutSec = (typeof getTimeoutSec  === 'function') ? getTimeoutSec() : 30;

    const payload = {
        name,
        method,
        url,
        headers,            // [{key, value, enabled}]
        body,
        body_type: bodyType,
        params,             // [{key, value, enabled}]
        auth,
        notes,
        verify_ssl:  verifySsl,
        timeout_sec: timeoutSec,
    };

    if (collectionId !== null && collectionId !== undefined) {
        payload.collection_id = collectionId;
    }

    return payload;
}
