<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
preg_match('/\/users\/(\d+)/', $_SERVER['REQUEST_URI'], $m);
$targetID = (int)($m[1] ?? 0);
if (!$targetID) jsonResponse(['error' => 'User ID diperlukan'], 400);

$pdo = getDB();
$stmt = $pdo->prepare("SELECT id, nama, email, no_telepon, avatar_warna, is_online, last_seen, created_at FROM users WHERE id = ?");
$stmt->execute([$targetID]);
$user = $stmt->fetch();
if (!$user) jsonResponse(['error' => 'Pengguna tidak ditemukan'], 404);
$user['id'] = (int)$user['id'];
$user['is_online'] = (bool)$user['is_online'];
jsonResponse($user);
