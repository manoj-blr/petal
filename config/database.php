<?php

/**
 * Returns a singleton PDO connection.
 * Throws RuntimeException on failure — callers should catch and return a JSON error.
 */
function getDb(): PDO
{
    static $pdo = null;

    if ($pdo !== null) {
        return $pdo;
    }

    $configPath = __DIR__ . '/.env.php';

    if (!file_exists($configPath)) {
        throw new RuntimeException('Database config not found. Copy config/.env.php.example to config/.env.php and fill in your credentials.');
    }

    $config = require $configPath;

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $config['host'],
        $config['dbname'],
        $config['charset']
    );

    $pdo = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    return $pdo;
}
