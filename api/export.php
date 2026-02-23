<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendError(string $message, int $status = 400): void
{
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode(['success' => false, 'data' => null, 'error' => $message]);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

$collectionId = isset($_GET['collection_id']) ? (int) $_GET['collection_id'] : null;
$format       = $_GET['format'] ?? 'petal';

if (!$collectionId) {
    sendError('"collection_id" is required.');
    exit;
}

if (!in_array($format, ['petal', 'postman'], true)) {
    sendError('"format" must be "petal" or "postman".');
    exit;
}

try {
    $db = getDb();

    // Fetch collection
    $stmt = $db->prepare('SELECT id, name FROM collections WHERE id = :id');
    $stmt->execute([':id' => $collectionId]);
    $collection = $stmt->fetch();

    if (!$collection) {
        sendError('Collection not found.', 404);
        exit;
    }

    // Fetch all requests in this collection
    $stmt = $db->prepare(
        'SELECT name, method, url, headers, body, body_type, params, auth, notes, verify_ssl, timeout_sec
         FROM saved_requests WHERE collection_id = :cid ORDER BY id ASC'
    );
    $stmt->execute([':cid' => $collectionId]);
    $requests = $stmt->fetchAll();

    // Decode JSON-stored fields
    foreach ($requests as &$r) {
        $r['headers'] = $r['headers'] !== null ? json_decode($r['headers'], true) : null;
        $r['params']  = $r['params']  !== null ? json_decode($r['params'],  true) : null;
        $r['auth']    = $r['auth']    !== null ? json_decode($r['auth'],    true) : null;
    }
    unset($r);

    $safeFilename = preg_replace('/[^a-zA-Z0-9_-]/', '_', $collection['name']);

    if ($format === 'petal') {
        $export   = buildPetalExport($collection, $requests);
        $filename = $safeFilename . '.petal.json';
    } else {
        $export   = buildPostmanExport($collection, $requests);
        $filename = $safeFilename . '.postman_collection.json';
    }

    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    echo json_encode($export, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

} catch (RuntimeException | PDOException $e) {
    sendError($e->getMessage(), 500);
}

// ---------------------------------------------------------------------------
// Petal native format
// ---------------------------------------------------------------------------

function buildPetalExport(array $collection, array $requests): array
{
    return [
        'petal_version' => 1,
        'exported_at'   => date('c'),
        'collection'    => ['name' => $collection['name']],
        'requests'      => array_values($requests),
    ];
}

// ---------------------------------------------------------------------------
// Postman v2.1 format
// ---------------------------------------------------------------------------

function buildPostmanExport(array $collection, array $requests): array
{
    return [
        'info' => [
            'name'        => $collection['name'],
            '_postman_id' => generateUuid(),
            'schema'      => 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
            'description' => 'Exported from Petal',
        ],
        'item' => array_map('buildPostmanItem', $requests),
    ];
}

function buildPostmanItem(array $r): array
{
    $headers = [];
    foreach ($r['headers'] ?? [] as $h) {
        if (!empty($h['key'])) {
            $headers[] = [
                'key'      => $h['key'],
                'value'    => $h['value'] ?? '',
                'type'     => 'text',
                'disabled' => !($h['enabled'] ?? true),
            ];
        }
    }

    $item = [
        'name'    => $r['name'],
        'request' => [
            'method'      => $r['method'],
            'header'      => $headers,
            'url'         => buildPostmanUrl($r['url'] ?? '', $r['params'] ?? []),
            'description' => $r['notes'] ?? '',
        ],
    ];

    $body = buildPostmanBody($r['body_type'] ?? 'none', $r['body'] ?? null);
    if ($body !== null) {
        $item['request']['body'] = $body;
    }

    $auth = buildPostmanAuth($r['auth'] ?? null);
    $item['request']['auth'] = $auth;

    return $item;
}

function buildPostmanUrl(string $rawUrl, array $params): array
{
    $query = [];
    foreach ($params as $p) {
        if (!empty($p['key'])) {
            $query[] = [
                'key'      => $p['key'],
                'value'    => $p['value'] ?? '',
                'disabled' => !($p['enabled'] ?? true),
            ];
        }
    }

    $url = ['raw' => $rawUrl];
    if (!empty($query)) {
        $url['query'] = $query;
    }
    return $url;
}

function buildPostmanBody(?string $bodyType, ?string $body): ?array
{
    if ($bodyType === 'none' || $body === null) return null;

    if ($bodyType === 'json') {
        return [
            'mode'    => 'raw',
            'raw'     => $body,
            'options' => ['raw' => ['language' => 'json']],
        ];
    }

    if ($bodyType === 'raw') {
        return ['mode' => 'raw', 'raw' => $body];
    }

    if ($bodyType === 'form') {
        // Petal stores form as JSON array [{key, value, enabled}]
        $rows       = json_decode($body, true) ?? [];
        $urlencoded = [];
        foreach ($rows as $row) {
            if (!empty($row['key'])) {
                $urlencoded[] = [
                    'key'      => $row['key'],
                    'value'    => $row['value'] ?? '',
                    'disabled' => !($row['enabled'] ?? true),
                ];
            }
        }
        return ['mode' => 'urlencoded', 'urlencoded' => $urlencoded];
    }

    return null;
}

function buildPostmanAuth(?array $auth): array
{
    $type = $auth['type'] ?? 'none';

    if (!$auth || $type === 'none') return ['type' => 'noauth'];

    if ($type === 'bearer') {
        return [
            'type'   => 'bearer',
            'bearer' => [['key' => 'token', 'value' => $auth['token'] ?? '', 'type' => 'string']],
        ];
    }

    if ($type === 'basic') {
        return [
            'type'  => 'basic',
            'basic' => [
                ['key' => 'username', 'value' => $auth['user'] ?? '', 'type' => 'string'],
                ['key' => 'password', 'value' => $auth['pass'] ?? '', 'type' => 'string'],
            ],
        ];
    }

    if ($type === 'apikey') {
        return [
            'type'   => 'apikey',
            'apikey' => [
                ['key' => 'key',   'value' => $auth['key']   ?? '',      'type' => 'string'],
                ['key' => 'value', 'value' => $auth['value'] ?? '',      'type' => 'string'],
                ['key' => 'in',    'value' => $auth['in']    ?? 'header','type' => 'string'],
            ],
        ];
    }

    return ['type' => 'noauth'];
}

function generateUuid(): string
{
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}
