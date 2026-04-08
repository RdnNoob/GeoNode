<?php
require_once dirname(__DIR__) . '/config.php';

requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

$body = getInput();
$sql = trim($body['query'] ?? '');

if (!$sql) {
    jsonResponse(['error' => 'Query SQL wajib diisi'], 400);
}

// Hanya izinkan SELECT untuk keamanan
$firstWord = strtoupper(strtok($sql, " \t\n"));
if (!in_array($firstWord, ['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN'])) {
    jsonResponse(['error' => 'Hanya query SELECT/SHOW yang diizinkan'], 403);
}

try {
    $pdo = getDB();
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll();
    $cols = array_keys($rows[0] ?? []);
    jsonResponse(['columns' => $cols, 'rows' => $rows, 'total' => count($rows)]);
} catch (PDOException $e) {
    jsonResponse(['error' => $e->getMessage()], 400);
}
