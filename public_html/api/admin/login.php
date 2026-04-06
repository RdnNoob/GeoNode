<?php
require_once dirname(__DIR__) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

$body = getInput();
$username = trim($body['username'] ?? '');
$kataSandi = $body['kata_sandi'] ?? '';

if (!$username || !$kataSandi) {
    jsonResponse(['error' => 'Username dan kata sandi wajib diisi'], 400);
}

$pdo = getDB();
$stmt = $pdo->prepare("SELECT id, username, kata_sandi FROM admin WHERE username = ?");
$stmt->execute([$username]);
$admin = $stmt->fetch();

if (!$admin || !password_verify($kataSandi, $admin['kata_sandi'])) {
    jsonResponse(['error' => 'Username atau kata sandi salah'], 401);
}

$token = generateToken();
$expiresAt = date('Y-m-d H:i:s', time() + ADMIN_SESSION_DURATION);
$stmt = $pdo->prepare("INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, ?)");
$stmt->execute([$token, $admin['id'], $expiresAt]);

jsonResponse(['token' => $token, 'username' => $admin['username']]);
