<?php
require_once dirname(__DIR__) . '/config.php';

requireAdmin();
$token = getTokenFromRequest();
$pdo = getDB();
$pdo->prepare("DELETE FROM admin_sessions WHERE token = ?")->execute([$token]);
jsonResponse(['message' => 'Logout berhasil']);
