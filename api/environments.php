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

/** Returns all environments ordered by id. Used after every write to save a round-trip. */
function getAllEnvironments(PDO $db): array
{
    return $db->query(
        'SELECT id, name, is_active, created_at, updated_at FROM environments ORDER BY id ASC'
    )->fetchAll();
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleGet(PDO $db): void
{
    jsonResponse(true, getAllEnvironments($db));
}

function handlePost(PDO $db): void
{
    $input    = json_decode(file_get_contents('php://input'), true) ?? [];
    $name     = trim($input['name'] ?? '');
    $sourceId = isset($input['source_id']) ? (int) $input['source_id'] : null;

    if ($name === '') {
        jsonResponse(false, null, 'Name is required.', 400);
        return;
    }

    $db->beginTransaction();
    try {
        // Create the new environment
        $stmt = $db->prepare('INSERT INTO environments (name) VALUES (:name)');
        $stmt->execute([':name' => $name]);
        $newId = (int) $db->lastInsertId();

        // If duplicating, copy every variable from the source environment
        if ($sourceId !== null) {
            $rows = $db->prepare(
                'SELECT var_key, var_value FROM environment_variables WHERE environment_id = :src ORDER BY id ASC'
            );
            $rows->execute([':src' => $sourceId]);

            $ins = $db->prepare(
                'INSERT INTO environment_variables (environment_id, var_key, var_value) VALUES (:env, :key, :val)'
            );
            foreach ($rows->fetchAll() as $row) {
                $ins->execute([':env' => $newId, ':key' => $row['var_key'], ':val' => $row['var_value']]);
            }
        }

        $db->commit();
    } catch (PDOException $e) {
        $db->rollBack();
        throw $e;
    }

    jsonResponse(true, getAllEnvironments($db));
}

function handlePut(PDO $db, ?int $id): void
{
    if ($id === null) {
        jsonResponse(false, null, 'Query parameter "id" is required.', 400);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    $hasName   = array_key_exists('name', $input);
    $hasActive = array_key_exists('is_active', $input);

    if (!$hasName && !$hasActive) {
        jsonResponse(false, null, 'Nothing to update — provide "name" and/or "is_active".', 400);
        return;
    }

    // Validate name if provided
    if ($hasName) {
        $name = trim($input['name']);
        if ($name === '') {
            jsonResponse(false, null, 'Name cannot be empty.', 400);
            return;
        }
    }

    // Check environment exists
    $stmt = $db->prepare('SELECT id FROM environments WHERE id = :id');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        jsonResponse(false, null, 'Environment not found.', 404);
        return;
    }

    // Run both possible updates inside a single transaction
    $db->beginTransaction();
    try {
        if ($hasActive && (int) $input['is_active'] === 1) {
            // Deactivate all, then activate the target — guaranteed atomic
            $db->exec('UPDATE environments SET is_active = 0');
            $stmt = $db->prepare('UPDATE environments SET is_active = 1 WHERE id = :id');
            $stmt->execute([':id' => $id]);
        }

        if ($hasName) {
            $stmt = $db->prepare('UPDATE environments SET name = :name WHERE id = :id');
            $stmt->execute([':name' => $name, ':id' => $id]);
        }

        $db->commit();
    } catch (PDOException $e) {
        $db->rollBack();
        throw $e;
    }

    jsonResponse(true, getAllEnvironments($db));
}

function handleDelete(PDO $db, ?int $id): void
{
    if ($id === null) {
        jsonResponse(false, null, 'Query parameter "id" is required.', 400);
        return;
    }

    // Refuse to delete the last environment
    $total = (int) $db->query('SELECT COUNT(*) FROM environments')->fetchColumn();
    if ($total <= 1) {
        jsonResponse(false, null, 'Cannot delete the last remaining environment.', 400);
        return;
    }

    // Check it exists
    $stmt = $db->prepare('SELECT id FROM environments WHERE id = :id');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        jsonResponse(false, null, 'Environment not found.', 404);
        return;
    }

    $stmt = $db->prepare('DELETE FROM environments WHERE id = :id');
    $stmt->execute([':id' => $id]);

    jsonResponse(true, getAllEnvironments($db));
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
