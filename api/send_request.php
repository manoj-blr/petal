<?php

declare(strict_types=1);

header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_METHODS    = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const VALID_BODY_TYPES = ['none', 'json', 'form', 'raw'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(bool $success, mixed $data = null, ?string $error = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['success' => $success, 'data' => $data, 'error' => $error]);
}

/**
 * Replaces {{key}} tokens with values from $variables.
 * Unmatched tokens are intentionally left as-is.
 */
function substituteVariables(string $input, array $variables): string
{
    foreach ($variables as $key => $value) {
        $input = str_replace('{{' . $key . '}}', $value, $input);
    }
    return $input;
}

/**
 * Returns variable names that remain unresolved (still contain {{...}}) after substitution.
 */
function findUnresolvedVariables(string $input): array
{
    preg_match_all('/\{\{([^}]+)\}\}/', $input, $matches);
    return array_values(array_unique($matches[1]));
}

/**
 * Infers the response body type from the Content-Type header value.
 */
function detectResponseBodyType(string $contentType): string
{
    $ct = strtolower($contentType);
    if (str_contains($ct, 'json'))  return 'json';
    if (str_contains($ct, 'html'))  return 'html';
    if (str_contains($ct, 'xml'))   return 'xml';
    return 'text';
}

/**
 * Logs the request/response pair to request_history.
 * Errors here are swallowed — logging failure must never break the response.
 */
function logHistory(
    PDO      $db,
    string   $method,
    string   $url,
    array    $requestHeaders,
    ?string  $requestBody,
    ?int     $responseStatus,
    ?array   $responseHeaders,
    ?string  $responseBody,
    ?int     $responseSizeBytes,
    int      $durationMs,
    ?int     $environmentId
): void {
    try {
        $stmt = $db->prepare(
            'INSERT INTO request_history
             (method, url, request_headers, request_body, response_status, response_headers,
              response_body, response_size_bytes, duration_ms, environment_id)
             VALUES
             (:method, :url, :request_headers, :request_body, :response_status, :response_headers,
              :response_body, :response_size_bytes, :duration_ms, :environment_id)'
        );
        $stmt->execute([
            ':method'              => $method,
            ':url'                 => $url,
            ':request_headers'     => !empty($requestHeaders) ? json_encode($requestHeaders) : null,
            ':request_body'        => $requestBody,
            ':response_status'     => $responseStatus,
            ':response_headers'    => $responseHeaders !== null ? json_encode($responseHeaders) : null,
            ':response_body'       => $responseBody,
            ':response_size_bytes' => $responseSizeBytes,
            ':duration_ms'         => $durationMs,
            ':environment_id'      => $environmentId,
        ]);
    } catch (PDOException) {
        // Intentionally silent — history logging is best-effort
    }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

function handlePost(PDO $db): void
{
    $input         = json_decode(file_get_contents('php://input'), true) ?? [];
    $method        = strtoupper(trim($input['method'] ?? ''));
    $url           = trim($input['url'] ?? '');
    $headers       = is_array($input['headers'] ?? null) ? $input['headers'] : [];
    $body          = isset($input['body']) ? (string) $input['body'] : null;
    $bodyType      = $input['body_type'] ?? 'none';
    $environmentId = isset($input['environment_id']) ? (int) $input['environment_id'] : null;
    $verifySsl     = isset($input['verify_ssl']) ? (bool) $input['verify_ssl'] : true;
    $timeoutSec    = isset($input['timeout_sec']) ? max(1, min(300, (int) $input['timeout_sec'])) : 30;

    // --- Validate ---
    if ($method === '') {
        jsonResponse(false, null, '"method" is required.', 400);
        return;
    }
    if (!in_array($method, VALID_METHODS, true)) {
        jsonResponse(false, null, '"method" must be one of: ' . implode(', ', VALID_METHODS) . '.', 400);
        return;
    }
    if ($url === '') {
        jsonResponse(false, null, '"url" is required.', 400);
        return;
    }
    if (!in_array($bodyType, VALID_BODY_TYPES, true)) {
        jsonResponse(false, null, '"body_type" must be one of: ' . implode(', ', VALID_BODY_TYPES) . '.', 400);
        return;
    }

    // --- Load environment variables ---
    $variables = [];
    if ($environmentId !== null) {
        $stmt = $db->prepare(
            'SELECT var_key, var_value FROM environment_variables WHERE environment_id = :id'
        );
        $stmt->execute([':id' => $environmentId]);
        foreach ($stmt->fetchAll() as $row) {
            $variables[$row['var_key']] = $row['var_value'];
        }
    }

    // --- Substitute {{variables}} ---
    $resolvedUrl  = substituteVariables($url, $variables);
    $resolvedBody = $body !== null ? substituteVariables($body, $variables) : null;

    $resolvedHeaders = [];
    foreach ($headers as $key => $value) {
        $resolvedHeaders[(string) $key] = substituteVariables((string) $value, $variables);
    }

    // Collect all unresolved {{tokens}} across url, headers, body
    $unresolved = findUnresolvedVariables($resolvedUrl);
    foreach ($resolvedHeaders as $value) {
        $unresolved = array_merge($unresolved, findUnresolvedVariables($value));
    }
    if ($resolvedBody !== null) {
        $unresolved = array_merge($unresolved, findUnresolvedVariables($resolvedBody));
    }
    $unresolvedVariables = array_values(array_unique($unresolved));

    // --- Build cURL request ---
    $responseHeadersRaw = [];
    $statusLine         = '';

    $ch = curl_init();

    // Capture each response header line as it arrives
    curl_setopt($ch, CURLOPT_HEADERFUNCTION,
        function ($ch, $line) use (&$responseHeadersRaw, &$statusLine): int {
            $trimmed = trim($line);
            if (str_starts_with($trimmed, 'HTTP/')) {
                $statusLine = $trimmed;         // e.g. "HTTP/2 200 OK" — reset on redirect
            } elseif (str_contains($trimmed, ':')) {
                [$name, $value]          = explode(':', $trimmed, 2);
                $responseHeadersRaw[trim($name)] = trim($value);
            }
            return strlen($line);
        }
    );

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeoutSec,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_SSL_VERIFYPEER => $verifySsl,
        CURLOPT_SSL_VERIFYHOST => $verifySsl ? 2 : 0,
        CURLOPT_USERAGENT      => 'Petal/1.0',
    ]);

    // HEAD needs CURLOPT_NOBODY to avoid hanging on the missing body
    if ($method === 'HEAD') {
        curl_setopt($ch, CURLOPT_NOBODY, true);
        curl_setopt($ch, CURLOPT_URL, $resolvedUrl);
    } else {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_URL, $resolvedUrl);
    }

    // Build header list for cURL, auto-injecting Content-Type if the user didn't set it
    $curlHeaders = [];
    $headerKeys  = array_map('strtolower', array_keys($resolvedHeaders));

    if ($bodyType === 'json' && !in_array('content-type', $headerKeys, true)) {
        $curlHeaders[] = 'Content-Type: application/json';
    }
    if ($bodyType === 'form' && !in_array('content-type', $headerKeys, true)) {
        $curlHeaders[] = 'Content-Type: application/x-www-form-urlencoded';
    }
    foreach ($resolvedHeaders as $name => $value) {
        $curlHeaders[] = "{$name}: {$value}";
    }
    if (!empty($curlHeaders)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $curlHeaders);
    }

    // Attach body (only for methods that carry one)
    $bodyMethods = ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
    if ($resolvedBody !== null && $bodyType !== 'none' && in_array($method, $bodyMethods, true)) {
        if ($bodyType === 'form') {
            // Frontend may send form pairs as a JSON object; fall back to raw string if not
            $decoded  = json_decode($resolvedBody, true);
            $postBody = is_array($decoded) ? http_build_query($decoded) : $resolvedBody;
        } else {
            $postBody = $resolvedBody;
        }
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postBody);
    }

    // --- Fire ---
    $startTime    = microtime(true);
    $responseBody = curl_exec($ch);
    $durationMs   = (int) round((microtime(true) - $startTime) * 1000);

    if ($responseBody === false) {
        $curlError = curl_error($ch);
        curl_close($ch);

        logHistory($db, $method, $resolvedUrl, $resolvedHeaders, $resolvedBody,
                   null, null, null, null, $durationMs, $environmentId);

        jsonResponse(false, null, 'Request failed: ' . $curlError, 502);
        return;
    }

    $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $sizeBytes  = (int) curl_getinfo($ch, CURLINFO_SIZE_DOWNLOAD);
    curl_close($ch);

    // Truncate very large bodies to prevent browser lockup — log the real size
    $truncated = false;
    $sizeLimit = 5 * 1024 * 1024; // 5 MB
    if (strlen($responseBody) > $sizeLimit) {
        $responseBody = substr($responseBody, 0, $sizeLimit);
        $truncated    = true;
    }

    // Extract status text from the final status line (handles redirects — last line wins)
    $statusText = '';
    if (preg_match('/^HTTP\/\S+\s+\d+\s+(.+)$/', $statusLine, $m)) {
        $statusText = trim($m[1]);
    }

    // Case-insensitive Content-Type lookup — HTTP/2 uses lowercase header names
    $contentTypeHeader = '';
    foreach ($responseHeadersRaw as $hName => $hValue) {
        if (strtolower($hName) === 'content-type') {
            $contentTypeHeader = $hValue;
            break;
        }
    }
    $responseBodyType = detectResponseBodyType($contentTypeHeader);

    // --- Log to history ---
    logHistory(
        $db, $method, $resolvedUrl, $resolvedHeaders, $resolvedBody,
        $statusCode, $responseHeadersRaw, $responseBody ?: null, $sizeBytes, $durationMs, $environmentId
    );

    // --- Return ---
    jsonResponse(true, [
        'method'               => $method,
        'final_url'            => $resolvedUrl,
        'status'               => $statusCode,
        'status_text'          => $statusText,
        'duration_ms'          => $durationMs,
        'size_bytes'           => $sizeBytes,
        'headers'              => $responseHeadersRaw,
        'body'                 => $responseBody ?: '',
        'body_type'            => $responseBodyType,
        'truncated'            => $truncated,
        'unresolved_variables' => $unresolvedVariables,
    ]);
}

// ---------------------------------------------------------------------------
// Router — POST only
// ---------------------------------------------------------------------------

try {
    $db = getDb();

    match ($_SERVER['REQUEST_METHOD']) {
        'POST'  => handlePost($db),
        default => jsonResponse(false, null, 'Method not allowed. Use POST.', 405),
    };
} catch (RuntimeException $e) {
    jsonResponse(false, null, $e->getMessage(), 500);
} catch (PDOException $e) {
    jsonResponse(false, null, 'Database error: ' . $e->getMessage(), 500);
}
