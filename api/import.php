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

// ---------------------------------------------------------------------------
// Router — POST only
// ---------------------------------------------------------------------------

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(false, null, 'Method not allowed.', 405);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$data  = $input['data'] ?? null;

if (!$data || !is_array($data)) {
    jsonResponse(false, null, '"data" (parsed JSON object) is required.', 400);
    exit;
}

$format = detectFormat($data);

if (!$format) {
    jsonResponse(false, null, 'Unrecognised format. Expected a Petal v1 export or a Postman v2.1 collection.', 400);
    exit;
}

try {
    $db     = getDb();
    $result = ($format === 'petal') ? importPetal($db, $data) : importPostman($db, $data);
    jsonResponse(true, $result);
} catch (RuntimeException | PDOException $e) {
    jsonResponse(false, null, $e->getMessage(), 500);
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

function detectFormat(array $data): ?string
{
    if (isset($data['petal_version'])) return 'petal';
    if (isset($data['info']['schema']) && str_contains((string) $data['info']['schema'], 'getpostman.com')) return 'postman';
    return null;
}

// ---------------------------------------------------------------------------
// Petal import
// ---------------------------------------------------------------------------

function importPetal(PDO $db, array $data): array
{
    $collName = trim($data['collection']['name'] ?? 'Imported Collection');
    if ($collName === '') $collName = 'Imported Collection';

    $requests = is_array($data['requests'] ?? null) ? $data['requests'] : [];

    $db->beginTransaction();
    try {
        $stmt = $db->prepare('INSERT INTO collections (name) VALUES (:name)');
        $stmt->execute([':name' => $collName]);
        $collId = (int) $db->lastInsertId();

        $count = 0;
        foreach ($requests as $r) {
            insertRequest($db, $r, $collId);
            $count++;
        }

        $db->commit();
    } catch (PDOException $e) {
        $db->rollBack();
        throw $e;
    }

    return ['collection_id' => $collId, 'collection_name' => $collName, 'request_count' => $count];
}

// ---------------------------------------------------------------------------
// Postman v2.1 import
// ---------------------------------------------------------------------------

function importPostman(PDO $db, array $data): array
{
    $collName = trim($data['info']['name'] ?? 'Imported Collection');
    if ($collName === '') $collName = 'Imported Collection';

    $db->beginTransaction();
    try {
        $stmt = $db->prepare('INSERT INTO collections (name) VALUES (:name)');
        $stmt->execute([':name' => $collName]);
        $collId = (int) $db->lastInsertId();

        $count = insertPostmanItems($db, $data['item'] ?? [], $collId);

        $db->commit();
    } catch (PDOException $e) {
        $db->rollBack();
        throw $e;
    }

    return ['collection_id' => $collId, 'collection_name' => $collName, 'request_count' => $count];
}

/** Recursively processes items, flattening any folder nesting. */
function insertPostmanItems(PDO $db, array $items, int $collId): int
{
    $count = 0;
    foreach ($items as $item) {
        // Folder — recurse into its children
        if (isset($item['item']) && is_array($item['item'])) {
            $count += insertPostmanItems($db, $item['item'], $collId);
            continue;
        }
        // Leaf request
        if (isset($item['request'])) {
            insertRequest($db, parsePostmanItem($item), $collId);
            $count++;
        }
    }
    return $count;
}

function parsePostmanItem(array $item): array
{
    $req = $item['request'] ?? [];

    $method = strtoupper($req['method'] ?? 'GET');
    if (!in_array($method, ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'], true)) {
        $method = 'GET';
    }

    // URL — can be a plain string or an object
    $urlData = $req['url'] ?? '';
    if (is_array($urlData)) {
        $rawUrl = $urlData['raw'] ?? '';
        $params = [];
        foreach ($urlData['query'] ?? [] as $q) {
            if (isset($q['key']) && $q['key'] !== '') {
                $params[] = [
                    'key'     => $q['key'],
                    'value'   => $q['value'] ?? '',
                    'enabled' => !($q['disabled'] ?? false),
                ];
            }
        }
        // Strip query string from raw URL if we parsed params from url.query
        if (!empty($params)) {
            $rawUrl = strtok($rawUrl, '?') ?: $rawUrl;
        }
    } else {
        $rawUrl = (string) $urlData;
        $params = [];
    }

    // Headers
    $headers = [];
    foreach ($req['header'] ?? [] as $h) {
        if (isset($h['key']) && $h['key'] !== '') {
            $headers[] = [
                'key'     => $h['key'],
                'value'   => $h['value'] ?? '',
                'enabled' => !($h['disabled'] ?? false),
            ];
        }
    }

    // Body
    [$body, $bodyType] = parsePostmanBody($req['body'] ?? null);

    // Auth
    $auth = parsePostmanAuth($req['auth'] ?? null);

    // Notes (description can be string or object)
    $desc  = $req['description'] ?? null;
    $notes = is_string($desc) ? $desc : ($desc['content'] ?? null);

    return [
        'name'        => $item['name'] ?? 'Imported Request',
        'method'      => $method,
        'url'         => $rawUrl,
        'params'      => !empty($params)  ? $params  : null,
        'headers'     => !empty($headers) ? $headers : null,
        'body'        => $body,
        'body_type'   => $bodyType,
        'auth'        => $auth,
        'notes'       => ($notes !== '' && $notes !== null) ? $notes : null,
        'verify_ssl'  => 1,
        'timeout_sec' => 30,
    ];
}

function parsePostmanBody(?array $bodyData): array
{
    if (!$bodyData || !isset($bodyData['mode'])) return [null, 'none'];

    $mode = $bodyData['mode'];

    if ($mode === 'raw') {
        $raw  = $bodyData['raw'] ?? '';
        $lang = $bodyData['options']['raw']['language'] ?? 'text';
        return [$raw, $lang === 'json' ? 'json' : 'raw'];
    }

    if ($mode === 'urlencoded' || $mode === 'formdata') {
        $key  = $mode === 'urlencoded' ? 'urlencoded' : 'formdata';
        $rows = [];
        foreach ($bodyData[$key] ?? [] as $f) {
            // Skip file fields in formdata
            if (isset($f['type']) && $f['type'] === 'file') continue;
            if (isset($f['key']) && $f['key'] !== '') {
                $rows[] = [
                    'key'     => $f['key'],
                    'value'   => $f['value'] ?? '',
                    'enabled' => !($f['disabled'] ?? false),
                ];
            }
        }
        return [json_encode($rows), 'form'];
    }

    return [null, 'none'];
}

function parsePostmanAuth(?array $auth): ?array
{
    if (!$auth) return null;

    $type = $auth['type'] ?? 'noauth';
    if ($type === 'noauth') return ['type' => 'none'];

    // Postman stores auth params as [{key, value}] arrays
    $get = function (array $items, string $key): string {
        foreach ($items as $item) {
            if (($item['key'] ?? '') === $key) return (string) ($item['value'] ?? '');
        }
        return '';
    };

    if ($type === 'bearer') {
        return ['type' => 'bearer', 'token' => $get($auth['bearer'] ?? [], 'token')];
    }

    if ($type === 'basic') {
        return [
            'type' => 'basic',
            'user' => $get($auth['basic'] ?? [], 'username'),
            'pass' => $get($auth['basic'] ?? [], 'password'),
        ];
    }

    if ($type === 'apikey') {
        return [
            'type'  => 'apikey',
            'key'   => $get($auth['apikey'] ?? [], 'key'),
            'value' => $get($auth['apikey'] ?? [], 'value'),
            'in'    => $get($auth['apikey'] ?? [], 'in') ?: 'header',
        ];
    }

    return ['type' => 'none'];
}

// ---------------------------------------------------------------------------
// Shared insert
// ---------------------------------------------------------------------------

function insertRequest(PDO $db, array $r, int $collectionId): void
{
    $validMethods   = ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
    $validBodyTypes = ['none','json','form','raw'];

    $method   = in_array(strtoupper($r['method'] ?? ''), $validMethods, true)
                    ? strtoupper($r['method']) : 'GET';
    $bodyType = in_array($r['body_type'] ?? '', $validBodyTypes, true)
                    ? $r['body_type'] : 'none';

    $stmt = $db->prepare(
        'INSERT INTO saved_requests
            (collection_id, name, method, url, headers, body, body_type, params, auth, notes, verify_ssl, timeout_sec)
         VALUES
            (:collection_id, :name, :method, :url, :headers, :body, :body_type, :params, :auth, :notes, :verify_ssl, :timeout_sec)'
    );

    $stmt->execute([
        ':collection_id' => $collectionId,
        ':name'          => substr(trim($r['name'] ?? 'Imported Request'), 0, 255) ?: 'Imported Request',
        ':method'        => $method,
        ':url'           => $r['url'] ?? '',
        ':headers'       => !empty($r['headers']) ? json_encode($r['headers']) : null,
        ':body'          => $r['body'] ?? null,
        ':body_type'     => $bodyType,
        ':params'        => !empty($r['params'])  ? json_encode($r['params'])  : null,
        ':auth'          => !empty($r['auth'])    ? json_encode($r['auth'])    : null,
        ':notes'         => $r['notes'] ?? null,
        ':verify_ssl'    => (int) ($r['verify_ssl'] ?? 1),
        ':timeout_sec'   => max(1, min(300, (int) ($r['timeout_sec'] ?? 30))),
    ]);
}
