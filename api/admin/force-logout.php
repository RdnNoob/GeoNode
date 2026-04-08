<?php
require_once dirname(__DIR__) . '/config.php';

requireAdmin();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $count = $pdo->exec("DELETE FROM sessions");
    logActivity(0, 'force_logout_all', "Admin force logout semua client ($count sesi)");
    jsonResponse(['message' => "Berhasil logout $count sesi aktif", 'count' => $count]);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
