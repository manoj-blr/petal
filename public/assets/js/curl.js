// curl.js — cURL generator and importer
//
// Generator: builds a curl command string from the current workspace state.
// Importer:  parses a pasted curl command and loads it into the workspace.

// ---------------------------------------------------------------------------
// Init — wire buttons
// ---------------------------------------------------------------------------

$(function () {

    // ── Copy as cURL ────────────────────────────────────────────────────────

    $('#copy-curl-btn').on('click', function () {
        const cmd = buildCurlCommand();
        if (!cmd) { showToast('Enter a URL first', 'warning'); return; }

        navigator.clipboard.writeText(cmd)
            .then(function ()  { showToast('cURL command copied to clipboard', 'success'); })
            .catch(function () { showToast('Copy failed — try selecting + Ctrl+C', 'error'); });
    });

    // ── Open import modal ───────────────────────────────────────────────────

    $('#import-curl-btn').on('click', function () {
        $('#curl-import-input').val('');
        $('#curl-import-error').addClass('d-none').text('');
        bootstrap.Modal.getOrCreateInstance('#curl-import-modal').show();
    });

    $('#curl-import-modal').on('shown.bs.modal', function () {
        $('#curl-import-input').focus();
    });

    // Ctrl+Enter inside the textarea triggers import
    $('#curl-import-input').on('keydown', function (e) {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            $('#curl-import-confirm-btn').trigger('click');
        }
    });

    // Clear error on input
    $('#curl-import-input').on('input', function () {
        $('#curl-import-error').addClass('d-none');
    });

    // ── Confirm import ──────────────────────────────────────────────────────

    $('#curl-import-confirm-btn').on('click', function () {
        const raw = $('#curl-import-input').val().trim();
        if (!raw) { showToast('Paste a cURL command first', 'warning'); return; }

        const parsed = parseCurlCommand(raw);

        if (!parsed.url) {
            $('#curl-import-error').removeClass('d-none')
                .text('Could not find a URL in the pasted command — make sure it starts with curl.');
            return;
        }

        bootstrap.Modal.getInstance('#curl-import-modal').hide();
        importCurlIntoWorkspace(parsed);
    });
});

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Builds a curl command string from the current workspace state.
 * Returns null if no URL is set.
 */
function buildCurlCommand() {
    const method    = $('#method-select').val();
    const url       = $('#url-input').val().trim();
    if (!url) return null;

    // Merge auth headers first, user headers override on conflict
    const headers   = Object.assign({}, window.getAuthHeaders(), window.getRequestHeaders());
    const body      = window.getRequestBody();
    const bodyType  = window.getRequestBodyType();
    const verifySsl = (typeof getSslVerify === 'function') ? getSslVerify() : true;

    const parts = ['curl'];

    if (!verifySsl) parts.push('--insecure');

    // Only emit -X for non-GET — cleaner output for the common case
    if (method !== 'GET') parts.push('-X ' + method);

    parts.push(shellQuote(url));

    Object.entries(headers).forEach(function ([key, value]) {
        parts.push('-H ' + shellQuote(key + ': ' + value));
    });

    if (body && bodyType !== 'none') {
        parts.push('-d ' + shellQuote(body));
    }

    return parts.join(' \\\n  ');
}

/**
 * Wraps a string in single quotes, escaping any single quotes inside.
 * Produces shell-compatible output: hello'world → 'hello'\''world'
 */
function shellQuote(str) {
    return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

// ---------------------------------------------------------------------------
// Importer
// ---------------------------------------------------------------------------

/**
 * Main entry point: parses raw curl string and fills the workspace.
 */
function importCurlIntoWorkspace(parsed) {
    // Build a fake request object that loadSavedRequest() accepts.
    // Name shows in the request bar as a hint that this was imported.
    const fakeReq = {
        id:          null,
        name:        'Imported from cURL',
        method:      parsed.method  || 'GET',
        url:         parsed.url     || '',
        headers:     parsed.headers,          // [{key, value, enabled}]
        body:        parsed.body    || null,
        body_type:   parsed.bodyType || 'none',
        params:      [],
        auth:        { type: 'none' },
        notes:       null,
        verify_ssl:  parsed.verifySsl ? 1 : 0,
        timeout_sec: 30,
    };

    // loadSavedRequest handles the dirty check and fires petal:load-request
    // for all tab modules (headers, body, auth, notes, params).
    loadSavedRequest(fakeReq);

    // Mark dirty immediately — this is an unsaved workspace state
    markDirty();

    const headerCount = parsed.headers.length;
    const bodyNote    = parsed.body ? ', body' : '';
    showToast(
        'Imported: ' + parsed.method + ' — ' +
        headerCount + ' header' + (headerCount !== 1 ? 's' : '') + bodyNote,
        'success'
    );
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parses a curl command string into a structured object.
 *
 * Handles:
 *   -X / --request METHOD
 *   -H / --header 'Name: Value'
 *   -d / --data / --data-raw / --data-binary / --data-ascii 'body'
 *   -k / --insecure
 *   -u / --user 'user:pass'  (converted to Authorization: Basic header)
 *   -G / --get
 *   \ line continuations
 *   Single-quoted, double-quoted, and unquoted arguments
 *   Shell-escaped single quotes ( '\'' )
 */
function parseCurlCommand(raw) {
    // Normalise line continuations before tokenising
    const str    = raw.trim().replace(/\\\r?\n\s*/g, ' ');
    const tokens = tokenizeCurl(str);

    const result = {
        method:    'GET',
        url:       null,
        headers:   [],
        body:      null,
        bodyType:  'none',
        verifySsl: true,
    };

    // Skip the leading 'curl' token
    let i = (tokens[0] || '').toLowerCase() === 'curl' ? 1 : 0;

    while (i < tokens.length) {
        const t = tokens[i];

        if (t === '-X' || t === '--request') {
            result.method = (tokens[++i] || 'GET').toUpperCase();

        } else if (t === '-H' || t === '--header') {
            const h  = tokens[++i] || '';
            const ci = h.indexOf(':');
            if (ci > 0) {
                result.headers.push({
                    key:     h.slice(0, ci).trim(),
                    value:   h.slice(ci + 1).trim(),
                    enabled: true,
                });
            }

        } else if (t === '-d' || t === '--data' ||
                   t === '--data-raw' || t === '--data-binary' || t === '--data-ascii') {
            result.body = tokens[++i] || null;
            if (result.body) {
                // Auto-detect JSON vs raw
                try { JSON.parse(result.body); result.bodyType = 'json'; }
                catch (_) { result.bodyType = 'raw'; }
            }

        } else if (t === '-k' || t === '--insecure') {
            result.verifySsl = false;

        } else if (t === '-u' || t === '--user') {
            const creds = tokens[++i] || '';
            const ci    = creds.indexOf(':');
            const user  = ci > -1 ? creds.slice(0, ci) : creds;
            const pass  = ci > -1 ? creds.slice(ci + 1) : '';
            try {
                const b64 = btoa(unescape(encodeURIComponent(user + ':' + pass)));
                result.headers.push({
                    key: 'Authorization', value: 'Basic ' + b64, enabled: true,
                });
            } catch (_) {}

        } else if (t === '-G' || t === '--get') {
            result.method = 'GET';

        } else if (!t.startsWith('-') && !result.url) {
            // First non-flag token that isn't 'curl' is the URL
            result.url = t;
        }
        // Unknown flags (-L, -v, -s, --compressed, --location, etc.) are silently skipped

        i++;
    }

    return result;
}

/**
 * Shell-aware tokeniser.
 *
 * Handles concatenated quoted segments so that 'he'\''llo' → he'llo,
 * which is how our generator escapes single quotes.
 *
 * Rules:
 *   'single-quoted'  — no backslash processing inside
 *   "double-quoted"  — \" and \\ are the only escape sequences
 *   unquoted \x      — backslash escapes the next character
 *
 * Adjacent quoted/unquoted segments with no whitespace between them
 * are concatenated into a single token, exactly as a real shell would.
 */
function tokenizeCurl(str) {
    const tokens = [];
    let i = 0;

    while (i < str.length) {
        // Skip whitespace
        while (i < str.length && /\s/.test(str[i])) i++;
        if (i >= str.length) break;

        // Build one token (may be a concatenation of quoted + unquoted segments)
        let token = '';

        while (i < str.length && !/\s/.test(str[i])) {

            if (str[i] === "'") {
                // Single-quoted segment — read until closing ' (no backslash processing)
                i++;
                while (i < str.length && str[i] !== "'") token += str[i++];
                i++; // skip closing '

            } else if (str[i] === '"') {
                // Double-quoted segment — \" and \\ are escape sequences
                i++;
                while (i < str.length && str[i] !== '"') {
                    if (str[i] === '\\' && i + 1 < str.length &&
                        (str[i + 1] === '"' || str[i + 1] === '\\')) {
                        token += str[i + 1]; i += 2;
                    } else {
                        token += str[i++];
                    }
                }
                i++; // skip closing "

            } else if (str[i] === '\\') {
                // Unquoted backslash — escapes the next character
                if (i + 1 < str.length) { token += str[i + 1]; i += 2; }
                else i++;

            } else {
                token += str[i++];
            }
        }

        tokens.push(token);
    }

    return tokens;
}
