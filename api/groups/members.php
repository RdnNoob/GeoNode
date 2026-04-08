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
$stmt = $pdo->prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?");
$stmt->execute([$gid, $userID]);
$myMembership = $stmt->fetch();
if (!$myMembership) jsonResponse(['error' => 'Kamu bukan anggota grup ini'], 403);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->prepare("SELECT gm.id, gm.user_id, gm.role, gm.joined_at, 
        u.nama, u.avatar_warna, u.is_online
        FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ?
        ORDER BY gm.role DESC, gm.joined_at ASC");
    $stmt->execute([$gid]);
    $members = $stmt->fetchAll();
    foreach ($members as &$mem) {
        $mem['user_id'] = (int)$mem['user_id'];
        $mem['is_online'] = (bool)$mem['is_online'];
        $mem['kode'] = formatUserID($mem['user_id']);
    }
    jsonResponse($members);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($myMembership['role'] !== 'admin') jsonResponse(['error' => 'Hanya admin grup yang bisa menambah anggota'], 403);
    
    $body = getInput();
    $targetUserID = 0;
    
    if (!empty($body['user_code'])) {
        $targetUserID = parseUserCode($body['user_code']);
    } elseif (!empty($body['user_id'])) {
        $targetUserID = (int)$body['user_id'];
    }
    
    if (!$targetUserID) jsonResponse(['error' => 'user_id atau user_code diperlukan'], 400);
    
    // Cek user ada
    $stmt = $pdo->prepare("SELECT id, nama FROM users WHERE id = ?");
    $stmt->execute([$targetUserID]);
    $targetUser = $stmt->fetch();
    if (!$targetUser) jsonResponse(['error' => 'Pengguna tidak ditemukan'], 404);
    
    // Cek sudah member?
    $stmt = $pdo->prepare("SELECT id FROM group_members WHERE group_id = ? AND user_id = ?");
    $stmt->execute([$gid, $targetUserID]);
    if ($stmt->fetch()) jsonResponse(['error' => 'Pengguna sudah menjadi anggota grup'], 409);
    
    $role = ($body['role'] ?? 'member') === 'admin' ? 'admin' : 'member';
    $pdo->prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)")->execute([$gid, $targetUserID, $role]);
    
    jsonResponse(['message' => "Berhasil menambahkan {$targetUser['nama']} ke grup", 'user_id' => $targetUserID, 'nama' => $targetUser['nama'], 'role' => $role], 201);
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    // Ubah role member
    if ($myMembership['role'] !== 'admin') jsonResponse(['error' => 'Hanya admin grup yang bisa mengubah role'], 403);
    
    $body = getInput();
    $targetUserID = (int)($body['user_id'] ?? 0);
    $role = ($body['role'] ?? 'member') === 'admin' ? 'admin' : 'member';
    
    if (!$targetUserID) jsonResponse(['error' => 'user_id diperlukan'], 400);
    if ($targetUserID === $userID) jsonResponse(['error' => 'Tidak bisa mengubah role sendiri'], 400);
    
    $stmt = $pdo->prepare("UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?");
    $stmt->execute([$role, $gid, $targetUserID]);
    jsonResponse(['message' => "Role berhasil diubah menjadi $role"]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $body = getInput();
    $targetUserID = (int)($body['user_id'] ?? $userID);
    
    // Keluar sendiri atau admin hapus member
    if ($targetUserID !== $userID && $myMembership['role'] !== 'admin') {
        jsonResponse(['error' => 'Hanya admin yang bisa mengeluarkan anggota lain'], 403);
    }
    
    $pdo->prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?")->execute([$gid, $targetUserID]);
    jsonResponse(['message' => 'Berhasil keluar/mengeluarkan dari grup']);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
