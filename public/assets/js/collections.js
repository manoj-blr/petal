// collections.js — Sidebar collections tree
//
// Loads collections + requests on page-load, renders a collapsible tree,
// and provides a per-request context menu (Rename / Duplicate / Move / Delete).

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _collections  = [];   // [{id, name, request_count, ...}]
let _requests     = [];   // [{id, collection_id, name, method, url, ...}]
let _activeReqId  = null; // id of the request currently open in workspace
let _collapsed    = {};   // {collectionId: true} for user-collapsed sections
let _ctxReqId     = null; // request id whose context menu is open

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    loadCollections();

    // New Collection button (sidebar header)
    $('#add-collection-btn').on('click', function (e) {
        e.stopPropagation();
        promptNewCollection();
    });

    // Close context menu on outside click or Esc
    $(document).on('click.ctxmenu', function (e) {
        if (!$(e.target).closest('#ctx-menu').length) hideCtxMenu();
    });
    $(document).on('petal:escape', hideCtxMenu);

    // After save (TASK 6.2) refresh the sidebar
    $(document).on('petal:request-saved', loadCollections);
});

// ---------------------------------------------------------------------------
// Load data + render
// ---------------------------------------------------------------------------

function loadCollections() {
    const colReq = $.ajax({ url: API_BASE + '/collections.php', method: 'GET' });
    const reqReq = $.ajax({ url: API_BASE + '/requests.php',    method: 'GET' });

    $.when(colReq, reqReq)
        .done(function (colRes, reqRes) {
            _collections = (colRes[0].success ? colRes[0].data  : []) || [];
            _requests    = (reqRes[0].success  ? reqRes[0].data  : []) || [];
            renderSidebar();
        })
        .fail(function () {
            $('#collections-list').html(
                '<div class="sidebar-empty">' +
                '<i class="bi bi-exclamation-triangle"></i>' +
                '<p>Failed to load</p></div>'
            );
        });
}

function renderSidebar() {
    const $list = $('#collections-list').empty();

    if (_collections.length === 0 && _requests.length === 0) {
        $list.html(
            '<div class="sidebar-empty">' +
            '<i class="bi bi-folder"></i>' +
            '<p>No saved requests yet</p>' +
            '<small>Hit Alt+N to create one</small>' +
            '</div>'
        );
        return;
    }

    // Named collections
    _collections.forEach(function (coll) {
        const collReqs = _requests.filter(function (r) { return r.collection_id === coll.id; });
        $list.append(buildCollectionSection(coll, collReqs));
    });

    // Unsorted (no collection)
    const unsorted = _requests.filter(function (r) { return !r.collection_id; });
    if (unsorted.length > 0) {
        $list.append(buildUnsortedSection(unsorted));
    }
}

// ---------------------------------------------------------------------------
// Collection section
// ---------------------------------------------------------------------------

function buildCollectionSection(coll, requests) {
    const isCollapsed = _collapsed[coll.id] === true;

    const $section = $('<div>').addClass('collection-section')
                               .attr('data-collection-id', coll.id);

    const $header = $('<div>').addClass('collection-item').append(
        $('<i>').addClass('bi bi-chevron-right collection-chevron' + (isCollapsed ? '' : ' open')),
        $('<i>').addClass('bi bi-folder2 collection-folder-icon'),
        $('<span>').addClass('collection-name flex-1 text-truncate').text(coll.name),
        requests.length > 0
            ? $('<span>').addClass('collection-count').text(requests.length)
            : null
    ).on('click', function () { toggleCollection(coll.id); });

    const $requests = $('<div>').addClass('collection-requests').toggle(!isCollapsed);

    requests.forEach(function (req) {
        $requests.append(buildRequestItem(req));
    });

    if (requests.length === 0) {
        $requests.append(
            $('<div>').addClass('collection-empty-hint').text('Empty collection')
        );
    }

    $section.append($header, $requests);
    return $section;
}

function toggleCollection(collId) {
    _collapsed[collId] = !_collapsed[collId];
    const $section = $('.collection-section[data-collection-id="' + collId + '"]');
    $section.find('.collection-chevron').toggleClass('open', !_collapsed[collId]);
    $section.find('.collection-requests').slideToggle(130);
}

// ---------------------------------------------------------------------------
// Unsorted section
// ---------------------------------------------------------------------------

function buildUnsortedSection(requests) {
    const $section = $('<div>').addClass('collection-section');

    const $header = $('<div>').addClass('collection-item unsorted-header').append(
        $('<i>').addClass('bi bi-chevron-right collection-chevron open'),
        $('<i>').addClass('bi bi-inbox collection-folder-icon'),
        $('<span>').addClass('flex-1').text('Unsorted'),
        $('<span>').addClass('collection-count').text(requests.length)
    );

    const $requests = $('<div>').addClass('collection-requests');
    requests.forEach(function (req) { $requests.append(buildRequestItem(req)); });

    let open = true;
    $header.on('click', function () {
        open = !open;
        $header.find('.collection-chevron').toggleClass('open', open);
        $requests.slideToggle(130);
    });

    $section.append($header, $requests);
    return $section;
}

// ---------------------------------------------------------------------------
// Request item
// ---------------------------------------------------------------------------

function buildRequestItem(req) {
    const $item = $('<div>')
        .addClass('saved-request-item' + (req.id === _activeReqId ? ' active' : ''))
        .attr('data-request-id', req.id);

    const $menuBtn = $('<button>')
        .addClass('btn-ctx-menu')
        .attr('title', 'Options')
        .html('<i class="bi bi-three-dots"></i>')
        .on('click', function (e) {
            e.stopPropagation();
            showCtxMenu(req.id, $(this));
        });

    $item.append(
        $('<span>').addClass('method-badge ' + req.method).text(req.method),
        $('<span>').addClass('item-name flex-1').text(req.name),
        $menuBtn
    );

    $item.on('click', function () { loadRequestById(req.id); });

    return $item;
}

// ---------------------------------------------------------------------------
// Load request into workspace
// ---------------------------------------------------------------------------

function loadRequestById(id) {
    // Use cached object — list endpoint returns all fields (decoded)
    const req = _requests.find(function (r) { return r.id === id; });
    if (req) {
        _activeReqId = id;
        updateActiveHighlight();
        loadSavedRequest(req);   // defined in request.js
        return;
    }
    // Fallback: fetch fresh from API
    $.ajax({ url: API_BASE + '/requests.php?id=' + id, method: 'GET' })
        .done(function (res) {
            if (res.success) {
                _activeReqId = id;
                updateActiveHighlight();
                loadSavedRequest(res.data);
            } else {
                showToast(res.error || 'Could not load request', 'error');
            }
        });
}

function updateActiveHighlight() {
    $('.saved-request-item').removeClass('active');
    if (_activeReqId) {
        $('.saved-request-item[data-request-id="' + _activeReqId + '"]').addClass('active');
    }
}

// ---------------------------------------------------------------------------
// Context menu — show / hide / position
// ---------------------------------------------------------------------------

function showCtxMenu(reqId, $anchor) {
    _ctxReqId = reqId;
    const req = _requests.find(function (r) { return r.id === reqId; });
    if (!req) return;

    const $menu = $('#ctx-menu');

    // Build "Move to" list
    const $moveList = $menu.find('.ctx-move-list').empty();
    let hasMoveOptions = false;

    _collections.forEach(function (coll) {
        if (coll.id === req.collection_id) return; // skip current collection
        hasMoveOptions = true;
        $('<button>').addClass('ctx-item ctx-item-sm')
            .text(coll.name)
            .on('click', function () { moveRequest(reqId, coll.id); hideCtxMenu(); })
            .appendTo($moveList);
    });

    if (req.collection_id) {
        hasMoveOptions = true;
        $('<button>').addClass('ctx-item ctx-item-sm ctx-item-muted')
            .text('Remove from collection')
            .on('click', function () { moveRequest(reqId, null); hideCtxMenu(); })
            .appendTo($moveList);
    }

    if (!hasMoveOptions) {
        $('<span>').addClass('ctx-empty-hint').text('No collections available').appendTo($moveList);
    }

    // Position using fixed coords (avoids sidebar overflow clipping)
    const rect   = $anchor[0].getBoundingClientRect();
    const menuH  = 220; // estimated height before rendering
    const menuW  = 180;
    const winH   = window.innerHeight;
    const winW   = window.innerWidth;

    const top  = (rect.bottom + menuH > winH) ? rect.top - menuH : rect.bottom + 2;
    const left = Math.max(4, Math.min(rect.left, winW - menuW - 4));

    $menu.css({ top: top + 'px', left: left + 'px' }).removeClass('d-none').addClass('ctx-pop');
}

function hideCtxMenu() {
    $('#ctx-menu').addClass('d-none').removeClass('ctx-pop');
    _ctxReqId = null;
}

// Wire ctx-menu buttons — bind once, read _ctxReqId at click time
$(function () {
    $('#ctx-rename').on('click', function () {
        const id = _ctxReqId; hideCtxMenu(); renameRequest(id);
    });
    $('#ctx-duplicate').on('click', function () {
        const id = _ctxReqId; hideCtxMenu(); duplicateRequest(id);
    });
    $('#ctx-delete').on('click', function () {
        const id = _ctxReqId; hideCtxMenu(); deleteRequest(id);
    });
});

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

function renameRequest(id) {
    const req  = _requests.find(function (r) { return r.id === id; });
    if (!req) return;
    const name = prompt('Rename to:', req.name);
    if (!name || !name.trim() || name.trim() === req.name) return;

    $.ajax({
        url:         API_BASE + '/requests.php?id=' + id,
        method:      'PUT',
        contentType: 'application/json',
        data:        JSON.stringify({ name: name.trim() }),
    }).done(function (res) {
        if (res.success) {
            showToast('Renamed', 'success');
            loadCollections();
        } else {
            showToast(res.error || 'Rename failed', 'error');
        }
    }).fail(function () { showToast('Rename failed', 'error'); });
}

function duplicateRequest(id) {
    const req = _requests.find(function (r) { return r.id === id; });
    if (!req) return;

    $.ajax({
        url:         API_BASE + '/requests.php',
        method:      'POST',
        contentType: 'application/json',
        data:        JSON.stringify({
            name:          req.name + ' (copy)',
            method:        req.method,
            url:           req.url,
            headers:       req.headers       || null,
            body:          req.body          || null,
            body_type:     req.body_type,
            params:        req.params        || null,
            collection_id: req.collection_id || null,
        }),
    }).done(function (res) {
        if (res.success) {
            showToast('Duplicated', 'success');
            loadCollections();
        } else {
            showToast(res.error || 'Duplicate failed', 'error');
        }
    }).fail(function () { showToast('Duplicate failed', 'error'); });
}

function moveRequest(id, collectionId) {
    $.ajax({
        url:         API_BASE + '/requests.php?id=' + id,
        method:      'PUT',
        contentType: 'application/json',
        data:        JSON.stringify({ collection_id: collectionId }),
    }).done(function (res) {
        if (res.success) {
            showToast(collectionId ? 'Moved to collection' : 'Removed from collection', 'success');
            loadCollections();
        } else {
            showToast(res.error || 'Move failed', 'error');
        }
    }).fail(function () { showToast('Move failed', 'error'); });
}

function deleteRequest(id) {
    const req = _requests.find(function (r) { return r.id === id; });
    if (!req) return;
    if (!confirm('Delete "' + req.name + '"? This cannot be undone.')) return;

    $.ajax({ url: API_BASE + '/requests.php?id=' + id, method: 'DELETE' })
        .done(function (res) {
            if (res.success) {
                showToast('Deleted', 'success');
                if (_activeReqId === id) {
                    _activeReqId = null;
                    // Don't trigger new-request here — user may want to keep what's in workspace
                }
                loadCollections();
            } else {
                showToast(res.error || 'Delete failed', 'error');
            }
        }).fail(function () { showToast('Delete failed', 'error'); });
}

function promptNewCollection() {
    const name = prompt('New collection name:');
    if (!name || !name.trim()) return;

    $.ajax({
        url:         API_BASE + '/collections.php',
        method:      'POST',
        contentType: 'application/json',
        data:        JSON.stringify({ name: name.trim() }),
    }).done(function (res) {
        if (res.success) {
            _collections = res.data;
            loadCollections();
            showToast('Collection created', 'success');
        } else {
            showToast(res.error || 'Failed to create collection', 'error');
        }
    }).fail(function () { showToast('Failed to create collection', 'error'); });
}

// ---------------------------------------------------------------------------
// Expose for TASK 6.2 (save flow)
// ---------------------------------------------------------------------------

function getCollections()     { return _collections; }
function getAllRequests()      { return _requests; }
function getActiveRequestId() { return _activeReqId; }
function setActiveRequestId(id) {
    _activeReqId = id;
    updateActiveHighlight();
}
