<?php
if (($_GET['key'] ?? '') !== 'geolocate_reset_2026') {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

require_once dirname(__DIR__) . '/api/config.php';

$pdo = getDB();
$stmt = $pdo->query("DELETE FROM messages");
$affected = $stmt->rowCount();

echo json_encode(['status' => 'ok', 'deleted' => $affected, 'message' => 'Semua pesan lama berhasil dihapus']);
