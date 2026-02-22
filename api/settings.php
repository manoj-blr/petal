<?php

declare(strict_types=1);

header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';

// ---------------------------------------------------------------------------
// Allowed keys — whitelist prevents arbitrary data being stored
// ---------------------------------------------------------------------------

const ALLOWED_KEYS = ['layout', 'sidebar_visible', 'theme'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(bool $success, mixed $data = null, ?string $error = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['success' => $success, 'data' => $data, 'error' => $error]);
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** Returns all settings as a flat {key: value} object. */
function handleGet(PDO $db): void
{
    $rows = $db->query('SELECT `key`, value FROM settings')->fetchAll();
    $out  = [];
    foreach ($rows as $row) {
        $out[$row['key']] = $row['value'];
    }
    jsonResponse(true, $out);
}

/** Upserts a single setting. Expects ?key=X and body {value: Y}. */
function handlePut(PDO $db): void
{
    $key = trim($_GET['key'] ?? '');

    if (!in_array($key, ALLOWED_KEYS, true)) {
        jsonResponse(false, null, 'Unknown setting key: "' . $key . '".', 400);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    if (!array_key_exists('value', $input)) {
        jsonResponse(false, null, '"value" is required.', 400);
        return;
    }

    $value = (string) $input['value'];

    // INSERT … ON DUPLICATE KEY UPDATE — works whether the row exists or not
    $stmt = $db->prepare(
        'INSERT INTO settings (`key`, value) VALUES (:key, :value)
         ON DUPLICATE KEY UPDATE value = :value2'
    );
    $stmt->execute([':key' => $key, ':value' => $value, ':value2' => $value]);

    jsonResponse(true, ['key' => $key, 'value' => $value]);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

try {
    $db = getDb();

    match ($_SERVER['REQUEST_METHOD']) {
        'GET'   => handleGet($db),
        'PUT'   => handlePut($db),
        default => jsonResponse(false, null, 'Method not allowed.', 405),
    };
} catch (RuntimeException $e) {
    jsonResponse(false, null, $e->getMessage(), 500);
} catch (PDOException $e) {
    jsonResponse(false, null, 'Database error: ' . $e->getMessage(), 500);
}
