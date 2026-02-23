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
 * Returns all collections with a request_count field, ordered by name.
 * Used after every write to save a round-trip.
 */
function getAllCollections(PDO $db): array
{
    return $db->query(
        'SELECT c.id, c.name, c.created_at, c.updated_at,
                COUNT(r.id) AS request_count
         FROM collections c
         LEFT JOIN saved_requests r ON r.collection_id = c.id
         GROUP BY c.id
         ORDER BY c.sort_order ASC, c.id ASC'
    )->fetchAll();
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleGet(PDO $db): void
{
    jsonResponse(true, getAllCollections($db));
}

function handlePost(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $name  = trim($input['name'] ?? '');

    if ($name === '') {
        jsonResponse(false, null, 'Name is required.', 400);
        return;
    }

    $stmt = $db->prepare('INSERT INTO collections (name) VALUES (:name)');
    $stmt->execute([':name' => $name]);

    jsonResponse(true, getAllCollections($db));
}

function handlePut(PDO $db, ?int $id): void
{
    if ($id === null) {
        jsonResponse(false, null, 'Query parameter "id" is required.', 400);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $name  = trim($input['name'] ?? '');

    if ($name === '') {
        jsonResponse(false, null, 'Name is required.', 400);
        return;
    }

    $stmt = $db->prepare('SELECT id FROM collections WHERE id = :id');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        jsonResponse(false, null, 'Collection not found.', 404);
        return;
    }

    $stmt = $db->prepare('UPDATE collections SET name = :name WHERE id = :id');
    $stmt->execute([':name' => $name, ':id' => $id]);

    jsonResponse(true, getAllCollections($db));
}

function handleDelete(PDO $db, ?int $id): void
{
    if ($id === null) {
        jsonResponse(false, null, 'Query parameter "id" is required.', 400);
        return;
    }

    $stmt = $db->prepare('SELECT id FROM collections WHERE id = :id');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        jsonResponse(false, null, 'Collection not found.', 404);
        return;
    }

    // FK ON DELETE SET NULL handles nullifying collection_id on saved_requests
    $stmt = $db->prepare('DELETE FROM collections WHERE id = :id');
    $stmt->execute([':id' => $id]);

    jsonResponse(true, getAllCollections($db));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

try {
    $db     = getDb();
    $method = $_SERVER['REQUEST_METHOD'];
    $id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

    match ($method) {
        'GET'    => handleGet($db),
        'POST'   => handlePost($db),
        'PUT'    => handlePut($db, $id),
        'DELETE' => handleDelete($db, $id),
        default  => jsonResponse(false, null, 'Method not allowed.', 405),
    };
} catch (RuntimeException $e) {
    jsonResponse(false, null, $e->getMessage(), 500);
} catch (PDOException $e) {
    jsonResponse(false, null, 'Database error: ' . $e->getMessage(), 500);
}
