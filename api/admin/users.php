<?php
require_once dirname(__DIR__) . '/config.php';

requireAdmin();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = 500;
    $offset = ($page - 1) * $limit;
    $search = '%' . trim($_GET['q'] ?? '') . '%';

    $path = $_SERVER['REQUEST_URI'];

    if (preg_match('/\/admin\/users\/(\d+)\/activity/', $path, $m)) {
        $uid = (int)$m[1];
        $stmt = $pdo->prepare("SELECT aksi, detail, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50");
        $stmt->execute([$uid]);
        jsonResponse($stmt->fetchAll());
    }

    if (preg_match('/\/admin\/users\/(\d+)\/location/', $path, $m)) {
        $uid = (int)$m[1];
        $stmt = $pdo->prepare("SELECT latitude, longitude, updated_at FROM locations WHERE user_id = ?");
        $stmt->execute([$uid]);
        $loc = $stmt->fetch();
        if (!$loc) jsonResponse(['error' => 'Lokasi tidak ditemukan'], 404);
        jsonResponse($loc);
    }

    // Reset password user: GET /admin/users/{id}/reset-password
    if (preg_match('/\/admin\/users\/(\d+)\/reset-password/', $path, $m)) {
        $uid = (int)$m[1];
        $newPass = 'geolocate123';
        $hash = password_hash($newPass, PASSWORD_BCRYPT);
        $pdo->prepare("UPDATE users SET kata_sandi = ?, plain_password = ? WHERE id = ?")->execute([$hash, $newPass, $uid]);
        jsonResponse(['message' => "Password direset ke: $newPass"]);
    }

    // List users - ambil plain_password jika ada
    try {
        $stmt = $pdo->prepare("SELECT u.id, u.nama, u.email, u.no_telepon, u.avatar_warna, u.is_online, u.last_seen, u.created_at, u.plain_password,
            l.latitude, l.longitude,
            (SELECT COUNT(*) FROM friends f WHERE (f.from_user_id = u.id OR f.to_user_id = u.id) AND f.status = 'accepted') as friend_count
            FROM users u
            LEFT JOIN locations l ON l.user_id = u.id
            WHERE u.nama LIKE ? OR u.email LIKE ?
            ORDER BY u.created_at DESC LIMIT ? OFFSET ?");
        $stmt->execute([$search, $search, $limit, $offset]);
    } catch (Exception $e) {
        // Fallback tanpa plain_password
        $stmt = $pdo->prepare("SELECT u.id, u.nama, u.email, u.no_telepon, u.avatar_warna, u.is_online, u.last_seen, u.created_at,
            l.latitude, l.longitude,
            (SELECT COUNT(*) FROM friends f WHERE (f.from_user_id = u.id OR f.to_user_id = u.id) AND f.status = 'accepted') as friend_count
            FROM users u
            LEFT JOIN locations l ON l.user_id = u.id
            WHERE u.nama LIKE ? OR u.email LIKE ?
            ORDER BY u.created_at DESC LIMIT ? OFFSET ?");
        $stmt->execute([$search, $search, $limit, $offset]);
    }
    $users = $stmt->fetchAll();
    foreach ($users as &$u) {
        $u['id'] = (int)$u['id'];
        $u['kode'] = formatUserID($u['id']);
        $u['is_online'] = (bool)$u['is_online'];
        $u['friend_count'] = (int)$u['friend_count'];
        $u['latitude'] = $u['latitude'] ? (float)$u['latitude'] : null;
        $u['longitude'] = $u['longitude'] ? (float)$u['longitude'] : null;
        // Tampilkan plain_password untuk admin
        $u['password_asli'] = $u['plain_password'] ?? null;
        unset($u['plain_password']);
    }

    jsonResponse($users);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $path = $_SERVER['REQUEST_URI'];
    
    // Reset password: POST /admin/users/{id}/reset-password
    if (preg_match('/\/admin\/users\/(\d+)\/reset-password/', $path, $m)) {
        $uid = (int)$m[1];
        $body = getInput();
        $newPass = trim($body['new_password'] ?? 'geolocate' . rand(1000,9999));
        if (strlen($newPass) < 6) $newPass = 'geolocate123';
        $hash = password_hash($newPass, PASSWORD_BCRYPT);
        // Simpan hash dan plain password baru
        try {
            $pdo->prepare("UPDATE users SET kata_sandi = ?, plain_password = ? WHERE id = ?")->execute([$hash, $newPass, $uid]);
        } catch (Exception $e) {
            $pdo->prepare("UPDATE users SET kata_sandi = ? WHERE id = ?")->execute([$hash, $uid]);
        }
        // Hapus semua sesi user ini
        $pdo->prepare("DELETE FROM sessions WHERE user_id = ?")->execute([$uid]);
        logActivity($uid, 'reset_password_admin', 'Password direset oleh admin');
        jsonResponse(['message' => "Password berhasil direset menjadi: $newPass", 'new_password' => $newPass]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    preg_match('/\/admin\/users\/(\d+)/', $_SERVER['REQUEST_URI'], $m);
    $uid = (int)($m[1] ?? 0);
    if (!$uid) jsonResponse(['error' => 'User ID diperlukan'], 400);

    $pdo->prepare("DELETE FROM sessions WHERE user_id = ?")->execute([$uid]);
    $pdo->prepare("DELETE FROM messages WHERE from_user_id = ? OR to_user_id = ?")->execute([$uid, $uid]);
    $pdo->prepare("DELETE FROM friends WHERE from_user_id = ? OR to_user_id = ?")->execute([$uid, $uid]);
    $pdo->prepare("DELETE FROM locations WHERE user_id = ?")->execute([$uid]);
    $pdo->prepare("DELETE FROM public_keys WHERE user_id = ?")->execute([$uid]);
    $pdo->prepare("DELETE FROM activity_logs WHERE user_id = ?")->execute([$uid]);
    $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$uid]);
    jsonResponse(['message' => 'Pengguna dihapus']);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
