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
let _ctxCollId    = null; // collection id whose context menu is open
let _importParsed = null; // last successfully parsed import JSON

// DnD state
let _dndReqId     = null; // request id being dragged
let _dndCollId    = null; // collection id being dragged

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

    // Import Collection button (sidebar header)
    $('#import-collection-btn').on('click', openImportModal);

    // Close request context menu on outside click or Esc
    $(document).on('click.ctxmenu', function (e) {
        if (!$(e.target).closest('#ctx-menu').length) hideCtxMenu();
        if (!$(e.target).closest('#col-ctx-menu').length) hideColCtxMenu();
    });
    $(document).on('petal:escape', function () { hideCtxMenu(); hideColCtxMenu(); });

    // After save refresh the sidebar
    $(document).on('petal:request-saved', loadCollections);

    // Collection context menu button wiring (read _ctxCollId at click time)
    $('#col-ctx-export-petal').on('click', function () {
        const id = _ctxCollId; hideColCtxMenu(); exportCollection(id, 'petal');
    });
    $('#col-ctx-export-postman').on('click', function () {
        const id = _ctxCollId; hideColCtxMenu(); exportCollection(id, 'postman');
    });
    $('#col-ctx-delete').on('click', function () {
        const id = _ctxCollId; hideColCtxMenu(); deleteCollection(id);
    });

    // Import modal wiring
    initImportModal();
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

    const $menuBtn = $('<button>')
        .addClass('btn-ctx-menu')
        .attr('title', 'Collection options')
        .html('<i class="bi bi-three-dots"></i>')
        .on('click', function (e) {
            e.stopPropagation();
            showColCtxMenu(coll.id, $(this));
        });

    let _collDragged = false;
    const $header = $('<div>').addClass('collection-item')
        .attr({ draggable: 'true', 'data-collection-id': coll.id })
        .append(
            $('<i>').addClass('bi bi-grip-vertical drag-handle'),
            $('<i>').addClass('bi bi-chevron-right collection-chevron' + (isCollapsed ? '' : ' open')),
            $('<i>').addClass('bi bi-folder2 collection-folder-icon'),
            $('<span>').addClass('collection-name flex-1 text-truncate').text(coll.name),
            requests.length > 0
                ? $('<span>').addClass('collection-count').text(requests.length)
                : null,
            $menuBtn
        )
        .on('click',     function ()  { if (!_collDragged) toggleCollection(coll.id); _collDragged = false; })
        .on('dragstart', function (e) { _collDragged = true; onCollDragstart(e, coll.id); })
        .on('dragend',   function ()  { onCollDragend(); setTimeout(function () { _collDragged = false; }, 100); })
        .on('dragover',  function (e) { onCollDragover(e, coll.id); })
        .on('drop',      function (e) { onCollDrop(e, coll.id); })
        .on('dragleave', function (e) { onCollDragleave(e); });

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
        .attr({ 'data-request-id': req.id, draggable: 'true' });

    const $menuBtn = $('<button>')
        .addClass('btn-ctx-menu')
        .attr('title', 'Options')
        .html('<i class="bi bi-three-dots"></i>')
        .on('click', function (e) {
            e.stopPropagation();
            showCtxMenu(req.id, $(this));
        });

    $item.append(
        $('<i>').addClass('bi bi-grip-vertical drag-handle'),
        $('<span>').addClass('method-badge ' + req.method).text(req.method),
        $('<span>').addClass('item-name flex-1').text(req.name),
        $menuBtn
    );

    let _reqDragged = false;
    $item.on('click',     function ()  { if (!_reqDragged) loadRequestById(req.id); _reqDragged = false; })
         .on('dragstart', function (e) { _reqDragged = true; onReqDragstart(e, req.id); })
         .on('dragend',   function ()  { onReqDragend(); setTimeout(function () { _reqDragged = false; }, 100); })
         .on('dragover',  function (e) { onReqDragover(e, req.id); })
         .on('drop',      function (e) { onReqDrop(e, req.id); })
         .on('dragleave', function (e) { onReqDragleave(e); });

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
// Collection context menu
// ---------------------------------------------------------------------------

function showColCtxMenu(collId, $anchor) {
    _ctxCollId = collId;

    const $menu = $('#col-ctx-menu');
    const rect  = $anchor[0].getBoundingClientRect();
    const menuH = 120;
    const menuW = 200;
    const winH  = window.innerHeight;
    const winW  = window.innerWidth;

    const top  = (rect.bottom + menuH > winH) ? rect.top - menuH : rect.bottom + 2;
    const left = Math.max(4, Math.min(rect.left, winW - menuW - 4));

    $menu.css({ top: top + 'px', left: left + 'px' }).removeClass('d-none').addClass('ctx-pop');
}

function hideColCtxMenu() {
    $('#col-ctx-menu').addClass('d-none').removeClass('ctx-pop');
    _ctxCollId = null;
}

// ---------------------------------------------------------------------------
// Export collection
// ---------------------------------------------------------------------------

function exportCollection(collId, format) {
    // Trigger a browser file download by navigating to the export endpoint.
    // Content-Disposition: attachment on the PHP side forces the download.
    const url = API_BASE + '/export.php?collection_id=' + collId + '&format=' + format;
    const $a  = $('<a>').attr({ href: url, download: '' }).appendTo('body');
    $a[0].click();
    $a.remove();
    showToast('Download started', 'success');
}

// ---------------------------------------------------------------------------
// Delete collection
// ---------------------------------------------------------------------------

function deleteCollection(id) {
    const coll = _collections.find(function (c) { return c.id === id; });
    if (!coll) return;

    const reqCount = _requests.filter(function (r) { return r.collection_id === id; }).length;
    const note     = reqCount > 0
        ? ' ' + reqCount + ' request' + (reqCount !== 1 ? 's' : '') + ' will become unsorted.'
        : '';

    if (!confirm('Delete collection "' + coll.name + '"?' + note)) return;

    $.ajax({ url: API_BASE + '/collections.php?id=' + id, method: 'DELETE' })
        .done(function (res) {
            if (res.success) {
                showToast('Collection deleted', 'success');
                loadCollections();
            } else {
                showToast(res.error || 'Delete failed', 'error');
            }
        })
        .fail(function () { showToast('Delete failed', 'error'); });
}

// ---------------------------------------------------------------------------
// Import modal
// ---------------------------------------------------------------------------

function openImportModal() {
    _importParsed = null;
    $('#import-paste-area').val('');
    $('#import-preview').addClass('d-none').empty();
    $('#import-confirm-btn').prop('disabled', true);
    bootstrap.Modal.getOrCreateInstance('#import-modal').show();
}

function initImportModal() {
    // File picker
    $('#import-file-input').on('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) { handleImportText(e.target.result); };
        reader.readAsText(file);
    });

    // Drag and drop onto the drop zone
    const dz = document.getElementById('import-drop-zone');
    if (dz) {
        dz.addEventListener('dragover',  function (e) { e.preventDefault(); dz.classList.add('dragover'); });
        dz.addEventListener('dragleave', function ()  { dz.classList.remove('dragover'); });
        dz.addEventListener('drop', function (e) {
            e.preventDefault();
            dz.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (ev) { handleImportText(ev.target.result); };
            reader.readAsText(file);
        });
        // Click on drop zone opens file picker
        dz.addEventListener('click', function (e) {
            if (!$(e.target).is('label, input')) $('#import-file-input').trigger('click');
        });
    }

    // Paste textarea — debounced detection
    let _pasteTimer = null;
    $('#import-paste-area').on('input', function () {
        clearTimeout(_pasteTimer);
        const text = $(this).val().trim();
        if (!text) {
            _importParsed = null;
            $('#import-preview').addClass('d-none').empty();
            $('#import-confirm-btn').prop('disabled', true);
            return;
        }
        _pasteTimer = setTimeout(function () { handleImportText(text); }, 300);
    });

    // Confirm button
    $('#import-confirm-btn').on('click', confirmImport);

    // Reset state when modal closes
    document.getElementById('import-modal').addEventListener('hidden.bs.modal', function () {
        _importParsed = null;
    });
}

function handleImportText(text) {
    const $preview = $('#import-preview');
    const $btn     = $('#import-confirm-btn');

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        _importParsed = null;
        $btn.prop('disabled', true);
        $preview.removeClass('d-none').html(
            '<span class="import-preview-error"><i class="bi bi-x-circle me-1"></i>Invalid JSON — check for syntax errors.</span>'
        );
        return;
    }

    // Detect format
    let format = null, collName = '', reqCount = 0;

    if (parsed.petal_version) {
        format    = 'Petal v' + parsed.petal_version;
        collName  = (parsed.collection || {}).name || 'Unknown';
        reqCount  = (parsed.requests || []).length;
    } else if (parsed.info && parsed.info.schema && parsed.info.schema.includes('getpostman.com')) {
        format    = 'Postman v2.1';
        collName  = parsed.info.name || 'Unknown';
        reqCount  = countPostmanItems(parsed.item || []);
    } else {
        _importParsed = null;
        $btn.prop('disabled', true);
        $preview.removeClass('d-none').html(
            '<span class="import-preview-error"><i class="bi bi-x-circle me-1"></i>' +
            'Unrecognised format. Expected a Petal export or a Postman v2.1 collection.</span>'
        );
        return;
    }

    _importParsed = parsed;
    $btn.prop('disabled', false);
    $preview.removeClass('d-none').html(
        '<span class="import-preview-ok">' +
        '<i class="bi bi-check-circle me-1"></i>' +
        '<strong>' + $('<span>').text(format).html() + '</strong> — ' +
        '<strong>' + $('<span>').text(reqCount).html() + '</strong> request' + (reqCount !== 1 ? 's' : '') + ' in ' +
        '<em>' + $('<span>').text(collName).html() + '</em>' +
        '</span>'
    );
}

function countPostmanItems(items) {
    let n = 0;
    items.forEach(function (item) {
        if (item.item && Array.isArray(item.item)) {
            n += countPostmanItems(item.item); // folder
        } else if (item.request) {
            n++;
        }
    });
    return n;
}

function confirmImport() {
    if (!_importParsed) return;

    $('#import-confirm-btn').prop('disabled', true).html('<i class="bi bi-arrow-repeat spin me-1"></i>Importing…');

    $.ajax({
        url:         API_BASE + '/import.php',
        method:      'POST',
        contentType: 'application/json',
        data:        JSON.stringify({ data: _importParsed }),
    }).done(function (res) {
        $('#import-confirm-btn').html('<i class="bi bi-upload me-1"></i>Import');
        if (!res.success) {
            showToast(res.error || 'Import failed', 'error');
            $('#import-confirm-btn').prop('disabled', false);
            return;
        }
        bootstrap.Modal.getOrCreateInstance('#import-modal').hide();
        loadCollections();
        showToast(
            'Imported "' + res.data.collection_name + '" — ' + res.data.request_count + ' request' +
            (res.data.request_count !== 1 ? 's' : ''),
            'success'
        );
        _importParsed = null;
    }).fail(function () {
        $('#import-confirm-btn').html('<i class="bi bi-upload me-1"></i>Import').prop('disabled', false);
        showToast('Import failed — server error', 'error');
    });
}

// ---------------------------------------------------------------------------
// Drag-and-drop — request items
// ---------------------------------------------------------------------------

function onReqDragstart(e, reqId) {
    _dndReqId  = reqId;
    _dndCollId = null;
    e.originalEvent.dataTransfer.effectAllowed = 'move';
    e.originalEvent.dataTransfer.setData('text/plain', 'req:' + reqId);
    // Delay opacity so the ghost image renders normally
    setTimeout(function () {
        $('[data-request-id="' + reqId + '"]').addClass('dnd-dragging');
    }, 0);
}

function onReqDragend() {
    _dndReqId = null;
    $('.saved-request-item').removeClass('dnd-dragging dnd-above dnd-below');
    $('.collection-requests').removeClass('dnd-target-empty');
}

function onReqDragover(e, targetReqId) {
    if (_dndReqId === null) return; // only handle request drags here
    e.preventDefault();
    e.originalEvent.dataTransfer.dropEffect = 'move';

    // Determine above/below based on mouse Y within item
    const $item = $('[data-request-id="' + targetReqId + '"]');
    const rect  = $item[0].getBoundingClientRect();
    const mid   = rect.top + rect.height / 2;

    $('.saved-request-item').removeClass('dnd-above dnd-below');

    if (_dndReqId === targetReqId) return;

    if (e.originalEvent.clientY < mid) {
        $item.addClass('dnd-above');
    } else {
        $item.addClass('dnd-below');
    }
}

function onReqDragleave(e) {
    const $item = $(e.currentTarget);
    // Only clear if leaving the element entirely (not into a child)
    if (!$item[0].contains(e.relatedTarget)) {
        $item.removeClass('dnd-above dnd-below');
    }
}

function onReqDrop(e, targetReqId) {
    e.preventDefault();
    const draggedId = _dndReqId; // capture before dragend clears it
    if (!draggedId || draggedId === targetReqId) return;

    const $target     = $('[data-request-id="' + targetReqId + '"]');
    const insertAbove = $target.hasClass('dnd-above');
    $target.removeClass('dnd-above dnd-below');

    // Find target's collection from the DOM
    const $collSection = $target.closest('.collection-section');
    const newCollId    = parseInt($collSection.attr('data-collection-id'), 10) || null;

    const sourceReq = _requests.find(function (r) { return r.id === draggedId; });
    if (!sourceReq) return;

    const collChanged = sourceReq.collection_id !== newCollId;

    // Build the ordered id list for the destination collection, current DOM order
    const $container = $collSection.find('.collection-requests');

    let ids = [];
    $container.find('.saved-request-item').each(function () {
        const id = parseInt($(this).attr('data-request-id'), 10);
        if (id !== draggedId) ids.push(id);
    });

    // Insert dragged item before or after target
    const targetIdx = ids.indexOf(targetReqId);
    const insertAt  = insertAbove ? targetIdx : targetIdx + 1;
    ids.splice(insertAt, 0, draggedId);

    // If collection changed, move via PUT first then reorder
    if (collChanged) {
        $.ajax({
            url:         API_BASE + '/requests.php?id=' + draggedId,
            method:      'PUT',
            contentType: 'application/json',
            data:        JSON.stringify({ collection_id: newCollId }),
        }).done(function (res) {
            if (!res.success) { showToast('Move failed', 'error'); return; }
            persistReqOrder(ids);
        }).fail(function () { showToast('Move failed', 'error'); });
    } else {
        persistReqOrder(ids);
    }
}

function persistReqOrder(ids) {
    $.ajax({
        url:         API_BASE + '/reorder.php',
        method:      'POST',
        contentType: 'application/json',
        data:        JSON.stringify({ type: 'requests', ids: ids }),
    }).done(function (res) {
        if (res.success) {
            loadCollections();
        } else {
            showToast('Reorder failed', 'error');
            loadCollections();
        }
    }).fail(function () {
        showToast('Reorder failed', 'error');
        loadCollections();
    });
}

// ---------------------------------------------------------------------------
// Drag-and-drop — collection headers
// ---------------------------------------------------------------------------

function onCollDragstart(e, collId) {
    _dndCollId = collId;
    _dndReqId  = null;
    e.originalEvent.dataTransfer.effectAllowed = 'move';
    e.originalEvent.dataTransfer.setData('text/plain', 'coll:' + collId);
    setTimeout(function () {
        $('.collection-item[data-collection-id="' + collId + '"]').closest('.collection-section').addClass('dnd-dragging');
    }, 0);
}

function onCollDragend() {
    _dndCollId = null;
    $('.collection-section').removeClass('dnd-dragging dnd-above dnd-below');
}

function onCollDragover(e, targetCollId) {
    if (_dndCollId === null) return;
    e.preventDefault();
    e.stopPropagation();
    e.originalEvent.dataTransfer.dropEffect = 'move';

    if (_dndCollId === targetCollId) return;

    const $header = $('.collection-item[data-collection-id="' + targetCollId + '"]');
    const rect    = $header[0].getBoundingClientRect();
    const mid     = rect.top + rect.height / 2;

    $('.collection-section').removeClass('dnd-above dnd-below');
    const $section = $header.closest('.collection-section');

    if (e.originalEvent.clientY < mid) {
        $section.addClass('dnd-above');
    } else {
        $section.addClass('dnd-below');
    }
}

function onCollDragleave(e) {
    const $header = $(e.currentTarget);
    if (!$header[0].contains(e.relatedTarget)) {
        $header.closest('.collection-section').removeClass('dnd-above dnd-below');
    }
}

function onCollDrop(e, targetCollId) {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = _dndCollId; // capture before dragend clears it
    if (!draggedId || draggedId === targetCollId) return;

    const $targetHeader  = $('.collection-item[data-collection-id="' + targetCollId + '"]');
    const insertAbove    = $targetHeader.closest('.collection-section').hasClass('dnd-above');
    $('.collection-section').removeClass('dnd-above dnd-below');

    // Build ordered id list from DOM order, excluding dragged collection
    let ids = [];
    $('#collections-list .collection-section[data-collection-id]').each(function () {
        const id = parseInt($(this).attr('data-collection-id'), 10);
        if (id !== draggedId) ids.push(id);
    });

    const targetIdx = ids.indexOf(targetCollId);
    const insertAt  = insertAbove ? targetIdx : targetIdx + 1;
    ids.splice(insertAt, 0, draggedId);

    $.ajax({
        url:         API_BASE + '/reorder.php',
        method:      'POST',
        contentType: 'application/json',
        data:        JSON.stringify({ type: 'collections', ids: ids }),
    }).done(function (res) {
        if (res.success) {
            loadCollections();
        } else {
            showToast('Reorder failed', 'error');
            loadCollections();
        }
    }).fail(function () {
        showToast('Reorder failed', 'error');
        loadCollections();
    });
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
