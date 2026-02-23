// var-autocomplete.js — {{variable}} name autocomplete
//
// Triggers when the user types {{ in any supported field.
// Reads getActiveEnvVars() (populated by environments.js) — no extra AJAX.
//
// Supported fields:
//   #url-input                                         URL bar
//   #tab-headers .kv-input[data-field="value"]         header value cells
//   #body-json-input, #body-raw-input                  body textareas
//   #tab-body .kv-input[data-field="value"]            body form value cells
//   #auth-panel input                                  auth fields (token, key, user, pass)

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _vaTimer   = null;   // debounce handle
let _vaActive  = null;   // the input/textarea currently driving the dropdown
let _vaFocused = -1;     // keyboard-focused item index (-1 = none)
let _vaItems   = [];     // filtered [{var_key, var_value, is_secret}]
let _vaToken   = null;   // {partial, tokenStart, cursorPos} from last scan

// CSS selector — all fields that support {{ autocomplete
const VA_SEL = [
    '#url-input',
    '#tab-headers .kv-input[data-field="value"]',
    '#body-json-input',
    '#body-raw-input',
    '#tab-body .kv-input[data-field="value"]',
    '#auth-panel input',
].join(', ');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

$(function () {
    // Debounced input — check for {{ on every keystroke
    $(document).on('input', VA_SEL, function () {
        const el = this;
        clearTimeout(_vaTimer);
        _vaTimer = setTimeout(function () { checkVarAc(el); }, 80);
    });

    // Keyboard navigation (fires on focused element, captured via delegation)
    $(document).on('keydown', VA_SEL, handleVaKeydown);

    // Close when focus leaves a supported field (focusout bubbles; blur doesn't)
    $(document).on('focusout', VA_SEL, function () {
        setTimeout(closeVarAc, 160);
    });

    // Close on workspace events
    $(document).on('petal:load-request petal:clear-request petal:send', closeVarAc);
});

// ---------------------------------------------------------------------------
// Detect {{ token immediately before the cursor
// ---------------------------------------------------------------------------

function getVarToken(el) {
    const before = el.value.slice(0, el.selectionStart);
    // Match {{ followed by zero or more valid var-name chars, right at cursor
    const match = before.match(/\{\{([a-zA-Z0-9_]*)$/);
    if (!match) return null;
    return {
        partial:    match[1],
        tokenStart: el.selectionStart - match[0].length,
        cursorPos:  el.selectionStart,
    };
}

// ---------------------------------------------------------------------------
// Check whether to open / update / close the dropdown
// ---------------------------------------------------------------------------

function checkVarAc(el) {
    const token = getVarToken(el);
    if (!token) { closeVarAc(); return; }

    const vars = (typeof getActiveEnvVars === 'function') ? getActiveEnvVars() : [];
    if (!vars.length) { closeVarAc(); return; }

    const q = token.partial.toLowerCase();
    const matches = vars.filter(function (v) {
        return q === '' || v.var_key.toLowerCase().includes(q);
    });

    if (!matches.length) { closeVarAc(); return; }

    _vaActive  = el;
    _vaToken   = token;
    _vaItems   = matches;
    _vaFocused = -1;

    renderVarAc(matches);

    // Suppress the URL-bar autocomplete while var AC is open
    if (typeof closeAc === 'function') closeAc();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderVarAc(items) {
    let $drop = $('#var-ac');
    if (!$drop.length) {
        $drop = $('<div>').attr('id', 'var-ac').addClass('var-ac d-none');
        $('body').append($drop);
    }

    $drop.empty();

    items.forEach(function (v, idx) {
        const isSecret = v.is_secret == 1;
        const preview  = isSecret
            ? '●●●●●'
            : (v.var_value.length > 42 ? v.var_value.slice(0, 39) + '…' : v.var_value);

        const $item = $('<div>')
            .addClass('var-ac-item')
            .attr('data-idx', idx)
            .on('mousedown', function (e) { e.preventDefault(); })  // keep input focus on click
            .on('click',     function () { selectVarAcItem(idx); })
            .on('mouseenter', function () { setVaFocus(idx); });

        $item.append(
            $('<span>').addClass('var-ac-key').text('{{' + v.var_key + '}}'),
            $('<span>').addClass('var-ac-val' + (isSecret ? ' var-ac-secret' : '')).text(preview)
        );

        $drop.append($item);
    });

    positionVarAc($drop);
    $drop.removeClass('d-none');
}

function positionVarAc($drop) {
    if (!_vaActive) return;
    const rect = _vaActive.getBoundingClientRect();
    $drop.css({
        top:    rect.bottom + 3,
        left:   rect.left,
        width:  Math.max(rect.width, 280),
    });
}

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

function handleVaKeydown(e) {
    const $drop = $('#var-ac');
    if (!$drop.length || $drop.hasClass('d-none')) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVaFocus(Math.min(_vaFocused + 1, _vaItems.length - 1));

    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVaFocus(Math.max(_vaFocused - 1, 0));

    } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (_vaItems.length > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();   // prevent petal:send on Enter
            selectVarAcItem(_vaFocused >= 0 ? _vaFocused : 0);
        }

    } else if (e.key === 'Escape') {
        e.stopPropagation();
        closeVarAc();
    }
}

function setVaFocus(idx) {
    _vaFocused = idx;
    const $items = $('#var-ac .var-ac-item');
    $items.removeClass('var-ac-focused');
    if (idx >= 0) {
        const $target = $items.eq(idx).addClass('var-ac-focused');
        $target.get(0) && $target.get(0).scrollIntoView({ block: 'nearest' });
    }
}

// ---------------------------------------------------------------------------
// Select — replace {{partial with {{var_name}}
// ---------------------------------------------------------------------------

function selectVarAcItem(idx) {
    const v = _vaItems[idx];
    if (!v || !_vaActive || !_vaToken) return;

    const el  = _vaActive;
    const tok = _vaToken;

    // Replace everything from {{ back to the cursor with the completed token
    const newVal = el.value.slice(0, tok.tokenStart) + '{{' + v.var_key + '}}' + el.value.slice(tok.cursorPos);
    el.value = newVal;

    // Place cursor right after the closing }}
    const newPos = tok.tokenStart + v.var_key.length + 4;
    el.setSelectionRange(newPos, newPos);

    // Fire input + change so URL sync and dirty-tracking still work
    $(el).trigger('input').trigger('change');

    closeVarAc();
}

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

function closeVarAc() {
    $('#var-ac').addClass('d-none');
    _vaFocused = -1;
    _vaItems   = [];
    _vaToken   = null;
    _vaActive  = null;
}
