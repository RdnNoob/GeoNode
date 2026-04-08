<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
$pdo = getDB();

$gid = (int)($_GET['group_id'] ?? 0);
if (!$gid) {
    $path = $_SERVER['REQUEST_URI'] ?? '';
    preg_match('/\/api\/groups\/(\d+)/', $path, $mx);
    $gid = (int)($mx[1] ?? 0);
}
if (!$gid) jsonResponse(['error' => 'Group ID diperlukan'], 400);

// Cek keanggotaan
$stmt = $pdo->prepare("SELECT g.maps_enabled, gm.role FROM `groups` g 
    JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
    WHERE g.id = ?");
$stmt->execute([$userID, $gid]);
$groupData = $stmt->fetch();
if (!$groupData) jsonResponse(['error' => 'Kamu bukan anggota grup ini'], 403);

// POST: toggle maps_enabled (hanya admin grup)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($groupData['role'] !== 'admin') jsonResponse(['error' => 'Hanya admin grup yang bisa mengubah ini'], 403);
    $body = getInput();
    $mapsEnabled = isset($body['maps_enabled']) ? (bool)$body['maps_enabled'] : false;
    $pdo->prepare("UPDATE `groups` SET maps_enabled = ? WHERE id = ?")->execute([$mapsEnabled ? 1 : 0, $gid]);
    jsonResponse(['maps_enabled' => $mapsEnabled, 'message' => $mapsEnabled ? 'Peta grup diaktifkan' : 'Peta grup dinonaktifkan']);
}

// GET: ambil lokasi semua anggota grup
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!$groupData['maps_enabled']) jsonResponse(['error' => 'Fitur maps grup dinonaktifkan oleh admin grup'], 403);
    
    $stmt = $pdo->prepare("
        SELECT u.id, u.nama, u.avatar_warna, u.is_online, u.last_seen,
               l.latitude, l.longitude, l.updated_at
        FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        LEFT JOIN locations l ON l.user_id = u.id
        WHERE gm.group_id = ?
    ");
    $stmt->execute([$gid]);
    $rows = $stmt->fetchAll();
    
    $result = array_map(function($r) {
        return [
            'user_id' => (int)$r['id'],
            'nama' => $r['nama'],
            'avatar_warna' => $r['avatar_warna'],
            'is_online' => (bool)$r['is_online'],
            'last_seen' => $r['last_seen'],
            'latitude' => $r['latitude'] ? (float)$r['latitude'] : null,
            'longitude' => $r['longitude'] ? (float)$r['longitude'] : null,
            'updated_at' => $r['updated_at'],
        ];
    }, $rows);
    
    jsonResponse($result);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
