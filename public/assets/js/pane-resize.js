// pane-resize.js — Draggable divider between request and response panes.
//
// Works in both split (horizontal drag, col-resize) and
// stacked (vertical drag, row-resize) layouts.
// Ratios stored in localStorage:
//   petal_split_ratio   — 0–100 number (default 50)
//   petal_stacked_ratio — 0–100 number (default 40)

(function () {

    var LS_SPLIT   = 'petal_split_ratio';
    var LS_STACKED = 'petal_stacked_ratio';

    var _dragging = false;

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    function isSplit() {
        return document.getElementById('workspace').classList.contains('layout-split');
    }

    function clampRatio(v) { return Math.max(15, Math.min(85, v)); }

    function getSplitRatio() {
        var v = parseFloat(localStorage.getItem(LS_SPLIT));
        return isNaN(v) ? 50 : clampRatio(v);
    }

    function getStackedRatio() {
        var v = parseFloat(localStorage.getItem(LS_STACKED));
        return isNaN(v) ? 40 : clampRatio(v);
    }

    // Apply ratio as a CSS custom property on the relevant element.
    // CSS selectors pick up the var() based on which layout classes are active.
    function applyRatio(ratio) {
        if (isSplit()) {
            document.getElementById('workspace').style.setProperty('--split-ratio', ratio.toFixed(1) + '%');
        } else {
            document.getElementById('workspace-body').style.setProperty('--stacked-ratio', ratio.toFixed(1) + '%');
        }
    }

    // ---------------------------------------------------------------------------
    // Init — load saved ratios into CSS custom properties
    // ---------------------------------------------------------------------------

    function initRatios() {
        document.getElementById('workspace')
            .style.setProperty('--split-ratio', getSplitRatio() + '%');
        document.getElementById('workspace-body')
            .style.setProperty('--stacked-ratio', getStackedRatio() + '%');
    }

    // ---------------------------------------------------------------------------
    // Drag handlers
    // ---------------------------------------------------------------------------

    function onDividerMousedown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        _dragging = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor     = isSplit() ? 'col-resize' : 'row-resize';
    }

    function onMousemove(e) {
        if (!_dragging) return;

        var body = document.getElementById('workspace-body');
        var rect = body.getBoundingClientRect();
        var ratio;

        if (isSplit()) {
            ratio = ((e.clientX - rect.left) / rect.width) * 100;
        } else {
            ratio = ((e.clientY - rect.top) / rect.height) * 100;
        }

        ratio = clampRatio(ratio);
        applyRatio(ratio);
    }

    function onMouseup(e) {
        if (!_dragging) return;
        _dragging = false;
        document.body.style.userSelect = '';
        document.body.style.cursor     = '';

        // Persist the final position
        var body  = document.getElementById('workspace-body');
        var rect  = body.getBoundingClientRect();
        var ratio;

        if (isSplit()) {
            ratio = clampRatio(((e.clientX - rect.left) / rect.width) * 100);
            localStorage.setItem(LS_SPLIT, ratio.toFixed(1));
        } else {
            ratio = clampRatio(((e.clientY - rect.top) / rect.height) * 100);
            localStorage.setItem(LS_STACKED, ratio.toFixed(1));
        }
    }

    // ---------------------------------------------------------------------------
    // Wire up on DOM ready
    // ---------------------------------------------------------------------------

    $(function () {
        initRatios();

        document.getElementById('pane-divider').addEventListener('mousedown', onDividerMousedown);
        document.addEventListener('mousemove', onMousemove);
        document.addEventListener('mouseup', onMouseup);
    });

})();
