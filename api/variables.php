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

/** Returns all variables for a given environment, ordered by id. */
function getVariablesForEnvironment(PDO $db, int $environmentId): array
{
    $stmt = $db->prepare(
        'SELECT id, environment_id, var_key, var_value, created_at, updated_at
         FROM environment_variables
         WHERE environment_id = :environment_id
         ORDER BY id ASC'
    );
    $stmt->execute([':environment_id' => $environmentId]);
    return $stmt->fetchAll();
}

/** Validates that a var_key contains only alphanumeric characters and underscores. */
function isValidVarKey(string $key): bool
{
    return preg_match('/^[a-zA-Z0-9_]+$/', $key) === 1;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleGet(PDO $db): void
{
    if (!isset($_GET['environment_id'])) {
        jsonResponse(false, null, 'Query parameter "environment_id" is required.', 400);
        return;
    }

    $environmentId = (int) $_GET['environment_id'];

    // Verify the environment exists
    $stmt = $db->prepare('SELECT id FROM environments WHERE id = :id');
    $stmt->execute([':id' => $environmentId]);
    if (!$stmt->fetch()) {
        jsonResponse(false, null, 'Environment not found.', 404);
        return;
    }

    jsonResponse(true, getVariablesForEnvironment($db, $environmentId));
}

function handlePost(PDO $db): void
{
    $input         = json_decode(file_get_contents('php://input'), true) ?? [];
    $environmentId = isset($input['environment_id']) ? (int) $input['environment_id'] : null;
    $varKey        = trim($input['var_key'] ?? '');
    $varValue      = $input['var_value'] ?? null;

    if ($environmentId === null) {
        jsonResponse(false, null, '"environment_id" is required.', 400);
        return;
    }

    if ($varKey === '') {
        jsonResponse(false, null, '"var_key" is required.', 400);
        return;
    }

    if ($varValue === null) {
        jsonResponse(false, null, '"var_value" is required.', 400);
        return;
    }

    if (!isValidVarKey($varKey)) {
        jsonResponse(false, null, '"var_key" may only contain letters, numbers, and underscores.', 400);
        return;
    }

    // Verify the environment exists
    $stmt = $db->prepare('SELECT id FROM environments WHERE id = :id');
    $stmt->execute([':id' => $environmentId]);
    if (!$stmt->fetch()) {
        jsonResponse(false, null, 'Environment not found.', 404);
        return;
    }

    // Uniqueness check within this environment
    $stmt = $db->prepare(
        'SELECT id FROM environment_variables WHERE environment_id = :environment_id AND var_key = :var_key'
    );
    $stmt->execute([':environment_id' => $environmentId, ':var_key' => $varKey]);
    if ($stmt->fetch()) {
        jsonResponse(false, null, "Variable \"{$varKey}\" already exists in this environment.", 400);
        return;
    }

    $stmt = $db->prepare(
        'INSERT INTO environment_variables (environment_id, var_key, var_value) VALUES (:environment_id, :var_key, :var_value)'
    );
    $stmt->execute([
        ':environment_id' => $environmentId,
        ':var_key'        => $varKey,
        ':var_value'      => $varValue,
    ]);

    jsonResponse(true, getVariablesForEnvironment($db, $environmentId));
}

function handlePut(PDO $db, ?int $id): void
{
    if ($id === null) {
        jsonResponse(false, null, 'Query parameter "id" is required.', 400);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    $hasKey   = array_key_exists('var_key', $input);
    $hasValue = array_key_exists('var_value', $input);

    if (!$hasKey && !$hasValue) {
        jsonResponse(false, null, 'Nothing to update — provide "var_key" and/or "var_value".', 400);
        return;
    }

    // Fetch the existing variable (need environment_id for uniqueness check and response)
    $stmt = $db->prepare(
        'SELECT id, environment_id, var_key FROM environment_variables WHERE id = :id'
    );
    $stmt->execute([':id' => $id]);
    $existing = $stmt->fetch();

    if (!$existing) {
        jsonResponse(false, null, 'Variable not found.', 404);
        return;
    }

    if ($hasKey) {
        $newKey = trim($input['var_key']);

        if ($newKey === '') {
            jsonResponse(false, null, '"var_key" cannot be empty.', 400);
            return;
        }

        if (!isValidVarKey($newKey)) {
            jsonResponse(false, null, '"var_key" may only contain letters, numbers, and underscores.', 400);
            return;
        }

        // Uniqueness check — exclude the current row so renaming to same key is a no-op, not an error
        $stmt = $db->prepare(
            'SELECT id FROM environment_variables
             WHERE environment_id = :environment_id AND var_key = :var_key AND id != :id'
        );
        $stmt->execute([
            ':environment_id' => $existing['environment_id'],
            ':var_key'        => $newKey,
            ':id'             => $id,
        ]);
        if ($stmt->fetch()) {
            jsonResponse(false, null, "Variable \"{$newKey}\" already exists in this environment.", 400);
            return;
        }

        $stmt = $db->prepare('UPDATE environment_variables SET var_key = :var_key WHERE id = :id');
        $stmt->execute([':var_key' => $newKey, ':id' => $id]);
    }

    if ($hasValue) {
        $stmt = $db->prepare('UPDATE environment_variables SET var_value = :var_value WHERE id = :id');
        $stmt->execute([':var_value' => $input['var_value'], ':id' => $id]);
    }

    jsonResponse(true, getVariablesForEnvironment($db, $existing['environment_id']));
}

function handleDelete(PDO $db, ?int $id): void
{
    if ($id === null) {
        jsonResponse(false, null, 'Query parameter "id" is required.', 400);
        return;
    }

    // Fetch first so we know the environment_id for the response
    $stmt = $db->prepare('SELECT id, environment_id FROM environment_variables WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $existing = $stmt->fetch();

    if (!$existing) {
        jsonResponse(false, null, 'Variable not found.', 404);
        return;
    }

    $stmt = $db->prepare('DELETE FROM environment_variables WHERE id = :id');
    $stmt->execute([':id' => $id]);

    jsonResponse(true, getVariablesForEnvironment($db, $existing['environment_id']));
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
