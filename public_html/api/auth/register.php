<?php
require_once dirname(__DIR__) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

$body = getInput();
$nama = trim($body['nama'] ?? '');
$email = strtolower(trim($body['email'] ?? ''));
$kataSandi = $body['kata_sandi'] ?? '';
$noTelepon = $body['no_telepon'] ?? null;

if (!$nama || !$email || !$kataSandi) {
    jsonResponse(['error' => 'Nama, email, dan kata sandi wajib diisi'], 400);
}
if (strlen($kataSandi) < 6) {
    jsonResponse(['error' => 'Kata sandi minimal 6 karakter'], 400);
}

$pdo = getDB();

$stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE email = ?");
$stmt->execute([$email]);
if ($stmt->fetchColumn() > 0) {
    jsonResponse(['error' => 'Email sudah terdaftar'], 400);
}

$hash = password_hash($kataSandi, PASSWORD_BCRYPT);
$warna = '#22c55e';

$stmt = $pdo->prepare("INSERT INTO users (nama, email, kata_sandi, no_telepon, avatar_warna) VALUES (?, ?, ?, ?, ?)");
$stmt->execute([$nama, $email, $hash, $noTelepon, $warna]);
$userID = (int)$pdo->lastInsertId();

$token = generateToken();
$expiresAt = date('Y-m-d H:i:s', time() + SESSION_DURATION);
$stmt = $pdo->prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)");
$stmt->execute([$token, $userID, $expiresAt]);

logActivity($userID, 'daftar', "Pengguna baru: $nama");

jsonResponse([
    'user' => [
        'id' => $userID,
        'nama' => $nama,
        'email' => $email,
        'no_telepon' => $noTelepon,
        'avatar_warna' => $warna,
        'is_online' => true,
    ],
    'token' => $token,
], 201);
