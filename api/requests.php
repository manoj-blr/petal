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

const VALID_METHODS   = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const VALID_BODY_TYPES = ['none', 'json', 'form', 'raw'];

/**
 * Decodes the JSON-stored fields (headers, params) back to arrays so the
 * frontend always receives proper objects, never raw JSON strings.
 */
function decodeRequest(array $row): array
{
    $row['headers'] = $row['headers'] !== null ? json_decode($row['headers'], true) : null;
    $row['params']  = $row['params']  !== null ? json_decode($row['params'],  true) : null;
    $row['auth']    = $row['auth']    !== null ? json_decode($row['auth'],    true) : null;
    return $row;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleGet(PDO $db, ?int $id): void
{
    // Single request by id
    if ($id !== null) {
        $stmt = $db->prepare(
            'SELECT id, collection_id, name, method, url, headers, body, body_type, params, auth, notes, verify_ssl, timeout_sec, created_at, updated_at
             FROM saved_requests WHERE id = :id'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        if (!$row) {
            jsonResponse(false, null, 'Request not found.', 404);
            return;
        }

        jsonResponse(true, decodeRequest($row));
        return;
    }

    // List — optionally filtered by collection_id
    if (isset($_GET['collection_id'])) {
        $collectionId = (int) $_GET['collection_id'];
        $stmt = $db->prepare(
            'SELECT id, collection_id, name, method, url, headers, body, body_type, params, auth, notes, verify_ssl, timeout_sec, created_at, updated_at
             FROM saved_requests WHERE collection_id = :collection_id ORDER BY name ASC'
        );
        $stmt->execute([':collection_id' => $collectionId]);
    } else {
        $stmt = $db->query(
            'SELECT id, collection_id, name, method, url, headers, body, body_type, params, auth, notes, verify_ssl, timeout_sec, created_at, updated_at
             FROM saved_requests ORDER BY name ASC'
        );
    }

    $rows = array_map('decodeRequest', $stmt->fetchAll());
    jsonResponse(true, $rows);
}

function handlePost(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    $name     = trim($input['name'] ?? '');
    $method   = strtoupper(trim($input['method'] ?? ''));
    $url      = trim($input['url'] ?? '');
    $bodyType = $input['body_type'] ?? 'none';

    if ($name === '') {
        jsonResponse(false, null, '"name" is required.', 400);
        return;
    }

    if ($url === '') {
        jsonResponse(false, null, '"url" is required.', 400);
        return;
    }

    if (!in_array($method, VALID_METHODS, true)) {
        jsonResponse(false, null, '"method" must be one of: ' . implode(', ', VALID_METHODS) . '.', 400);
        return;
    }

    if (!in_array($bodyType, VALID_BODY_TYPES, true)) {
        jsonResponse(false, null, '"body_type" must be one of: ' . implode(', ', VALID_BODY_TYPES) . '.', 400);
        return;
    }

    $collectionId = isset($input['collection_id']) ? (int) $input['collection_id'] : null;
    $headers      = isset($input['headers']) ? json_encode($input['headers']) : null;
    $params       = isset($input['params'])  ? json_encode($input['params'])  : null;
    $body         = $input['body'] ?? null;
    $auth         = isset($input['auth'])    ? json_encode($input['auth'])    : null;
    $notes        = isset($input['notes'])   ? (string) $input['notes']       : null;
    $verifySsl    = isset($input['verify_ssl']) ? (int)(bool)$input['verify_ssl'] : 1;
    $timeoutSec   = isset($input['timeout_sec']) ? max(1, min(300, (int)$input['timeout_sec'])) : 30;

    // Verify collection exists if provided
    if ($collectionId !== null) {
        $stmt = $db->prepare('SELECT id FROM collections WHERE id = :id');
        $stmt->execute([':id' => $collectionId]);
        if (!$stmt->fetch()) {
            jsonResponse(false, null, 'Collection not found.', 404);
            return;
        }
    }

    $stmt = $db->prepare(
        'INSERT INTO saved_requests (collection_id, name, method, url, headers, body, body_type, params, auth, notes, verify_ssl, timeout_sec)
         VALUES (:collection_id, :name, :method, :url, :headers, :body, :body_type, :params, :auth, :notes, :verify_ssl, :timeout_sec)'
    );
    $stmt->execute([
        ':collection_id' => $collectionId,
        ':name'          => $name,
        ':method'        => $method,
        ':url'           => $url,
        ':headers'       => $headers,
        ':body'          => $body,
        ':body_type'     => $bodyType,
        ':params'        => $params,
        ':auth'          => $auth,
        ':notes'         => $notes,
        ':verify_ssl'    => $verifySsl,
        ':timeout_sec'   => $timeoutSec,
    ]);

    $newId = (int) $db->lastInsertId();

    // Return the newly created request (decoded)
    $stmt = $db->prepare(
        'SELECT id, collection_id, name, method, url, headers, body, body_type, params, auth, notes, verify_ssl, timeout_sec, created_at, updated_at
         FROM saved_requests WHERE id = :id'
    );
    $stmt->execute([':id' => $newId]);
    jsonResponse(true, decodeRequest($stmt->fetch()), null, 201);
}

function handlePut(PDO $db, ?int $id): void
{
    if ($id === null) {
        jsonResponse(false, null, 'Query parameter "id" is required.', 400);
        return;
    }

    // Check request exists
    $stmt = $db->prepare('SELECT id FROM saved_requests WHERE id = :id');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        jsonResponse(false, null, 'Request not found.', 404);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    // Build SET clause dynamically — only update fields that are provided
    $fields = [];
    $params = [':id' => $id];

    if (array_key_exists('name', $input)) {
        $name = trim($input['name']);
        if ($name === '') {
            jsonResponse(false, null, '"name" cannot be empty.', 400);
            return;
        }
        $fields[] = 'name = :name';
        $params[':name'] = $name;
    }

    if (array_key_exists('method', $input)) {
        $method = strtoupper(trim($input['method']));
        if (!in_array($method, VALID_METHODS, true)) {
            jsonResponse(false, null, '"method" must be one of: ' . implode(', ', VALID_METHODS) . '.', 400);
            return;
        }
        $fields[] = 'method = :method';
        $params[':method'] = $method;
    }

    if (array_key_exists('url', $input)) {
        $url = trim($input['url']);
        if ($url === '') {
            jsonResponse(false, null, '"url" cannot be empty.', 400);
            return;
        }
        $fields[] = 'url = :url';
        $params[':url'] = $url;
    }

    if (array_key_exists('body_type', $input)) {
        $bodyType = $input['body_type'];
        if (!in_array($bodyType, VALID_BODY_TYPES, true)) {
            jsonResponse(false, null, '"body_type" must be one of: ' . implode(', ', VALID_BODY_TYPES) . '.', 400);
            return;
        }
        $fields[] = 'body_type = :body_type';
        $params[':body_type'] = $bodyType;
    }

    if (array_key_exists('body', $input)) {
        $fields[] = 'body = :body';
        $params[':body'] = $input['body'];
    }

    if (array_key_exists('headers', $input)) {
        $fields[] = 'headers = :headers';
        $params[':headers'] = $input['headers'] !== null ? json_encode($input['headers']) : null;
    }

    if (array_key_exists('params', $input)) {
        $fields[] = 'params = :params';
        $params[':params'] = $input['params'] !== null ? json_encode($input['params']) : null;
    }

    if (array_key_exists('auth', $input)) {
        $fields[] = 'auth = :auth';
        $params[':auth'] = $input['auth'] !== null ? json_encode($input['auth']) : null;
    }

    if (array_key_exists('notes', $input)) {
        $fields[] = 'notes = :notes';
        $params[':notes'] = $input['notes'] !== null ? (string) $input['notes'] : null;
    }

    if (array_key_exists('verify_ssl', $input)) {
        $fields[] = 'verify_ssl = :verify_ssl';
        $params[':verify_ssl'] = (int)(bool)$input['verify_ssl'];
    }

    if (array_key_exists('timeout_sec', $input)) {
        $fields[] = 'timeout_sec = :timeout_sec';
        $params[':timeout_sec'] = max(1, min(300, (int)$input['timeout_sec']));
    }

    if (array_key_exists('collection_id', $input)) {
        $collectionId = $input['collection_id'] !== null ? (int) $input['collection_id'] : null;

        if ($collectionId !== null) {
            $stmt = $db->prepare('SELECT id FROM collections WHERE id = :id');
            $stmt->execute([':id' => $collectionId]);
            if (!$stmt->fetch()) {
                jsonResponse(false, null, 'Collection not found.', 404);
                return;
            }
        }

        $fields[] = 'collection_id = :collection_id';
        $params[':collection_id'] = $collectionId;
    }

    if (empty($fields)) {
        jsonResponse(false, null, 'Nothing to update — no recognised fields provided.', 400);
        return;
    }

    $sql = 'UPDATE saved_requests SET ' . implode(', ', $fields) . ' WHERE id = :id';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    // Return the updated request
    $stmt = $db->prepare(
        'SELECT id, collection_id, name, method, url, headers, body, body_type, params, auth, notes, verify_ssl, timeout_sec, created_at, updated_at
         FROM saved_requests WHERE id = :id'
    );
    $stmt->execute([':id' => $id]);
    jsonResponse(true, decodeRequest($stmt->fetch()));
}

function handleDelete(PDO $db, ?int $id): void
{
    if ($id === null) {
        jsonResponse(false, null, 'Query parameter "id" is required.', 400);
        return;
    }

    $stmt = $db->prepare('SELECT id FROM saved_requests WHERE id = :id');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        jsonResponse(false, null, 'Request not found.', 404);
        return;
    }

    $stmt = $db->prepare('DELETE FROM saved_requests WHERE id = :id');
    $stmt->execute([':id' => $id]);

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
