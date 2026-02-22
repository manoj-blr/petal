// auth.js — Auth helpers tab
//
// Supported types:  none | bearer | basic | apikey
//
// Stubs overridden once initAuthTab() runs:
//   window.getAuthHeaders() → {Header: value}    merged into send payload
//   window.getAuthData()    → {type, ...fields}  included in save payload

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

if (typeof getAuthHeaders === 'undefined') {
    window.getAuthHeaders = function () { return {}; };
}

if (typeof getAuthData === 'undefined') {
    window.getAuthData = function () { return { type: 'none' }; };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _authType = 'none';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    initAuthTab();

    $(document).on('petal:load-request', function (e, req) {
        loadAuthFromRequest(req);
    });

    $(document).on('petal:clear-request', function () {
        resetAuth();
    });
});

function initAuthTab() {
    const $tab = $('#tab-auth').empty();

    // ── Type selector ──────────────────────────────────────────────────────

    const $typeBar = $('<div>').addClass('auth-type-bar');

    const types = [
        { value: 'none',   label: 'None'         },
        { value: 'bearer', label: 'Bearer Token'  },
        { value: 'basic',  label: 'Basic Auth'    },
        { value: 'apikey', label: 'API Key'       },
    ];

    types.forEach(function (t) {
        const inputId = 'auth-type-' + t.value;
        const $input  = $('<input>')
            .attr({ type: 'radio', name: 'auth-type', id: inputId, value: t.value });
        const $label  = $('<label>').attr('for', inputId).text(t.label);
        if (t.value === 'none') $input.prop('checked', true);
        $typeBar.append($input, $label);
    });

    $typeBar.on('change', 'input[name="auth-type"]', function () {
        _authType = this.value;
        renderAuthPanel(_authType);
        if (typeof markDirty === 'function') markDirty();
    });

    // ── Panel container ────────────────────────────────────────────────────

    const $panel = $('<div>').attr('id', 'auth-panel').addClass('auth-panel');

    $tab.append($typeBar, $panel);
    renderAuthPanel('none');

    // ── Override stubs ─────────────────────────────────────────────────────
    window.getAuthHeaders = buildAuthHeaders;
    window.getAuthData    = collectAuthData;
}

// ---------------------------------------------------------------------------
// Render the panel for the selected auth type
// ---------------------------------------------------------------------------

function renderAuthPanel(type) {
    const $panel = $('#auth-panel').empty();

    if (type === 'none') {
        $panel.append(
            $('<div>').addClass('auth-empty').append(
                $('<i>').addClass('bi bi-shield-slash'),
                $('<p>').addClass('mt-2 mb-0').text('No authentication')
            )
        );
        return;
    }

    if (type === 'bearer') {
        $panel.append(
            buildAuthField('token', 'Token', 'Bearer token value', false),
            $('<small>').addClass('auth-hint')
                .html('Sets <code>Authorization: Bearer &lt;token&gt;</code>')
        );
        return;
    }

    if (type === 'basic') {
        $panel.append(
            buildAuthField('username', 'Username', 'Username', false),
            buildAuthField('password', 'Password', 'Password', true),
            $('<small>').addClass('auth-hint')
                .html('Sets <code>Authorization: Basic base64(username:password)</code>')
        );
        return;
    }

    if (type === 'apikey') {
        $panel.append(
            buildAuthField('header-name', 'Header name', 'X-API-Key', false, 'X-API-Key'),
            buildAuthField('value', 'Value', 'API key value', false),
            $('<small>').addClass('auth-hint')
                .html('Sets the specified header with the given value')
        );
    }
}

// Build a labelled input field for the auth panel
function buildAuthField(id, label, placeholder, isPassword, defaultValue) {
    const inputId = 'auth-' + id;

    const $input = $('<input>')
        .attr({
            type:         isPassword ? 'password' : 'text',
            id:           inputId,
            placeholder:  placeholder,
            spellcheck:   'false',
            autocomplete: isPassword ? 'current-password' : 'off',
        })
        .addClass('auth-field-input')
        .val(defaultValue || '')
        .on('input', function () {
            if (typeof markDirty === 'function') markDirty();
        });

    const $label = $('<label>').addClass('auth-field-label').attr('for', inputId).text(label);

    if (isPassword) {
        const $toggle = $('<button>')
            .attr('type', 'button')
            .addClass('btn-icon btn-icon-sm auth-pw-toggle')
            .html('<i class="bi bi-eye"></i>')
            .on('click', function () {
                const show = $input.attr('type') === 'password';
                $input.attr('type', show ? 'text' : 'password');
                $(this).find('i')
                    .toggleClass('bi-eye',      !show)
                    .toggleClass('bi-eye-slash',  show);
            });

        return $('<div>').addClass('auth-field').append(
            $label,
            $('<div>').addClass('auth-field-input-wrap').append($input, $toggle)
        );
    }

    return $('<div>').addClass('auth-field').append($label, $input);
}

// ---------------------------------------------------------------------------
// Build auth headers from current panel state
// ---------------------------------------------------------------------------

function buildAuthHeaders() {
    if (_authType === 'bearer') {
        const token = ($('#auth-token').val() || '').trim();
        if (!token) return {};
        return { 'Authorization': 'Bearer ' + token };
    }

    if (_authType === 'basic') {
        const user = $('#auth-username').val() || '';
        const pass = $('#auth-password').val() || '';
        if (!user) return {};
        // btoa requires ASCII; encode to UTF-8 first via percent-encoding roundtrip
        try {
            return { 'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass))) };
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast('Basic auth: non-ASCII characters in credentials', 'warning');
            }
            return {};
        }
    }

    if (_authType === 'apikey') {
        const name  = ($('#auth-header-name').val() || '').trim() || 'X-API-Key';
        const value = ($('#auth-value').val() || '').trim();
        if (!value) return {};
        return { [name]: value };
    }

    return {};
}

// ---------------------------------------------------------------------------
// Collect auth data for saving
// ---------------------------------------------------------------------------

function collectAuthData() {
    if (_authType === 'bearer') {
        return { type: 'bearer', token: $('#auth-token').val() || '' };
    }
    if (_authType === 'basic') {
        return {
            type:     'basic',
            username: $('#auth-username').val() || '',
            password: $('#auth-password').val() || '',
        };
    }
    if (_authType === 'apikey') {
        return {
            type:        'apikey',
            header_name: $('#auth-header-name').val() || 'X-API-Key',
            value:       $('#auth-value').val() || '',
        };
    }
    return { type: 'none' };
}

// ---------------------------------------------------------------------------
// Load auth from a saved request object
// ---------------------------------------------------------------------------

function loadAuthFromRequest(req) {
    if (!req.auth || !req.auth.type || req.auth.type === 'none') {
        resetAuth();
        return;
    }

    const auth = req.auth;
    _authType  = auth.type;

    $('input[name="auth-type"][value="' + auth.type + '"]').prop('checked', true);
    renderAuthPanel(auth.type);

    if (auth.type === 'bearer') {
        $('#auth-token').val(auth.token || '');
    } else if (auth.type === 'basic') {
        $('#auth-username').val(auth.username || '');
        $('#auth-password').val(auth.password || '');
    } else if (auth.type === 'apikey') {
        $('#auth-header-name').val(auth.header_name || 'X-API-Key');
        $('#auth-value').val(auth.value || '');
    }
}

function resetAuth() {
    _authType = 'none';
    $('input[name="auth-type"][value="none"]').prop('checked', true);
    renderAuthPanel('none');
}
