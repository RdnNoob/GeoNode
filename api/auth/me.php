<?php
require_once dirname(__DIR__) . '/config.php';

$userID = requireAuth();

$pdo = getDB();
$stmt = $pdo->prepare("SELECT id, nama, email, no_telepon, avatar_warna, is_online, last_seen, created_at FROM users WHERE id = ?");
$stmt->execute([$userID]);
$user = $stmt->fetch();

if (!$user) {
    jsonResponse(['error' => 'Pengguna tidak ditemukan'], 404);
}

$user['id'] = (int)$user['id'];
$user['kode'] = formatUserID($user['id']);
$user['is_online'] = (bool)$user['is_online'];
jsonResponse($user);