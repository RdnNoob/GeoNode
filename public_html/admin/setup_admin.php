<?php
/**
 * SETUP ADMIN - Jalankan SEKALI setelah upload ke hosting
 * Akan mengatur ulang password admin ke: admin!@#
 * 
 * PENTING: HAPUS FILE INI SETELAH DIJALANKAN!
 * URL: https://domain-anda.com/admin/setup_admin.php
 */

// Proteksi sederhana - ubah string ini sebelum upload jika perlu
define('SETUP_KEY', 'geolocate_setup_2025');

if (!isset($_GET['key']) || $_GET['key'] !== SETUP_KEY) {
    die('<h2>Akses Ditolak</h2><p>Tambahkan parameter ?key=geolocate_setup_2025 di URL</p>');
}

require_once dirname(__DIR__) . '/api/config.php';

try {
    $pdo = getDB();
    
    // Hapus admin lama
    $pdo->exec("DELETE FROM admin");
    $pdo->exec("DELETE FROM admin_sessions");
    
    // Buat admin baru dengan password admin!@#
    $hash = password_hash('admin!@#', PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("INSERT INTO admin (username, kata_sandi) VALUES ('admin', ?)");
    $stmt->execute([$hash]);
    
    echo '<div style="font-family:sans-serif;padding:20px;max-width:500px;margin:50px auto;border:1px solid #ccc;border-radius:8px;">';
    echo '<h2 style="color:green;">✅ Admin berhasil dibuat!</h2>';
    echo '<p><strong>Username:</strong> admin</p>';
    echo '<p><strong>Password:</strong> admin!@#</p>';
    echo '<p style="color:red;"><strong>⚠️ PENTING: Segera hapus file ini dari server!</strong></p>';
    echo '<p>Path: <code>/public_html/admin/setup_admin.php</code></p>';
    echo '<a href="/admin/login.html" style="background:#22c55e;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;">Ke Halaman Login Admin</a>';
    echo '</div>';
} catch (Exception $e) {
    echo '<h2>❌ Error: ' . htmlspecialchars($e->getMessage()) . '</h2>';
}
