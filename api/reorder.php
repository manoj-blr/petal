<?php

declare(strict_types=1);

header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';

function jsonResponse(bool $success, mixed $data = null, ?string $error = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['success' => $success, 'data' => $data, 'error' => $error]);
}

// ---------------------------------------------------------------------------
// POST /api/reorder.php
// Body: { "type": "requests"|"collections", "ids": [1, 5, 3, ...] }
// Sets sort_order = array index for each id in the list.
// ---------------------------------------------------------------------------

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, null, 'Method not allowed.', 405);
    return;
}

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $type  = $input['type'] ?? '';
    $ids   = $input['ids']  ?? [];

    if (!in_array($type, ['requests', 'collections'], true)) {
        jsonResponse(false, null, '"type" must be "requests" or "collections".', 400);
        return;
    }

    if (!is_array($ids) || count($ids) === 0) {
        jsonResponse(false, null, '"ids" must be a non-empty array.', 400);
        return;
    }

    // Sanitise: integers only
    $ids = array_map('intval', $ids);

    $table = $type === 'requests' ? 'saved_requests' : 'collections';

    $db = getDb();
    $db->beginTransaction();

    $stmt = $db->prepare("UPDATE {$table} SET sort_order = :order WHERE id = :id");

    foreach ($ids as $order => $id) {
        $stmt->execute([':order' => $order, ':id' => $id]);
    }

    $db->commit();

    jsonResponse(true, null);

} catch (PDOException $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    jsonResponse(false, null, 'Database error: ' . $e->getMessage(), 500);
} catch (RuntimeException $e) {
    jsonResponse(false, null, $e->getMessage(), 500);
}
