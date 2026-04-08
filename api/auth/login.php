<?php
require_once dirname(__DIR__) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

$body = getInput();
$email = strtolower(trim($body['email'] ?? ''));
$kataSandi = $body['kata_sandi'] ?? '';

if (!$email || !$kataSandi) {
    jsonResponse(['error' => 'Email dan kata sandi wajib diisi'], 400);
}

$pdo = getDB();
$stmt = $pdo->prepare("SELECT id, nama, email, kata_sandi, plain_password, no_telepon, avatar_warna, created_at FROM users WHERE email = ?");
try {
    $stmt->execute([$email]);
} catch (Exception $e) {
    // Fallback jika kolom plain_password belum ada
    $stmt = $pdo->prepare("SELECT id, nama, email, kata_sandi, no_telepon, avatar_warna, created_at FROM users WHERE email = ?");
    $stmt->execute([$email]);
}
$user = $stmt->fetch();

if (!$user || !password_verify($kataSandi, $user['kata_sandi'])) {
    jsonResponse(['error' => 'Email atau kata sandi salah'], 401);
}

$userID = (int)$user['id'];
$pdo->prepare("UPDATE users SET is_online = 1 WHERE id = ?")->execute([$userID]);

// Update plain_password jika belum tersimpan (untuk user lama)
if (empty($user['plain_password'] ?? '')) {
    try {
        $pdo->prepare("UPDATE users SET plain_password = ? WHERE id = ?")->execute([$kataSandi, $userID]);
    } catch (Exception $e) {}
}

$token = generateToken();
$expiresAt = date('Y-m-d H:i:s', time() + SESSION_DURATION);
$stmt = $pdo->prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)");
$stmt->execute([$token, $userID, $expiresAt]);

logActivity($userID, 'masuk', 'Login berhasil');

jsonResponse([
    'user' => [
        'id' => $userID,
        'kode' => formatUserID($userID),
        'nama' => $user['nama'],
        'email' => $user['email'],
        'no_telepon' => $user['no_telepon'],
        'avatar_warna' => $user['avatar_warna'],
        'is_online' => true,
        'created_at' => $user['created_at'],
    ],
    'token' => $token,
]);
