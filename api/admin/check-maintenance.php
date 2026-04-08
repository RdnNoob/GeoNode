<?php
// Endpoint publik untuk cek maintenance mode (tidak butuh auth)
require_once dirname(__DIR__) . '/config.php';

try {
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT value FROM settings WHERE `key` = 'maintenance_mode'");
    $stmt->execute();
    $row = $stmt->fetch();
    $isMaintenance = $row && $row['value'] === '1';
    jsonResponse(['maintenance' => $isMaintenance]);
} catch (Exception $e) {
    jsonResponse(['maintenance' => false]);
}
