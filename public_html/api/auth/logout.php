<?php
require_once dirname(__DIR__) . '/config.php';

$userID = requireAuth();

$token = getTokenFromRequest();
$pdo = getDB();
$pdo->prepare("DELETE FROM sessions WHERE token = ?")->execute([$token]);
$pdo->prepare("UPDATE users SET is_online = 0, last_seen = NOW() WHERE id = ?")->execute([$userID]);

logActivity($userID, 'keluar', 'Logout');
jsonResponse(['message' => 'Berhasil logout']);
