// environments.js — environment switcher, manage modal, variable editor

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _environments    = [];   // full list cached from last API response
let _activeEnvId     = null; // id of the currently active environment
let _activeVarCache  = [];   // variables for the active env — kept fresh for {{}} autocomplete

/** Called by request.js when building the send payload. */
function getActiveEnvironmentId() {
    return _activeEnvId;
}

/** Called by var-autocomplete.js to get the list of available variable names/values. */
function getActiveEnvVars() {
    return _activeVarCache;
}

/** Fetches variables for the active environment and stores them in _activeVarCache. */
function refreshActiveVarCache() {
    if (!_activeEnvId) { _activeVarCache = []; return; }
    apiVars({ method: 'GET', url: API_BASE + '/variables.php?environment_id=' + _activeEnvId })
        .done(function (res) {
            if (res.success) _activeVarCache = res.data;
        });
}

// ---------------------------------------------------------------------------
// Bootstrap / init
// ---------------------------------------------------------------------------

$(function () {
    loadEnvironments();

    // "Manage Environments" link in the topbar dropdown
    $(document).on('click', '#manage-environments-btn', function (e) {
        e.preventDefault();
        // Close the dropdown first, then open the modal
        const dd = bootstrap.Dropdown.getInstance('#env-dropdown-btn');
        if (dd) dd.hide();
        openEnvModal();
    });

    // "New Environment" button inside the modal footer
    $(document).on('click', '#add-environment-btn', addEnvironment);

    // Re-sync topbar when the modal closes (user may have renamed/deleted envs)
    document.getElementById('environments-modal')
        .addEventListener('hidden.bs.modal', loadEnvironments);
});

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function apiEnvs(options) {
    return $.ajax(Object.assign({ url: API_BASE + '/environments.php', dataType: 'json' }, options));
}

function apiVars(options) {
    return $.ajax(Object.assign({ url: API_BASE + '/variables.php', dataType: 'json' }, options));
}

// ---------------------------------------------------------------------------
// Load & render topbar dropdown
// ---------------------------------------------------------------------------

function loadEnvironments() {
    apiEnvs({ method: 'GET' })
        .done(function (res) {
            if (!res.success) { showToast(res.error || 'Failed to load environments', 'error'); return; }
            _environments = res.data;
            _activeEnvId  = (_environments.find(e => e.is_active == 1) || {}).id || null;
            renderTopbarDropdown();
            refreshActiveVarCache();
        })
        .fail(function () { showToast('Could not reach environments API', 'error'); });
}

function renderTopbarDropdown() {
    const $menu = $('#env-menu');

    // Remove previously rendered env items (keep divider + manage link)
    $menu.find('.env-dd-item').remove();

    // Build one <li> per environment
    const $divider = $menu.find('.dropdown-divider').closest('li');

    _environments.forEach(function (env) {
        const isActive = env.is_active == 1;
        const $item = $('<li>').addClass('env-dd-item').append(
            $('<a>')
                .addClass('dropdown-item' + (isActive ? ' active-env' : ''))
                .attr('href', '#')
                .attr('data-env-id', env.id)
                .html(
                    `<span class="env-item-dot me-2 ${isActive ? 'active' : ''}"></span>` +
                    $('<span>').text(env.name).prop('outerHTML') +
                    (isActive ? '<i class="bi bi-check ms-auto"></i>' : '')
                )
                .on('click', function (e) {
                    e.preventDefault();
                    if (!isActive) setActiveEnvironment(env.id);
                })
        );
        $divider.before($item);
    });

    // Update topbar indicator
    const active = _environments.find(e => e.is_active == 1);
    if (active) {
        $('#env-name').text(active.name);
        $('#env-dot').addClass('active');
    } else {
        $('#env-name').text('No Environment');
        $('#env-dot').removeClass('active');
    }

    debug('environments rendered', _environments.length);
}

// ---------------------------------------------------------------------------
// Switch active environment
// ---------------------------------------------------------------------------

function setActiveEnvironment(id) {
    apiEnvs({ method: 'PUT', url: API_BASE + '/environments.php?id=' + id,
              contentType: 'application/json',
              data: JSON.stringify({ is_active: 1 }) })
        .done(function (res) {
            if (!res.success) { showToast(res.error || 'Could not switch environment', 'error'); return; }
            _environments = res.data;
            _activeEnvId  = id;
            renderTopbarDropdown();
            refreshActiveVarCache();
            const name = (_environments.find(e => e.id == id) || {}).name || '';
            showToast('Switched to ' + name, 'success');
        })
        .fail(function () { showToast('Failed to switch environment', 'error'); });
}

// ---------------------------------------------------------------------------
// Manage Environments modal
// ---------------------------------------------------------------------------

function openEnvModal() {
    renderEnvModal();
    bootstrap.Modal.getOrCreateInstance('#environments-modal').show();
}

function renderEnvModal() {
    const $body = $('#environments-modal-body').empty();

    if (_environments.length === 0) {
        $body.append('<p class="text-center text-muted py-3">No environments. Add one below.</p>');
        return;
    }

    const $list = $('<div>').addClass('env-list');

    _environments.forEach(function (env) {
        $list.append(buildEnvCard(env));
    });

    $body.append($list);
}

function buildEnvCard(env) {
    const isActive = env.is_active == 1;
    const cardId   = 'env-vars-' + env.id;

    const $card = $('<div>').addClass('env-list-item mb-2').attr('data-env-id', env.id);

    // ── Header row ──────────────────────────────────────────────────────────
    const $header = $('<div>').addClass('env-list-item-header');

    // Active dot
    const $dot = $('<span>').addClass('env-item-dot me-2' + (isActive ? ' active' : ''));

    // Editable name
    const $nameInput = $('<input>')
        .addClass('env-name-input form-control form-control-sm petal-input flex-fill')
        .attr('type', 'text')
        .attr('value', env.name)
        .attr('placeholder', 'Environment name')
        .on('blur', function () {
            const newName = $(this).val().trim();
            if (newName === '' || newName === env.name) {
                $(this).val(env.name); // revert if blank
                return;
            }
            renameEnvironment(env.id, newName, $(this));
        })
        .on('keydown', function (e) {
            if (e.key === 'Enter') $(this).blur();
            if (e.key === 'Escape') { $(this).val(env.name).blur(); }
        });

    // Set active button (hidden when already active)
    const $setActiveBtn = $('<button>')
        .addClass('btn btn-outline-secondary btn-sm ms-2 env-set-active-btn')
        .attr('title', 'Set as active')
        .html('<i class="bi bi-lightning-charge"></i>')
        .toggleClass('d-none', isActive)
        .on('click', function () {
            setActiveEnvironment(env.id);
            // Re-render modal after switch (state will be updated by loadEnvironments)
            setTimeout(function () { renderEnvModal(); }, 400);
        });

    if (isActive) {
        $header.append(
            $('<span>').addClass('badge bg-success ms-0 me-2').css('font-size','0.65rem').text('active')
        );
    }

    // Duplicate button
    const $dupBtn = $('<button>')
        .addClass('btn-icon btn-icon-sm ms-1')
        .attr('title', 'Duplicate environment (copies all variables)')
        .html('<i class="bi bi-copy"></i>')
        .on('click', function () { duplicateEnvironment(env.id, env.name); });

    // Delete button
    const $delBtn = $('<button>')
        .addClass('btn-icon btn-icon-sm ms-1')
        .attr('title', 'Delete environment')
        .html('<i class="bi bi-trash text-danger-custom"></i>')
        .on('click', function () { deleteEnvironment(env.id); });

    // Expand/collapse toggle
    const $toggleBtn = $('<button>')
        .addClass('btn-icon btn-icon-sm ms-1 env-toggle-btn')
        .attr('title', 'Show/hide variables')
        .html('<i class="bi bi-chevron-right"></i>')
        .on('click', function () {
            const $panel = $card.find('.env-vars-panel');
            const isOpen = $panel.is(':visible');
            $panel.slideToggle(150);
            $(this).find('i').toggleClass('bi-chevron-right', isOpen).toggleClass('bi-chevron-down', !isOpen);
            if (!isOpen) loadVariablesIntoCard(env.id, $card);
        });

    $header.append($dot, $nameInput, $setActiveBtn, $dupBtn, $delBtn, $toggleBtn);
    $card.append($header);

    // ── Variables panel (hidden initially) ──────────────────────────────────
    const $varsPanel = $('<div>').addClass('env-vars-panel').attr('id', cardId).hide()
        .append(
            $('<div>').addClass('vars-loading p-3 text-center text-muted')
                .html('<i class="bi bi-arrow-repeat spin"></i> Loading…')
        );

    $card.append($varsPanel);
    return $card;
}

// ---------------------------------------------------------------------------
// Add / delete / rename environment
// ---------------------------------------------------------------------------

function addEnvironment() {
    const name = 'New Environment';
    apiEnvs({ method: 'POST', contentType: 'application/json',
              data: JSON.stringify({ name }) })
        .done(function (res) {
            if (!res.success) { showToast(res.error || 'Failed to create environment', 'error'); return; }
            _environments = res.data;
            _activeEnvId  = (_environments.find(e => e.is_active == 1) || {}).id || null;
            renderEnvModal();
            showToast('Environment added', 'success');
        })
        .fail(function () { showToast('Failed to create environment', 'error'); });
}

function duplicateEnvironment(sourceId, sourceName) {
    const newName = sourceName + ' (copy)';

    apiEnvs({ method: 'POST', contentType: 'application/json',
              data: JSON.stringify({ name: newName, source_id: sourceId }) })
        .done(function (res) {
            if (!res.success) { showToast(res.error || 'Failed to duplicate environment', 'error'); return; }
            _environments = res.data;
            _activeEnvId  = (_environments.find(e => e.is_active == 1) || {}).id || null;
            renderEnvModal();
            showToast('"' + newName + '" created with all variables copied', 'success');
        })
        .fail(function () { showToast('Failed to duplicate environment', 'error'); });
}

function deleteEnvironment(id) {
    if (!confirm('Delete this environment and all its variables?')) return;

    apiEnvs({ method: 'DELETE', url: API_BASE + '/environments.php?id=' + id })
        .done(function (res) {
            if (!res.success) { showToast(res.error || 'Could not delete environment', 'error'); return; }
            _environments = res.data;
            _activeEnvId  = (_environments.find(e => e.is_active == 1) || {}).id || null;
            renderTopbarDropdown();
            renderEnvModal();
            showToast('Environment deleted', 'success');
        })
        .fail(function () { showToast('Failed to delete environment', 'error'); });
}

function renameEnvironment(id, name, $input) {
    apiEnvs({ method: 'PUT', url: API_BASE + '/environments.php?id=' + id,
              contentType: 'application/json', data: JSON.stringify({ name }) })
        .done(function (res) {
            if (!res.success) {
                showToast(res.error || 'Could not rename environment', 'error');
                const original = (_environments.find(e => e.id == id) || {}).name || '';
                $input.val(original);
                return;
            }
            _environments = res.data;
            renderTopbarDropdown();
            showToast('Renamed', 'success');
        })
        .fail(function () { showToast('Failed to rename environment', 'error'); });
}

// ---------------------------------------------------------------------------
// Variables — lazy-loaded when a card is expanded
// ---------------------------------------------------------------------------

function loadVariablesIntoCard(envId, $card) {
    apiVars({ method: 'GET', url: API_BASE + '/variables.php?environment_id=' + envId })
        .done(function (res) {
            if (!res.success) { showToast(res.error || 'Failed to load variables', 'error'); return; }
            renderVarsTable(envId, res.data, $card.find('.env-vars-panel'));
        })
        .fail(function () { showToast('Failed to load variables', 'error'); });
}

function renderVarsTable(envId, variables, $panel) {
    // Keep autocomplete cache in sync whenever the active env's vars are (re)rendered
    if (envId == _activeEnvId) _activeVarCache = variables;

    $panel.empty();

    const $table = $('<table>').addClass('kv-table');
    const $thead = $('<thead>').append(
        $('<tr>').append(
            $('<th>').text('Key').css('width', '40%'),
            $('<th>').text('Value'),
            $('<th>').css('width', '60px')
        )
    );
    const $tbody = $('<tbody>').attr('id', 'vars-tbody-' + envId);

    variables.forEach(function (v) {
        $tbody.append(buildVarRow(v, envId));
    });

    $table.append($thead, $tbody);

    const $addBtn = $('<button>')
        .addClass('btn-add-row')
        .html('<i class="bi bi-plus"></i> Add variable')
        .on('click', function () {
            $tbody.append(buildNewVarRow(envId, $tbody));
            $tbody.find('tr:last-child .kv-input[data-field="key"]').focus();
        });

    const $importBtn = $('<button>')
        .addClass('btn-add-row')
        .html('<i class="bi bi-upload"></i> Import .env')
        .on('click', function () { toggleEnvImportArea(envId, $panel); });

    $panel.append(
        $('<div>').addClass('p-2').append($table),
        $('<div>').addClass('px-2 pb-2 d-flex gap-2').append($addBtn, $importBtn)
    );
}

// Existing variable row
function buildVarRow(v, envId) {
    const $row = $('<tr>').attr('data-var-id', v.id);
    let isSecret = v.is_secret == 1;
    let revealed  = false;

    const $keyInput = $('<input>').addClass('kv-input').attr({
        type: 'text', value: v.var_key, 'data-field': 'key', 'data-original': v.var_key,
        placeholder: 'variable_name', spellcheck: false
    });

    const $valInput = $('<input>').addClass('kv-input').attr({
        type: isSecret ? 'password' : 'text',
        value: v.var_value, 'data-field': 'value', 'data-original': v.var_value,
        placeholder: 'value', spellcheck: false
    });

    // Save key on blur if changed
    $keyInput.on('blur', function () {
        const newKey = $(this).val().trim();
        const oldKey = $(this).data('original');
        if (newKey === oldKey) return;
        if (newKey === '') { $(this).val(oldKey); return; }
        updateVariable(v.id, { var_key: newKey }, $(this), oldKey);
    }).on('keydown', function (e) { if (e.key === 'Enter') $(this).blur(); });

    // Save value on blur if changed
    $valInput.on('blur', function () {
        const newVal = $(this).val();
        if (newVal === $(this).data('original')) return;
        updateVariable(v.id, { var_value: newVal }, $(this), $(this).data('original'));
    }).on('keydown', function (e) { if (e.key === 'Enter') $(this).blur(); });

    // Eye button — toggle visibility of a secret value
    const $eyeBtn = $('<button>')
        .addClass('btn-var-eye')
        .attr('title', 'Show / hide value')
        .html('<i class="bi bi-eye"></i>')
        .toggle(isSecret)
        .on('click', function () {
            revealed = !revealed;
            $valInput.attr('type', revealed ? 'text' : 'password');
            $(this).find('i')
                .toggleClass('bi-eye', !revealed)
                .toggleClass('bi-eye-slash', revealed);
        });

    // Lock button — mark / unmark as secret
    const $lockBtn = $('<button>')
        .addClass('btn-var-secret' + (isSecret ? ' is-secret' : ''))
        .attr('title', isSecret ? 'Unmark as secret' : 'Mark as secret')
        .html('<i class="bi bi-' + (isSecret ? 'lock-fill' : 'lock') + '"></i>')
        .on('click', function () {
            const newSecret = !isSecret;
            apiVars({
                method: 'PUT',
                url: API_BASE + '/variables.php?id=' + v.id,
                contentType: 'application/json',
                data: JSON.stringify({ is_secret: newSecret ? 1 : 0 })
            }).done(function (res) {
                if (!res.success) { showToast(res.error || 'Could not update variable', 'error'); return; }
                isSecret = newSecret;
                revealed = false;
                $valInput.attr('type', isSecret ? 'password' : 'text');
                $eyeBtn.toggle(isSecret);
                $lockBtn
                    .toggleClass('is-secret', isSecret)
                    .attr('title', isSecret ? 'Unmark as secret' : 'Mark as secret')
                    .find('i')
                    .toggleClass('bi-lock-fill', isSecret)
                    .toggleClass('bi-lock', !isSecret);
            }).fail(function () { showToast('Failed to update variable', 'error'); });
        });

    const $delBtn = $('<button>').addClass('btn-kv-delete')
        .html('<i class="bi bi-x"></i>')
        .on('click', function () { deleteVariable(v.id, $row, envId); });

    const $valWrap  = $('<div>').addClass('var-val-wrap').append($valInput, $eyeBtn);
    const $actions  = $('<div>').addClass('var-actions').append($lockBtn, $delBtn);
    $row.append($('<td>').append($keyInput), $('<td>').append($valWrap), $('<td>').append($actions));
    return $row;
}

// New (unsaved) variable row — saved via POST on key blur
function buildNewVarRow(envId, $tbody) {
    const $row = $('<tr>').addClass('var-row-new');
    let _isSecret = false;
    let _revealed  = false;

    const $keyInput = $('<input>').addClass('kv-input').attr({
        type: 'text', value: '', 'data-field': 'key',
        placeholder: 'variable_name', spellcheck: false
    });

    const $valInput = $('<input>').addClass('kv-input').attr({
        type: 'text', value: '', 'data-field': 'value',
        placeholder: 'value', spellcheck: false
    });

    function trySaveNewRow() {
        const key = $keyInput.val().trim();
        const val = $valInput.val();
        if (key === '') return; // wait for key

        // Only POST once (remove new-row marker before async call)
        if (!$row.hasClass('var-row-new')) return;
        $row.removeClass('var-row-new');

        apiVars({ method: 'POST', contentType: 'application/json',
                  data: JSON.stringify({ environment_id: envId, var_key: key, var_value: val, is_secret: _isSecret ? 1 : 0 }) })
            .done(function (res) {
                if (!res.success) {
                    showToast(res.error || 'Could not save variable', 'error');
                    $row.addClass('var-row-new'); // allow retry
                    $keyInput.focus();
                    return;
                }
                // Replace the temp row with a proper saved row
                const saved = res.data.find(v => v.var_key === key);
                if (saved) $row.replaceWith(buildVarRow(saved, envId));
            })
            .fail(function () {
                showToast('Failed to save variable', 'error');
                $row.addClass('var-row-new');
            });
    }

    $keyInput.on('blur', trySaveNewRow)
             .on('keydown', function (e) { if (e.key === 'Enter') $valInput.focus(); });

    $valInput.on('blur', trySaveNewRow)
             .on('keydown', function (e) { if (e.key === 'Enter') $(this).blur(); });

    // Eye button (hidden until marked secret)
    const $eyeBtn = $('<button>')
        .addClass('btn-var-eye')
        .attr('title', 'Show / hide value')
        .html('<i class="bi bi-eye"></i>')
        .hide()
        .on('click', function () {
            _revealed = !_revealed;
            $valInput.attr('type', _revealed ? 'text' : 'password');
            $(this).find('i')
                .toggleClass('bi-eye', !_revealed)
                .toggleClass('bi-eye-slash', _revealed);
        });

    // Lock button — toggle secret state before the row is saved
    const $lockBtn = $('<button>')
        .addClass('btn-var-secret')
        .attr('title', 'Mark as secret')
        .html('<i class="bi bi-lock"></i>')
        .on('click', function () {
            _isSecret = !_isSecret;
            _revealed  = false;
            $valInput.attr('type', _isSecret ? 'password' : 'text');
            $eyeBtn.toggle(_isSecret);
            $lockBtn
                .toggleClass('is-secret', _isSecret)
                .attr('title', _isSecret ? 'Unmark as secret' : 'Mark as secret')
                .find('i')
                .toggleClass('bi-lock-fill', _isSecret)
                .toggleClass('bi-lock', !_isSecret);
        });

    const $delBtn = $('<button>').addClass('btn-kv-delete')
        .html('<i class="bi bi-x"></i>')
        .on('click', function () { $row.remove(); });

    const $valWrap = $('<div>').addClass('var-val-wrap').append($valInput, $eyeBtn);
    const $actions = $('<div>').addClass('var-actions').append($lockBtn, $delBtn);
    $row.append($('<td>').append($keyInput), $('<td>').append($valWrap), $('<td>').append($actions));
    return $row;
}

// ---------------------------------------------------------------------------
// Update / delete variable
// ---------------------------------------------------------------------------

function updateVariable(id, fields, $input, originalValue) {
    apiVars({ method: 'PUT', url: API_BASE + '/variables.php?id=' + id,
              contentType: 'application/json', data: JSON.stringify(fields) })
        .done(function (res) {
            if (!res.success) {
                showToast(res.error || 'Could not save variable', 'error');
                $input.val(originalValue).data('original', originalValue);
                return;
            }
            // Update the "original" tracker so a second blur doesn't re-fire
            const field = $input.data('field');
            const saved = res.data.find(v => v.id == id);
            if (saved) {
                $input.data('original', field === 'key' ? saved.var_key : saved.var_value);
            }
        })
        .fail(function () {
            showToast('Failed to save variable', 'error');
            $input.val(originalValue).data('original', originalValue);
        });
}

function deleteVariable(id, $row, envId) {
    apiVars({ method: 'DELETE', url: API_BASE + '/variables.php?id=' + id })
        .done(function (res) {
            if (!res.success) { showToast(res.error || 'Could not delete variable', 'error'); return; }
            $row.remove();
        })
        .fail(function () { showToast('Failed to delete variable', 'error'); });
}

// ---------------------------------------------------------------------------
// .env bulk import
// ---------------------------------------------------------------------------

/**
 * Toggles the inline .env import area below the variable table.
 * Calling it a second time while open collapses it.
 */
function toggleEnvImportArea(envId, $panel) {
    const existing = $panel.find('.env-import-area');
    if (existing.length) {
        existing.slideUp(120, function () { $(this).remove(); });
        return;
    }

    const $textarea = $('<textarea>')
        .addClass('env-import-textarea')
        .attr('placeholder',
            'BASE_URL=https://api.example.com\n' +
            'API_KEY=sk-abc123\n' +
            '# comments and blank lines are ignored\n' +
            'DB_PASSWORD="secret with spaces"');

    const $hint = $('<small>').addClass('env-import-hint')
        .text('New keys are created. Existing keys are overwritten. Secrets are not evaluated.');

    const $importBtn = $('<button>')
        .addClass('btn btn-primary btn-sm')
        .text('Import')
        .on('click', function () {
            doImportEnvVars(envId, $textarea.val(), $panel);
        });

    const $cancelBtn = $('<button>')
        .addClass('btn btn-outline-secondary btn-sm')
        .text('Cancel')
        .on('click', function () {
            $panel.find('.env-import-area').slideUp(120, function () { $(this).remove(); });
        });

    // Ctrl+Enter submits
    $textarea.on('keydown', function (e) {
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); $importBtn.trigger('click'); }
    });

    const $actions = $('<div>').addClass('env-import-actions').append($importBtn, $cancelBtn, $hint);
    const $area    = $('<div>').addClass('env-import-area').append($textarea, $actions).hide();

    $panel.append($area);
    $area.slideDown(120, function () { $textarea.focus(); });
}

/**
 * Parses a .env file string into [{key, value}] pairs.
 * Handles: comments, blank lines, quoted values, inline comments.
 */
function parseEnvFile(text) {
    const pairs = [];
    const seen  = new Set();

    text.split('\n').forEach(function (line) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) return;

        const key = match[1];
        if (seen.has(key)) return;   // keep first occurrence, skip duplicates

        let value = match[2];

        // Strip quoted values — handle "value" and 'value'
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        } else {
            // Strip inline comment (only safe outside quotes)
            const commentIdx = value.indexOf(' #');
            if (commentIdx > -1) value = value.slice(0, commentIdx);
            value = value.trim();
        }

        seen.add(key);
        pairs.push({ key, value });
    });

    return pairs;
}

/**
 * Merges parsed pairs into the environment:
 * POSTs new keys, PUTs existing ones, then refreshes the panel.
 */
function doImportEnvVars(envId, text, $panel) {
    const pairs = parseEnvFile(text);

    if (pairs.length === 0) {
        showToast('No valid KEY=value pairs found in the pasted text', 'warning');
        return;
    }

    // Fetch existing variables first so we know which are updates vs creates
    apiVars({ method: 'GET', url: API_BASE + '/variables.php?environment_id=' + envId })
        .done(function (res) {
            const existing    = res.success ? res.data : [];
            const existingMap = {};
            existing.forEach(function (v) { existingMap[v.var_key] = v.id; });

            const requests = pairs.map(function (pair) {
                if (existingMap[pair.key] !== undefined) {
                    return apiVars({
                        method:      'PUT',
                        url:         API_BASE + '/variables.php?id=' + existingMap[pair.key],
                        contentType: 'application/json',
                        data:        JSON.stringify({ var_value: pair.value }),
                    });
                } else {
                    return apiVars({
                        method:      'POST',
                        contentType: 'application/json',
                        data:        JSON.stringify({ environment_id: envId, var_key: pair.key, var_value: pair.value }),
                    });
                }
            });

            $.when.apply($, requests).always(function () {
                // Collapse the import area
                $panel.find('.env-import-area').slideUp(120, function () { $(this).remove(); });

                // Reload the variables table
                const $card = $panel.closest('[data-env-id]');
                loadVariablesIntoCard(envId, $card);

                showToast(
                    pairs.length + ' variable' + (pairs.length !== 1 ? 's' : '') + ' imported',
                    'success'
                );
            });
        })
        .fail(function () { showToast('Could not fetch existing variables', 'error'); });
}
