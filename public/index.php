<!DOCTYPE html>
<html lang="en" data-bs-theme="dark" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Petal</title>

    <!--
        Load order matters:
        1. theme.css  — defines all CSS custom properties
        2. Bootstrap  — respects data-bs-theme="dark", uses our vars via overrides
        3. app.css    — layout + components, references only CSS vars
    -->
    <link rel="stylesheet" href="assets/css/theme.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <link rel="stylesheet" href="assets/css/app.css">
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════════
     TOPBAR
════════════════════════════════════════════════════════════════ -->
<nav id="topbar">
    <div class="topbar-brand">
        <button class="btn-icon" id="sidebar-toggle" title="Toggle sidebar (Ctrl+/)">
            <i class="bi bi-layout-sidebar"></i>
            <span class="kbd-chip">Ctrl+/</span>
        </button>
        <span class="brand-name">Petal</span>
    </div>

    <div class="topbar-center">
        <div class="dropdown">
            <button class="env-switcher" id="env-dropdown-btn" data-bs-toggle="dropdown" aria-expanded="false" title="Switch environment (Ctrl+E)">
                <span class="env-dot" id="env-dot"></span>
                <span id="env-name">Loading…</span>
                <i class="bi bi-chevron-down env-chevron"></i>
                <span class="kbd-chip">Ctrl+E</span>
            </button>
            <ul class="dropdown-menu env-dropdown-menu" id="env-menu">
                <!-- Populated by environments.js -->
                <li><hr class="dropdown-divider my-1"></li>
                <li>
                    <a class="dropdown-item" href="#" id="manage-environments-btn">
                        <i class="bi bi-gear me-2"></i>Manage Environments
                    </a>
                </li>
            </ul>
        </div>
    </div>

    <div class="topbar-end">
        <button class="btn-icon cmd-hint-btn" id="topbar-new-btn" title="New request (Alt+N)">
            <i class="bi bi-plus-lg"></i>
            <span class="kbd-chip">Alt+N</span>
        </button>
        <div class="topbar-divider"></div>
        <button class="btn-icon cmd-hint-btn" id="theme-toggle-btn" title="Switch to light theme"
                onclick="toggleTheme()">
            <i class="bi bi-sun"></i>
        </button>
        <button class="btn-icon cmd-hint-btn" id="shortcuts-btn" title="Keyboard shortcuts (?)"
                data-bs-toggle="modal" data-bs-target="#shortcuts-modal">
            <i class="bi bi-keyboard"></i>
            <span class="kbd-chip">?</span>
        </button>
        <button class="btn-icon cmd-hint-btn" id="cmd-palette-btn" title="Command Palette (Ctrl+K)">
            <i class="bi bi-search"></i>
            <span class="kbd-chip">Ctrl+K</span>
        </button>
    </div>
</nav>

<!-- ═══════════════════════════════════════════════════════════════
     MAIN AREA  (sidebar + workspace)
════════════════════════════════════════════════════════════════ -->
<div id="main-area">

    <!-- ── SIDEBAR ─────────────────────────────────────────── -->
    <aside id="sidebar">

        <div class="sidebar-top">
            <button class="btn-new-request" id="new-request-btn">
                <i class="bi bi-plus-lg"></i> New Request
                <span class="kbd-chip ms-auto">Alt+N</span>
            </button>
        </div>

        <!-- Collections -->
        <div class="sidebar-section">
            <div class="sidebar-section-header">
                <span class="sidebar-section-label">Collections</span>
                <div class="d-flex gap-1">
                    <button class="btn-icon btn-icon-sm" id="import-collection-btn" title="Import collection from JSON">
                        <i class="bi bi-upload"></i>
                    </button>
                    <button class="btn-icon btn-icon-sm" id="add-collection-btn" title="New collection">
                        <i class="bi bi-folder-plus"></i>
                    </button>
                </div>
            </div>
            <div id="collections-list">
                <!-- Skeleton shown while loading, replaced by collections.js -->
                <div class="sidebar-skeleton">
                    <div class="skeleton-line w-75"></div>
                    <div class="skeleton-line w-50"></div>
                    <div class="skeleton-line w-65"></div>
                </div>
            </div>
        </div>

        <!-- History -->
        <div class="sidebar-section sidebar-section-history">
            <div class="sidebar-section-header">
                <div class="d-flex align-items-center gap-2">
                    <span class="sidebar-section-label">History</span>
                    <span class="kbd-chip sidebar-label-chip">Ctrl+H</span>
                </div>
                <button class="btn-icon btn-icon-sm" id="clear-history-btn" title="Clear history">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
            <div id="history-list">
                <div class="sidebar-empty">
                    <i class="bi bi-clock-history"></i>
                    <p>No history yet</p>
                </div>
            </div>
        </div>

    </aside><!-- /#sidebar -->

    <!-- ── WORKSPACE ───────────────────────────────────────── -->
    <main id="workspace">

        <!-- Request name bar -->
        <div class="request-name-bar">
            <span id="request-name-label">New Request</span>
            <span class="unsaved-dot d-none" id="unsaved-dot" title="Unsaved changes">●</span>
            <div class="ms-auto d-flex align-items-center gap-1">
                <button class="btn-icon btn-icon-sm" id="import-curl-btn" title="Import from cURL — paste a curl command">
                    <i class="bi bi-box-arrow-in-down"></i>
                </button>
                <button class="btn-icon btn-icon-sm" id="copy-curl-btn" title="Copy as cURL">
                    <i class="bi bi-terminal"></i>
                </button>
                <div class="topbar-divider" style="height:16px;"></div>
                <button class="btn-icon btn-icon-sm" id="layout-toggle-btn" title="Toggle split / stacked view">
                    <i class="bi bi-layout-split"></i>
                </button>
                <button class="btn-icon" id="save-btn" title="Save request (Ctrl+S)">
                    <i class="bi bi-floppy"></i>
                    <span class="kbd-chip">Ctrl+S</span>
                </button>
            </div>
        </div>

        <!-- URL bar -->
        <div class="url-bar">
            <div class="method-select-wrap">
                <select id="method-select" class="method-select" data-method="GET">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                    <option value="HEAD">HEAD</option>
                    <option value="OPTIONS">OPTIONS</option>
                </select>
                <span class="kbd-chip method-kbd-chip">Alt+M</span>
            </div>

            <input type="text"
                   id="url-input"
                   class="url-input"
                   placeholder="https://api.example.com/endpoint  ·  or  ·  {{base_url}}/path"
                   spellcheck="false"
                   autocomplete="off" 
                   autofocus>

            <button class="btn-icon btn-icon-sm ssl-toggle-btn" id="ssl-toggle-btn"
                    title="SSL verification ON — click to disable for self-signed certs">
                <i class="bi bi-shield-check"></i>
            </button>

            <div class="timeout-wrap" title="Request timeout (seconds)">
                <input type="number" id="timeout-input" class="timeout-input"
                       value="30" min="1" max="300" step="1" spellcheck="false">
                <span class="timeout-unit">s</span>
            </div>

            <button class="btn-send" id="send-btn">
                <span class="send-label">Send</span>
                <span class="send-shortcut">Ctrl+↵</span>
                <span class="spinner-border spinner-border-sm d-none" id="send-spinner" role="status" aria-hidden="true"></span>
            </button>
        </div>

        <!-- Workspace body — direction controlled by layout toggle -->
        <div id="workspace-body">

        <!-- Request pane -->
        <div id="request-pane">
        <div class="request-tabs-wrap">
            <ul class="nav nav-tabs petal-tabs" id="request-tabs" role="tablist">
                <li class="nav-item" role="presentation">
                    <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tab-params" type="button" role="tab">
                        Params
                        <span class="tab-count d-none" id="params-count"></span>
                        <span class="tab-kbd">1</span>
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-headers" type="button" role="tab">
                        Headers
                        <span class="tab-count d-none" id="headers-count"></span>
                        <span class="tab-kbd">2</span>
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link" id="body-tab-btn" data-bs-toggle="tab" data-bs-target="#tab-body" type="button" role="tab">
                        Body
                        <span class="tab-kbd">3</span>
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-auth" type="button" role="tab">
                        Auth
                        <span class="tab-kbd">4</span>
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-notes" type="button" role="tab">
                        Notes
                        <span class="tab-kbd">5</span>
                    </button>
                </li>
            </ul>

            <div class="tab-content request-tab-content">
                <div class="tab-pane fade show active" id="tab-params" role="tabpanel">
                    <!-- Populated in TASK 4.2 -->
                    <div class="tab-placeholder">
                        <i class="bi bi-question-circle"></i>
                        <p>Params editor — coming in TASK 4.2</p>
                    </div>
                </div>
                <div class="tab-pane fade" id="tab-headers" role="tabpanel">
                    <!-- Populated in TASK 4.3 -->
                    <div class="tab-placeholder">
                        <i class="bi bi-list-ul"></i>
                        <p>Headers editor — coming in TASK 4.3</p>
                    </div>
                </div>
                <div class="tab-pane fade" id="tab-body" role="tabpanel">
                    <!-- Populated in TASK 4.4 -->
                    <div class="tab-placeholder">
                        <i class="bi bi-braces"></i>
                        <p>Body editor — coming in TASK 4.4</p>
                    </div>
                </div>
                <div class="tab-pane fade" id="tab-auth" role="tabpanel">
                    <!-- Populated by auth.js -->
                </div>
                <div class="tab-pane fade" id="tab-notes" role="tabpanel">
                    <textarea id="notes-textarea" class="notes-textarea"
                              placeholder="Document this request — what it does, expected inputs, quirks, example values…"
                              spellcheck="false"></textarea>
                </div>
            </div>
        </div><!-- /.request-tabs-wrap -->
        </div><!-- /#request-pane -->

        <!-- Pane resize divider -->
        <div id="pane-divider"></div>

        <!-- Response pane -->
        <div id="response-pane">

        <!-- ── RESPONSE PLACEHOLDER (visible before first send) ── -->
        <div id="resp-placeholder" class="resp-placeholder">
            <i class="bi bi-send"></i>
            <p>Send a request to see the response</p>
            <small>Press <kbd>Ctrl+Enter</kbd> or click Send</small>
        </div>

        <!-- ── RESPONSE PANEL (hidden until first send) ─────── -->
        <div id="response-panel" class="response-panel d-none">

            <div class="response-meta-bar">
                <span class="response-status-badge" id="response-status-badge"></span>
                <span class="response-meta-item">
                    <i class="bi bi-clock"></i>
                    <span id="response-duration">—</span>
                </span>
                <span class="response-meta-item">
                    <i class="bi bi-file-earmark-text"></i>
                    <span id="response-size">—</span>
                </span>
            </div>

            <ul class="nav nav-tabs petal-tabs" id="response-tabs" role="tablist">
                <li class="nav-item" role="presentation">
                    <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#resp-body" type="button" role="tab">Body<span class="tab-kbd">6</span></button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#resp-headers" type="button" role="tab">Headers<span class="tab-kbd">7</span></button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#resp-info" type="button" role="tab">Info</button>
                </li>
                <li class="nav-item d-none" role="presentation" id="resp-preview-tab-li">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#resp-preview" type="button" role="tab">Preview</button>
                </li>
            </ul>

            <div class="tab-content response-tab-content">
                <div class="tab-pane fade show active" id="resp-body" role="tabpanel">
                    <div class="response-body-toolbar">
                        <button class="btn-icon btn-icon-sm" id="copy-response-btn" title="Copy body">
                            <i class="bi bi-clipboard"></i> Copy
                        </button>
                        <button class="btn-icon btn-icon-sm" id="wrap-response-btn" title="Toggle word wrap">
                            <i class="bi bi-text-wrap"></i> Wrap
                        </button>
                        <div class="resp-search-wrap ms-auto">
                            <input type="text" id="resp-search-input" class="resp-search-input"
                                   placeholder="Search  or  $.path.to.key"
                                   autocomplete="off" spellcheck="false">
                            <span class="resp-search-count d-none" id="resp-search-count"></span>
                            <button class="btn-icon btn-icon-sm d-none" id="resp-search-clear" title="Clear search">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>
                    <div id="response-body" class="response-body"></div>
                </div>

                <div class="tab-pane fade" id="resp-headers" role="tabpanel">
                    <table class="response-headers-table w-100">
                        <thead>
                            <tr>
                                <th>Header</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody id="response-headers-tbody"></tbody>
                    </table>
                </div>

                <div class="tab-pane fade" id="resp-info" role="tabpanel">
                    <dl class="response-info-list" id="response-info-list"></dl>
                </div>

                <div class="tab-pane fade" id="resp-preview" role="tabpanel">
                    <iframe id="resp-preview-frame" class="resp-preview-frame"></iframe>
                </div>
            </div>

        </div><!-- /#response-panel -->

        </div><!-- /#response-pane -->
        </div><!-- /#workspace-body -->

    </main><!-- /#workspace -->

</div><!-- /#main-area -->


<!-- ═══════════════════════════════════════════════════════════════
     MODALS
════════════════════════════════════════════════════════════════ -->

<!-- Environments -->
<div class="modal fade" id="environments-modal" tabindex="-1" aria-labelledby="env-modal-title" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content petal-modal">
            <div class="modal-header">
                <h5 class="modal-title" id="env-modal-title">
                    <i class="bi bi-layers me-2"></i>Environments
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" id="environments-modal-body">
                <!-- Populated by environments.js -->
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary btn-sm" id="add-environment-btn">
                    <i class="bi bi-plus"></i> New Environment
                </button>
            </div>
        </div>
    </div>
</div>

<!-- Save Request -->
<div class="modal fade" id="save-request-modal" tabindex="-1" aria-labelledby="save-modal-title" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content petal-modal">
            <div class="modal-header">
                <h5 class="modal-title" id="save-modal-title">
                    <i class="bi bi-bookmark-plus me-2"></i>Save Request
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label class="form-label" for="save-name-input">Name</label>
                    <input type="text" class="form-control petal-input" id="save-name-input" placeholder="e.g. Get user by ID">
                </div>
                <div class="mb-3">
                    <label class="form-label" for="save-collection-select">Collection <span class="text-muted">(optional)</span></label>
                    <select class="form-select petal-input" id="save-collection-select">
                        <option value="">— No collection —</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="save-request-confirm-btn">Save</button>
            </div>
        </div>
    </div>
</div>

<!-- cURL Import -->
<div class="modal fade" id="curl-import-modal" tabindex="-1" aria-labelledby="curl-import-modal-title" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content petal-modal">
            <div class="modal-header">
                <h5 class="modal-title" id="curl-import-modal-title">
                    <i class="bi bi-box-arrow-in-down me-2"></i>Import from cURL
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <p class="text-muted small mb-2">
                    Paste a <code>curl</code> command from your terminal, browser DevTools
                    <em>(right-click network request → Copy as cURL)</em>, or API docs.
                    Method, URL, headers, body, and SSL settings will all be imported.
                </p>
                <textarea id="curl-import-input" class="curl-import-textarea"
                          placeholder="curl -X POST 'https://api.example.com/endpoint' \&#10;  -H 'Authorization: Bearer token' \&#10;  -H 'Content-Type: application/json' \&#10;  -d '{&quot;key&quot;: &quot;value&quot;}'"
                          spellcheck="false" autocomplete="off"></textarea>
                <div id="curl-import-error" class="curl-import-error d-none"></div>
            </div>
            <div class="modal-footer">
                <small class="text-muted me-auto"><kbd>Ctrl+Enter</kbd> to import</small>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm" id="curl-import-confirm-btn">
                    <i class="bi bi-box-arrow-in-down me-1"></i>Import
                </button>
            </div>
        </div>
    </div>
</div>

<!-- Keyboard Shortcuts -->
<div class="modal fade" id="shortcuts-modal" tabindex="-1" aria-labelledby="shortcuts-modal-title" aria-hidden="true">
    <div class="modal-dialog modal-sm">
        <div class="modal-content petal-modal">
            <div class="modal-header">
                <h5 class="modal-title" id="shortcuts-modal-title">
                    <i class="bi bi-keyboard me-2"></i>Keyboard Shortcuts
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-0">
                <table class="shortcuts-table w-100">
                    <tbody>
                        <tr><td><kbd>Ctrl+Enter</kbd></td><td>Send request</td></tr>
                        <tr><td><kbd>Ctrl+S</kbd></td><td>Save request</td></tr>
                        <tr><td><kbd>Alt+N</kbd></td><td>New request</td></tr>
                        <tr><td><kbd>Ctrl+K</kbd></td><td>Command palette</td></tr>
                        <tr><td><kbd>Ctrl+E</kbd></td><td>Environment switcher</td></tr>
                        <tr><td><kbd>Ctrl+/</kbd></td><td>Toggle sidebar</td></tr>
                        <tr><td><kbd>Ctrl+\</kbd></td><td>Toggle split view</td></tr>
                        <tr><td><kbd>Ctrl+H</kbd></td><td>Toggle history</td></tr>
                        <tr><td><kbd>Esc</kbd></td><td>Close modal / menu</td></tr>
                        <tr><td><kbd>?</kbd></td><td>Show this list</td></tr>
                        <tr><td><kbd>Alt+M</kbd></td><td>Focus method selector</td></tr>
                        <tr><td><kbd>Alt+1–5</kbd></td><td>Request tabs (Params → Notes)</td></tr>
                        <tr><td><kbd>Alt+6–7</kbd></td><td>Response Body / Headers</td></tr>
                        <tr><td><kbd>Ctrl+L</kbd></td><td>Focus URL bar</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- Command Palette -->
<div class="modal fade cmd-palette-modal" id="cmd-palette-modal" tabindex="-1" aria-label="Command palette" aria-hidden="true">
    <div class="modal-dialog cmd-palette-dialog">
        <div class="modal-content petal-modal">
            <div class="modal-body p-0">
                <div class="cmd-search-row">
                    <i class="bi bi-search cmd-search-icon"></i>
                    <input type="text"
                           id="cmd-palette-input"
                           class="cmd-search-input"
                           placeholder="Search requests…"
                           autocomplete="off"
                           spellcheck="false">
                </div>
                <ul id="cmd-palette-results" class="cmd-results-list"></ul>
                <div class="cmd-empty d-none" id="cmd-palette-empty">
                    <i class="bi bi-inbox"></i>
                    <p>No saved requests found</p>
                </div>
            </div>
        </div>
    </div>
</div>


<!-- ═══════════════════════════════════════════════════════════════
     COLLECTION CONTEXT MENU
════════════════════════════════════════════════════════════════ -->
<div id="col-ctx-menu" class="ctx-menu d-none" role="menu">
    <button class="ctx-item" id="col-ctx-export-petal">
        <i class="bi bi-filetype-json"></i> Export as Petal JSON
    </button>
    <button class="ctx-item" id="col-ctx-export-postman">
        <i class="bi bi-box-arrow-up"></i> Export as Postman v2.1
    </button>
    <div class="ctx-divider"></div>
    <button class="ctx-item ctx-item-danger" id="col-ctx-delete">
        <i class="bi bi-trash"></i> Delete collection
    </button>
</div>

<!-- ═══════════════════════════════════════════════════════════════
     IMPORT COLLECTION MODAL
════════════════════════════════════════════════════════════════ -->
<div class="modal fade" id="import-modal" tabindex="-1" aria-labelledby="import-modal-title" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content petal-modal">
            <div class="modal-header">
                <h5 class="modal-title" id="import-modal-title">
                    <i class="bi bi-upload me-2"></i>Import Collection
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">

                <!-- File drop zone -->
                <div class="import-drop-zone" id="import-drop-zone">
                    <i class="bi bi-file-earmark-arrow-up import-drop-icon"></i>
                    <p class="mb-1">Drop a <code>.json</code> file here</p>
                    <label for="import-file-input" class="import-file-label">or choose file</label>
                    <input type="file" id="import-file-input" accept=".json" class="d-none">
                </div>

                <div class="import-or-divider">— or paste JSON —</div>

                <textarea
                    id="import-paste-area"
                    class="import-paste-area petal-input"
                    rows="7"
                    placeholder="Paste a Petal export or a Postman v2.1 collection here…"
                    spellcheck="false"
                ></textarea>

                <!-- Detection preview (hidden until valid JSON is parsed) -->
                <div id="import-preview" class="import-preview d-none"></div>

            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm" id="import-confirm-btn" disabled>
                    <i class="bi bi-upload me-1"></i>Import
                </button>
            </div>
        </div>
    </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════
     CONTEXT MENU  (request items in sidebar)
════════════════════════════════════════════════════════════════ -->
<div id="ctx-menu" class="ctx-menu d-none" role="menu">
    <button class="ctx-item" id="ctx-rename">
        <i class="bi bi-pencil"></i> Rename
    </button>
    <button class="ctx-item" id="ctx-duplicate">
        <i class="bi bi-copy"></i> Duplicate
    </button>
    <div class="ctx-section-label">Move to collection</div>
    <div class="ctx-move-list"></div>
    <div class="ctx-divider"></div>
    <button class="ctx-item ctx-item-danger" id="ctx-delete">
        <i class="bi bi-trash"></i> Delete
    </button>
</div>

<!-- ═══════════════════════════════════════════════════════════════
     TOAST CONTAINER  (top-right)
════════════════════════════════════════════════════════════════ -->
<div id="toast-container" aria-live="polite" aria-atomic="true"></div>


<!-- ═══════════════════════════════════════════════════════════════
     SCRIPTS  — CDN first, then our modules in dependency order
════════════════════════════════════════════════════════════════ -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>

<script src="assets/js/app.js"></script>
<script src="assets/js/settings.js"></script>
<script src="assets/js/shortcuts.js"></script>
<script src="assets/js/environments.js"></script>
<script src="assets/js/collections.js"></script>
<script src="assets/js/palette.js"></script>
<script src="assets/js/history.js"></script>
<script src="assets/js/autocomplete.js"></script>
<script src="assets/js/var-autocomplete.js"></script>
<script src="assets/js/request.js"></script>
<script src="assets/js/save.js"></script>
<script src="assets/js/headers.js"></script>
<script src="assets/js/body.js"></script>
<script src="assets/js/auth.js"></script>
<script src="assets/js/response.js"></script>
<script src="assets/js/curl.js"></script>
<script src="assets/js/pane-resize.js"></script>

</body>
</html>
