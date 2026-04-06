<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Ambil daftar teman yang sudah accepted
    $path = $_SERVER['REQUEST_URI'];

    if (str_contains($path, '/requests/')) {
        // Handle accept/reject
        preg_match('/\/friends\/requests\/(\d+)\/(accept|reject)/', $path, $m);
        $friendID = (int)($m[1] ?? 0);
        $action = $m[2] ?? '';

        if (!$friendID || !in_array($action, ['accept', 'reject'])) {
            jsonResponse(['error' => 'Parameter tidak valid'], 400);
        }
        $newStatus = $action === 'accept' ? 'accepted' : 'rejected';
        $stmt = $pdo->prepare("UPDATE friends SET status = ? WHERE id = ? AND to_user_id = ?");
        $stmt->execute([$newStatus, $friendID, $userID]);
        jsonResponse(['message' => $action === 'accept' ? 'Permintaan diterima' : 'Permintaan ditolak']);
    }

    if (str_contains($path, '/requests')) {
        // Permintaan masuk
        $stmt = $pdo->prepare("SELECT f.id, f.from_user_id, f.to_user_id, f.status, f.created_at,
            u.id as uid, u.nama, u.email, u.avatar_warna, u.is_online
            FROM friends f JOIN users u ON f.from_user_id = u.id
            WHERE f.to_user_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC");
        $stmt->execute([$userID]);
        $rows = $stmt->fetchAll();
        $result = array_map(function($r) {
            return [
                'id' => (int)$r['id'],
                'from_user_id' => (int)$r['from_user_id'],
                'to_user_id' => (int)$r['to_user_id'],
                'status' => $r['status'],
                'created_at' => $r['created_at'],
                'from_user' => ['id' => (int)$r['uid'], 'nama' => $r['nama'], 'email' => $r['email'], 'avatar_warna' => $r['avatar_warna'], 'is_online' => (bool)$r['is_online']]
            ];
        }, $rows);
        jsonResponse($result ?: []);
    }

    if (str_contains($path, '/sent')) {
        // Permintaan terkirim
        $stmt = $pdo->prepare("SELECT f.id, f.from_user_id, f.to_user_id, f.status, f.created_at,
            u.id as uid, u.nama, u.email, u.avatar_warna, u.is_online
            FROM friends f JOIN users u ON f.to_user_id = u.id
            WHERE f.from_user_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC");
        $stmt->execute([$userID]);
        $rows = $stmt->fetchAll();
        $result = array_map(function($r) {
            return [
                'id' => (int)$r['id'],
                'from_user_id' => (int)$r['from_user_id'],
                'to_user_id' => (int)$r['to_user_id'],
                'status' => $r['status'],
                'created_at' => $r['created_at'],
                'to_user' => ['id' => (int)$r['uid'], 'nama' => $r['nama'], 'email' => $r['email'], 'avatar_warna' => $r['avatar_warna'], 'is_online' => (bool)$r['is_online']]
            ];
        }, $rows);
        jsonResponse($result ?: []);
    }

    // Daftar teman accepted
    $stmt = $pdo->prepare("SELECT f.id, f.from_user_id, f.to_user_id, f.status,
        u.id as uid, u.nama, u.email, u.no_telepon, u.avatar_warna, u.is_online, u.last_seen, u.created_at
        FROM friends f
        JOIN users u ON (CASE WHEN f.from_user_id = :uid THEN f.to_user_id ELSE f.from_user_id END = u.id)
        WHERE (f.from_user_id = :uid2 OR f.to_user_id = :uid3) AND f.status = 'accepted'");
    $stmt->execute([':uid' => $userID, ':uid2' => $userID, ':uid3' => $userID]);
    $rows = $stmt->fetchAll();
    $result = array_map(function($r) use ($userID) {
        $friendID = (int)$r['from_user_id'] === $userID ? (int)$r['to_user_id'] : (int)$r['from_user_id'];
        return [
            'id' => (int)$r['id'],
            'friend_id' => $friendID,
            'status' => $r['status'],
            'friend' => ['id' => (int)$r['uid'], 'nama' => $r['nama'], 'email' => $r['email'], 'no_telepon' => $r['no_telepon'], 'avatar_warna' => $r['avatar_warna'], 'is_online' => (bool)$r['is_online'], 'last_seen' => $r['last_seen'], 'created_at' => $r['created_at']]
        ];
    }, $rows);
    jsonResponse($result ?: []);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = getInput();
    $toUserID = (int)($body['user_id'] ?? 0);

    if (!$toUserID || $toUserID === $userID) {
        jsonResponse(['error' => 'ID pengguna tidak valid'], 400);
    }

    // Cek sudah berteman
    $stmt = $pdo->prepare("SELECT id FROM friends WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)");
    $stmt->execute([$userID, $toUserID, $toUserID, $userID]);
    if ($stmt->fetch()) {
        jsonResponse(['error' => 'Sudah berteman atau permintaan sudah terkirim'], 400);
    }

    $stmt = $pdo->prepare("INSERT INTO friends (from_user_id, to_user_id, status) VALUES (?, ?, 'pending')");
    $stmt->execute([$userID, $toUserID]);
    logActivity($userID, 'kirim_permintaan', "Ke user #$toUserID");
    jsonResponse(['message' => 'Permintaan terkirim'], 201);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    preg_match('/\/friends\/(\d+)/', $_SERVER['REQUEST_URI'], $m);
    $friendRowID = (int)($m[1] ?? 0);
    $stmt = $pdo->prepare("DELETE FROM friends WHERE id = ? AND (from_user_id = ? OR to_user_id = ?)");
    $stmt->execute([$friendRowID, $userID, $userID]);
    jsonResponse(['message' => 'Teman dihapus']);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
