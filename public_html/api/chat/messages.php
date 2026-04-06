<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $friendID = (int)($_GET['friend_id'] ?? 0);
    if (!$friendID) jsonResponse(['error' => 'friend_id diperlukan'], 400);

    $stmt = $pdo->prepare("SELECT id, from_user_id, to_user_id, encrypted_content, created_at
        FROM messages
        WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
        ORDER BY created_at ASC LIMIT 100");
    $stmt->execute([$userID, $friendID, $friendID, $userID]);
    $rows = $stmt->fetchAll();

    $result = array_map(function($r) use ($userID) {
        return [
            'id' => (int)$r['id'],
            'from_user_id' => (int)$r['from_user_id'],
            'to_user_id' => (int)$r['to_user_id'],
            'encrypted_content' => $r['encrypted_content'],
            'created_at' => $r['created_at'],
            'is_mine' => (int)$r['from_user_id'] === $userID,
        ];
    }, $rows);

    jsonResponse($result ?: []);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = getInput();
    $toUserID = (int)($body['to_user_id'] ?? 0);
    $content = $body['encrypted_content'] ?? '';

    if (!$toUserID || !$content) {
        jsonResponse(['error' => 'to_user_id dan encrypted_content wajib diisi'], 400);
    }

    $stmt = $pdo->prepare("INSERT INTO messages (from_user_id, to_user_id, encrypted_content) VALUES (?, ?, ?)");
    $stmt->execute([$userID, $toUserID, $content]);
    $msgID = (int)$pdo->lastInsertId();

    jsonResponse([
        'id' => $msgID,
        'from_user_id' => $userID,
        'to_user_id' => $toUserID,
        'encrypted_content' => $content,
        'is_mine' => true,
    ], 201);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
