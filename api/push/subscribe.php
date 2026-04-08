<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
$pdo = getDB();

$pdo->exec("CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(512) NOT NULL,
    auth VARCHAR(512) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_endpoint (endpoint(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = getInput();
    $endpoint = $body['endpoint'] ?? '';
    $p256dh = $body['p256dh'] ?? '';
    $auth = $body['auth'] ?? '';

    if (!$endpoint || !$p256dh || !$auth) {
        jsonResponse(['error' => 'endpoint, p256dh, dan auth wajib diisi'], 400);
    }

    $stmt = $pdo->prepare("SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?");
    $stmt->execute([$userID, $endpoint]);

    if ($stmt->fetch()) {
        $stmt = $pdo->prepare("UPDATE push_subscriptions SET p256dh = ?, auth = ?, created_at = NOW() WHERE user_id = ? AND endpoint = ?");
        $stmt->execute([$p256dh, $auth, $userID, $endpoint]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)");
        $stmt->execute([$userID, $endpoint, $p256dh, $auth]);
    }

    jsonResponse(['message' => 'Subscription berhasil disimpan']);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $body = getInput();
    $endpoint = $body['endpoint'] ?? '';

    if ($endpoint) {
        $stmt = $pdo->prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?");
        $stmt->execute([$userID, $endpoint]);
    } else {
        $stmt = $pdo->prepare("DELETE FROM push_subscriptions WHERE user_id = ?");
        $stmt->execute([$userID]);
    }

    jsonResponse(['message' => 'Subscription dihapus']);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
