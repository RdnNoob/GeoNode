<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
$pdo = getDB();

// Pastikan tabel groups ada
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `groups` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `nama` VARCHAR(255) NOT NULL,
        `deskripsi` TEXT DEFAULT NULL,
        `created_by` INT NOT NULL,
        `maps_enabled` TINYINT(1) NOT NULL DEFAULT 1,
        `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `group_members` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `group_id` INT NOT NULL,
        `user_id` INT NOT NULL,
        `role` ENUM('admin','member') NOT NULL DEFAULT 'member',
        `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_group_member` (`group_id`, `user_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `group_messages` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `group_id` INT NOT NULL,
        `from_user_id` INT NOT NULL,
        `content` TEXT NOT NULL,
        `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_gm_group` (`group_id`),
        KEY `idx_gm_created` (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Exception $e) {}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Cek apakah request untuk grup spesifik
    $gid = (int)($_GET['group_id'] ?? 0);
    if (!$gid) {
        $path = $_SERVER['REQUEST_URI'] ?? '';
        if (preg_match('/\/api\/groups\/(\d+)/', $path, $mx)) {
            $gid = (int)$mx[1];
        }
    }
    
    // GET /api/groups/{id}
    if ($gid) {
        $stmt = $pdo->prepare("SELECT g.*, gm.role FROM `groups` g 
            JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
            WHERE g.id = ?");
        $stmt->execute([$userID, $gid]);
        $group = $stmt->fetch();
        if (!$group) jsonResponse(['error' => 'Grup tidak ditemukan atau kamu bukan anggota'], 404);
        jsonResponse($group);
    }
    
    // GET /api/groups - list all my groups
    $stmt = $pdo->prepare("SELECT g.id, g.nama, g.deskripsi, g.created_by, g.maps_enabled, g.created_at, gm.role
        FROM `groups` g
        JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
        ORDER BY g.created_at DESC");
    $stmt->execute([$userID]);
    $groups = $stmt->fetchAll();
    $result = [];
    foreach ($groups as $g) {
        // Count members separately to avoid subquery issues
        $cntStmt = $pdo->prepare("SELECT COUNT(*) as c FROM group_members WHERE group_id = ?");
        $cntStmt->execute([$g['id']]);
        $cntRow = $cntStmt->fetch();
        $result[] = [
            'id' => (int)$g['id'],
            'nama' => $g['nama'],
            'deskripsi' => $g['deskripsi'],
            'created_by' => (int)$g['created_by'],
            'maps_enabled' => (bool)$g['maps_enabled'],
            'created_at' => $g['created_at'],
            'role' => $g['role'],
            'member_count' => (int)$cntRow['c']
        ];
    }
    jsonResponse($result);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $path = $_SERVER['REQUEST_URI'] ?? '';
    
    // Toggle maps: POST /api/groups/{id}/maps
    if (preg_match('/\/api\/groups\/(\d+)\/maps$/', $path, $m)) {
        $gid = (int)$m[1];
        // Cek apakah admin group
        $stmt = $pdo->prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?");
        $stmt->execute([$gid, $userID]);
        $member = $stmt->fetch();
        if (!$member || $member['role'] !== 'admin') jsonResponse(['error' => 'Hanya admin grup yang bisa mengubah ini'], 403);
        
        $body = getInput();
        $mapsEnabled = isset($body['maps_enabled']) ? (bool)$body['maps_enabled'] : false;
        $pdo->prepare("UPDATE `groups` SET maps_enabled = ? WHERE id = ?")->execute([$mapsEnabled ? 1 : 0, $gid]);
        jsonResponse(['maps_enabled' => $mapsEnabled]);
    }
    
    // Buat grup baru
    $body = getInput();
    $nama = trim($body['nama'] ?? '');
    $deskripsi = trim($body['deskripsi'] ?? '');
    if (!$nama) jsonResponse(['error' => 'Nama grup wajib diisi'], 400);
    
    $stmt = $pdo->prepare("INSERT INTO `groups` (nama, deskripsi, created_by) VALUES (?, ?, ?)");
    $stmt->execute([$nama, $deskripsi ?: null, $userID]);
    $gid = (int)$pdo->lastInsertId();
    
    // Creator otomatis jadi admin
    $pdo->prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'admin')")->execute([$gid, $userID]);
    
    jsonResponse(['id' => $gid, 'nama' => $nama, 'deskripsi' => $deskripsi, 'created_by' => $userID, 'maps_enabled' => true, 'role' => 'admin', 'member_count' => 1], 201);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $gid = (int)($_GET['group_id'] ?? 0);
    if (!$gid) {
        $path = $_SERVER['REQUEST_URI'] ?? '';
        preg_match('/\/api\/groups\/(\d+)/', $path, $mx);
        $gid = (int)($mx[1] ?? 0);
    }
    if (!$gid) jsonResponse(['error' => 'Group ID diperlukan'], 400);
    
    $stmt = $pdo->prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?");
    $stmt->execute([$gid, $userID]);
    $member = $stmt->fetch();
    if (!$member || $member['role'] !== 'admin') jsonResponse(['error' => 'Hanya admin grup yang bisa menghapus'], 403);
    
    $pdo->prepare("DELETE FROM group_messages WHERE group_id = ?")->execute([$gid]);
    $pdo->prepare("DELETE FROM group_members WHERE group_id = ?")->execute([$gid]);
    $pdo->prepare("DELETE FROM `groups` WHERE id = ?")->execute([$gid]);
    jsonResponse(['message' => 'Grup dihapus']);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
