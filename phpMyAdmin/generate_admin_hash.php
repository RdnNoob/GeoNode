<?php
/**
 * Script untuk generate hash password admin
 * Jalankan via browser atau CLI sebelum import SQL
 * 
 * CLI: php generate_admin_hash.php
 * Browser: buka file ini via browser sementara
 */

$password = 'admin!@#';
$hash = password_hash($password, PASSWORD_BCRYPT);

echo "-- Salin baris UPDATE di bawah ini dan jalankan di phpMyAdmin SQL tab:\n";
echo "UPDATE admin SET kata_sandi = '" . $hash . "' WHERE username = 'admin';\n";
echo "\n-- Atau INSERT langsung (jika admin belum ada):\n";
echo "INSERT INTO admin (username, kata_sandi) VALUES ('admin', '" . $hash . "');\n";
echo "\nHash yang dihasilkan: $hash\n";
