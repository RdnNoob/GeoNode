<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
$pdo = getDB();

$stmt = $pdo->prepare("
    SELECT u.id, u.nama, u.avatar_warna, u.is_online, u.last_seen,
           l.latitude, l.longitude
    FROM friends f
    JOIN users u ON (CASE WHEN f.from_user_id = :uid THEN f.to_user_id ELSE f.from_user_id END = u.id)
    LEFT JOIN locations l ON l.user_id = u.id
    WHERE (f.from_user_id = :uid2 OR f.to_user_id = :uid3) AND f.status = 'accepted'
");
$stmt->execute([':uid' => $userID, ':uid2' => $userID, ':uid3' => $userID]);
$rows = $stmt->fetchAll();

$result = array_map(function($r) {
    return [
        'user_id' => (int)$r['id'],
        'nama' => $r['nama'],
        'avatar_warna' => $r['avatar_warna'],
        'is_online' => (bool)$r['is_online'],
        'last_seen' => $r['last_seen'],
        'latitude' => $r['latitude'] ? (float)$r['latitude'] : null,
        'longitude' => $r['longitude'] ? (float)$r['longitude'] : null,
    ];
}, $rows);

jsonResponse($result ?: []);
