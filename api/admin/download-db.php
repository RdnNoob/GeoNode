<?php
require_once dirname(__DIR__) . '/config.php';

requireAdmin();
$pdo = getDB();

// Daftar tabel yang akan di-export
$tables = ['users', 'sessions', 'friends', 'messages', 'locations', 'activity_logs', 'public_keys', 'admin', 'admin_sessions'];

$sql  = "-- ============================================================\n";
$sql .= "-- GeoLocate - Database Export\n";
$sql .= "-- Tanggal: " . date('Y-m-d H:i:s') . "\n";
$sql .= "-- Host: " . DB_HOST . "\n";
$sql .= "-- Database: " . DB_NAME . "\n";
$sql .= "-- ============================================================\n\n";
$sql .= "SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";\n";
$sql .= "SET time_zone = \"+07:00\";\n";
$sql .= "SET NAMES utf8mb4;\n\n";
$sql .= "USE `" . DB_NAME . "`;\n\n";

foreach ($tables as $table) {
    try {
        // Struktur tabel
        $createStmt = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM);
        if (!$createStmt) continue;

        $sql .= "-- Tabel: $table\n";
        $sql .= "DROP TABLE IF EXISTS `$table`;\n";
        $sql .= $createStmt[1] . ";\n\n";

        // Data tabel
        $rows = $pdo->query("SELECT * FROM `$table`")->fetchAll(PDO::FETCH_NUM);
        if (count($rows) > 0) {
            // Ambil nama kolom
            $cols = $pdo->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_COLUMN);
            $colList = implode('`, `', $cols);

            $sql .= "INSERT INTO `$table` (`$colList`) VALUES\n";
            $values = [];
            foreach ($rows as $row) {
                $escaped = array_map(function($val) use ($pdo) {
                    if ($val === null) return 'NULL';
                    return "'" . addslashes($val) . "'";
                }, $row);
                $values[] = '(' . implode(', ', $escaped) . ')';
            }
            $sql .= implode(",\n", $values) . ";\n\n";
        }
    } catch (PDOException $e) {
        $sql .= "-- Gagal export tabel $table: " . $e->getMessage() . "\n\n";
    }
}

$filename = 'geolocate_backup_' . date('Ymd_His') . '.sql';

header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . strlen($sql));
header('Cache-Control: no-cache');
echo $sql;
exit;
