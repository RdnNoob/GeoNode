<?php
require_once dirname(__DIR__) . '/config.php';

requireAdmin();
$pdo = getDB();

$totalUsers = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
$onlineUsers = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE is_online = 1")->fetchColumn();
$totalFriends = (int)$pdo->query("SELECT COUNT(*) FROM friends WHERE status = 'accepted'")->fetchColumn();
$totalMessages = (int)$pdo->query("SELECT COUNT(*) FROM messages")->fetchColumn();
$todayRegistrations = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURDATE()")->fetchColumn();

// 5 user terbaru
$stmt = $pdo->query("SELECT id, nama, email, avatar_warna, is_online, created_at FROM users ORDER BY created_at DESC LIMIT 5");
$recentUsers = $stmt->fetchAll();
foreach ($recentUsers as &$u) {
    $u['id'] = (int)$u['id'];
    $u['kode'] = formatUserID($u['id']);
    $u['is_online'] = (bool)$u['is_online'];
}

// Aktivitas terbaru
$stmt = $pdo->query("SELECT al.id, al.user_id, al.aksi, al.detail, al.created_at, u.nama
    FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC LIMIT 20");
$recentLogs = $stmt->fetchAll();
foreach ($recentLogs as &$l) {
    $l['id'] = (int)$l['id'];
}

jsonResponse([
    'total_pengguna'       => $totalUsers,
    'pengguna_online'      => $onlineUsers,
    'total_pertemanan'     => $totalFriends,
    'total_pesan'          => $totalMessages,
    'pendaftaran_hari_ini' => $todayRegistrations,
    'recent_users'         => $recentUsers,
    'recent_logs'          => $recentLogs,
]);
