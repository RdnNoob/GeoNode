<?php
require_once dirname(__DIR__) . '/config.php';

requireAdmin();
$pdo = getDB();

$totalUsers = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
$onlineUsers = $pdo->query("SELECT COUNT(*) FROM users WHERE is_online = 1")->fetchColumn();
$totalFriends = $pdo->query("SELECT COUNT(*) FROM friends WHERE status = 'accepted'")->fetchColumn();
$totalMessages = $pdo->query("SELECT COUNT(*) FROM messages")->fetchColumn();
$totalLogs = $pdo->query("SELECT COUNT(*) FROM activity_logs")->fetchColumn();

// 5 user terbaru
$stmt = $pdo->query("SELECT id, nama, email, avatar_warna, is_online, created_at FROM users ORDER BY created_at DESC LIMIT 5");
$recentUsers = $stmt->fetchAll();
foreach ($recentUsers as &$u) {
    $u['id'] = (int)$u['id'];
    $u['is_online'] = (bool)$u['is_online'];
}

// 5 aktivitas terbaru
$stmt = $pdo->query("SELECT al.id, al.user_id, al.aksi, al.detail, al.created_at, u.nama
    FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC LIMIT 20");
$recentLogs = $stmt->fetchAll();
foreach ($recentLogs as &$l) {
    $l['id'] = (int)$l['id'];
}

jsonResponse([
    'total_users' => (int)$totalUsers,
    'online_users' => (int)$onlineUsers,
    'total_friends' => (int)$totalFriends,
    'total_messages' => (int)$totalMessages,
    'total_logs' => (int)$totalLogs,
    'recent_users' => $recentUsers,
    'recent_logs' => $recentLogs,
]);
