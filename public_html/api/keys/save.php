<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
$body = getInput();
$publicKey = $body['public_key'] ?? '';

if (!$publicKey) {
    jsonResponse(['error' => 'public_key wajib diisi'], 400);
}

$pdo = getDB();
$stmt = $pdo->prepare("INSERT INTO public_keys (user_id, public_key, updated_at) VALUES (?, ?, NOW())
    ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), updated_at = NOW()");
$stmt->execute([$userID, $publicKey]);
jsonResponse(['message' => 'Kunci publik tersimpan']);
