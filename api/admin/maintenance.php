<?php
require_once dirname(__DIR__) . '/config.php';

requireAdmin();
$pdo = getDB();

// Pastikan tabel settings ada
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS settings (
        `key` VARCHAR(100) NOT NULL PRIMARY KEY,
        `value` TEXT NOT NULL,
        `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Exception $e) {}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->prepare("SELECT value FROM settings WHERE `key` = 'maintenance_mode'");
    $stmt->execute();
    $row = $stmt->fetch();
    jsonResponse(['maintenance' => $row ? (bool)$row['value'] : false]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = getInput();
    $mode = isset($body['maintenance']) ? (bool)$body['maintenance'] : false;
    $stmt = $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('maintenance_mode', ?) ON DUPLICATE KEY UPDATE value = ?");
    $stmt->execute([$mode ? '1' : '0', $mode ? '1' : '0']);
    
    if ($mode) {
        // Force logout semua user: hapus semua sesi
        $pdo->exec("DELETE FROM sessions");
        logActivity(0, 'maintenance_on', 'Maintenance mode aktif, semua sesi dihapus');
    } else {
        logActivity(0, 'maintenance_off', 'Maintenance mode dinonaktifkan');
    }
    
    jsonResponse(['maintenance' => $mode, 'message' => $mode ? 'Maintenance mode ON - Semua client telah di-logout' : 'Maintenance mode OFF']);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    // Force logout semua user tanpa maintenance mode
    $count = $pdo->exec("DELETE FROM sessions");
    logActivity(0, 'force_logout_all', "Force logout semua client ($count sesi)");
    jsonResponse(['message' => "Berhasil logout $count sesi aktif"]);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
