<?php
require_once dirname(__DIR__) . '/config.php';

requireAdmin();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = 20;
    $offset = ($page - 1) * $limit;
    $search = '%' . trim($_GET['q'] ?? '') . '%';

    $stmt = $pdo->prepare("SELECT id, nama, email, no_telepon, avatar_warna, is_online, last_seen, created_at
        FROM users WHERE nama LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?");
    $stmt->execute([$search, $search, $limit, $offset]);
    $users = $stmt->fetchAll();
    foreach ($users as &$u) {
        $u['id'] = (int)$u['id'];
        $u['is_online'] = (bool)$u['is_online'];
    }

    $total = $pdo->prepare("SELECT COUNT(*) FROM users WHERE nama LIKE ? OR email LIKE ?");
    $total->execute([$search, $search]);

    jsonResponse(['users' => $users, 'total' => (int)$total->fetchColumn(), 'page' => $page]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    preg_match('/\/admin\/users\/(\d+)/', $_SERVER['REQUEST_URI'], $m);
    $uid = (int)($m[1] ?? 0);
    if (!$uid) jsonResponse(['error' => 'User ID diperlukan'], 400);

    $pdo->prepare("DELETE FROM sessions WHERE user_id = ?")->execute([$uid]);
    $pdo->prepare("DELETE FROM messages WHERE from_user_id = ? OR to_user_id = ?")->execute([$uid, $uid]);
    $pdo->prepare("DELETE FROM friends WHERE from_user_id = ? OR to_user_id = ?")->execute([$uid, $uid]);
    $pdo->prepare("DELETE FROM locations WHERE user_id = ?")->execute([$uid]);
    $pdo->prepare("DELETE FROM public_keys WHERE user_id = ?")->execute([$uid]);
    $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$uid]);
    jsonResponse(['message' => 'Pengguna dihapus']);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
