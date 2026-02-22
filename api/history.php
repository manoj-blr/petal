<?php

declare(strict_types=1);

header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(bool $success, mixed $data = null, ?string $error = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['success' => $success, 'data' => $data, 'error' => $error]);
}

/**
 * Decodes JSON-stored header fields back to arrays for a full history entry.
 */
function decodeHistoryEntry(array $row): array
{
    $row['request_headers']  = $row['request_headers']  !== null ? json_decode($row['request_headers'],  true) : null;
    $row['response_headers'] = $row['response_headers'] !== null ? json_decode($row['response_headers'], true) : null;
    return $row;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleGet(PDO $db, ?int $id): void
{
    if ($id !== null) {
        // Single full entry — includes request/response bodies and decoded headers
        $stmt = $db->prepare(
            'SELECT id, saved_request_id, method, url,
                    request_headers, request_body,
                    response_status, response_headers, response_body,
                    response_size_bytes, duration_ms, environment_id, created_at
             FROM request_history
             WHERE id = :id'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        if (!$row) {
            jsonResponse(false, null, 'History entry not found.', 404);
            return;
        }

        jsonResponse(true, decodeHistoryEntry($row));
        return;
    }

    // List — lightweight, no bodies (response_body can be large), last 50 most recent first
    $rows = $db->query(
        'SELECT id, saved_request_id, method, url,
                response_status, response_size_bytes, duration_ms, environment_id, created_at
         FROM request_history
         ORDER BY created_at DESC, id DESC
         LIMIT 50'
    )->fetchAll();

    jsonResponse(true, $rows);
}

function handleDelete(PDO $db, ?int $id): void
{
    if ($id !== null) {
        // Delete single entry
        $stmt = $db->prepare('SELECT id FROM request_history WHERE id = :id');
        $stmt->execute([':id' => $id]);
        if (!$stmt->fetch()) {
            jsonResponse(false, null, 'History entry not found.', 404);
            return;
        }

        $stmt = $db->prepare('DELETE FROM request_history WHERE id = :id');
        $stmt->execute([':id' => $id]);

        jsonResponse(true, null);
        return;
    }

    // Clear all history
    $db->exec('DELETE FROM request_history');
    jsonResponse(true, null);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

try {
    $db     = getDb();
    $method = $_SERVER['REQUEST_METHOD'];
    $id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

    match ($method) {
        'GET'    => handleGet($db, $id),
        'DELETE' => handleDelete($db, $id),
        default  => jsonResponse(false, null, 'Method not allowed.', 405),
    };
} catch (RuntimeException $e) {
    jsonResponse(false, null, $e->getMessage(), 500);
} catch (PDOException $e) {
    jsonResponse(false, null, 'Database error: ' . $e->getMessage(), 500);
}
