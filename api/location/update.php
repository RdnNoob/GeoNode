<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
$body = getInput();

$lat = isset($body['latitude']) ? (float)$body['latitude'] : null;
$lon = isset($body['longitude']) ? (float)$body['longitude'] : null;

if ($lat === null || $lon === null) {
    jsonResponse(['error' => 'Latitude dan longitude wajib diisi'], 400);
}

$pdo = getDB();
$stmt = $pdo->prepare("INSERT INTO locations (user_id, latitude, longitude, updated_at) VALUES (?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), updated_at = NOW()");
$stmt->execute([$userID, $lat, $lon]);

$pdo->prepare("UPDATE users SET is_online = 1 WHERE id = ?")->execute([$userID]);

jsonResponse(['message' => 'Lokasi diperbarui']);
