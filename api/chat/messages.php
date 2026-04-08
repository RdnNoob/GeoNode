<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';
require_once dirname(__DIR__) . '/push/send.php';

$userID = requireAuth();
$pdo = getDB();

// Auto-hapus pesan lebih dari 30 hari
try {
    $pdo->exec("DELETE FROM messages WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)");
} catch (Exception $e) {}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $friendID = (int)($_GET['friend_id'] ?? 0);
    if (!$friendID) jsonResponse(['error' => 'friend_id diperlukan'], 400);

    $afterID = (int)($_GET['after_id'] ?? 0);
    $sql = "SELECT id, from_user_id, to_user_id, encrypted_content, created_at
        FROM messages
        WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))";
    $params = [$userID, $friendID, $friendID, $userID];
    if ($afterID > 0) {
        $sql .= " AND id > ?";
        $params[] = $afterID;
    }
    $sql .= " ORDER BY created_at ASC LIMIT 100";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
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
    $action = $body['action'] ?? 'send';

    // Hapus pesan via POST (menggantikan DELETE method yg diblokir hosting)
    if ($action === 'delete') {
        $friendID = (int)($body['friend_id'] ?? 0);
        if (!$friendID) jsonResponse(['error' => 'friend_id diperlukan'], 400);
        $stmt = $pdo->prepare("DELETE FROM messages WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)");
        $stmt->execute([$userID, $friendID, $friendID, $userID]);
        logActivity($userID, 'hapus_chat', "Dengan user #$friendID");
        jsonResponse(['message' => 'Pesan dihapus']);
    }

    // Kirim pesan
    $toUserID = (int)($body['to_user_id'] ?? 0);
    $content = $body['encrypted_content'] ?? '';

    if (!$toUserID || !$content) {
        jsonResponse(['error' => 'to_user_id dan encrypted_content wajib diisi'], 400);
    }

    $stmt = $pdo->prepare("INSERT INTO messages (from_user_id, to_user_id, encrypted_content) VALUES (?, ?, ?)");
    $stmt->execute([$userID, $toUserID, $content]);
    $msgID = (int)$pdo->lastInsertId();

    $stmtUser = $pdo->prepare("SELECT nama FROM users WHERE id = ?");
    $stmtUser->execute([$userID]);
    $senderUser = $stmtUser->fetch();
    $senderNama = $senderUser ? $senderUser['nama'] : 'Seseorang';

    try {
        sendPushToUser($toUserID, [
            'title' => $senderNama,
            'body' => mb_substr($content, 0, 100),
            'tag' => 'chat-' . $userID,
            'url' => '/app.html',
            'fromId' => $userID,
            'fromNama' => $senderNama
        ]);
    } catch (Exception $e) {}

    jsonResponse([
        'id' => $msgID,
        'from_user_id' => $userID,
        'to_user_id' => $toUserID,
        'encrypted_content' => $content,
        'created_at' => date('Y-m-d H:i:s'),
        'is_mine' => true,
    ], 201);
}

// Fallback: DELETE method jika hosting mendukung
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $friendID = (int)($_GET['friend_id'] ?? 0);
    if (!$friendID) jsonResponse(['error' => 'friend_id diperlukan'], 400);
    $stmt = $pdo->prepare("DELETE FROM messages WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)");
    $stmt->execute([$userID, $friendID, $friendID, $userID]);
    logActivity($userID, 'hapus_chat', "Dengan user #$friendID");
    jsonResponse(['message' => 'Pesan dihapus']);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
