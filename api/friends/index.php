<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $type = $_GET['type'] ?? 'friends';

    if ($type === 'requests') {
        // Permintaan masuk (pending)
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
                'from_user' => [
                    'id' => (int)$r['uid'],
                    'kode' => formatUserID((int)$r['uid']),
                    'nama' => $r['nama'],
                    'email' => $r['email'],
                    'avatar_warna' => $r['avatar_warna'],
                    'is_online' => (bool)$r['is_online']
                ]
            ];
        }, $rows);
        jsonResponse($result ?: []);
    }

    if ($type === 'sent') {
        // Permintaan yang sudah dikirim (pending/rejected)
        $stmt = $pdo->prepare("SELECT f.id, f.from_user_id, f.to_user_id, f.status, f.created_at,
            u.id as uid, u.nama, u.email, u.avatar_warna, u.is_online
            FROM friends f JOIN users u ON f.to_user_id = u.id
            WHERE f.from_user_id = ? AND f.status IN ('pending','rejected') ORDER BY f.created_at DESC");
        $stmt->execute([$userID]);
        $rows = $stmt->fetchAll();
        $result = array_map(function($r) {
            return [
                'id' => (int)$r['id'],
                'from_user_id' => (int)$r['from_user_id'],
                'to_user_id' => (int)$r['to_user_id'],
                'status' => $r['status'],
                'created_at' => $r['created_at'],
                'to_user' => [
                    'id' => (int)$r['uid'],
                    'kode' => formatUserID((int)$r['uid']),
                    'nama' => $r['nama'],
                    'email' => $r['email'],
                    'avatar_warna' => $r['avatar_warna'],
                    'is_online' => (bool)$r['is_online']
                ]
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
            'friend' => [
                'id' => (int)$r['uid'],
                'kode' => formatUserID((int)$r['uid']),
                'nama' => $r['nama'],
                'email' => $r['email'],
                'no_telepon' => $r['no_telepon'],
                'avatar_warna' => $r['avatar_warna'],
                'is_online' => (bool)$r['is_online'],
                'last_seen' => $r['last_seen'],
                'created_at' => $r['created_at']
            ]
        ];
    }, $rows);
    jsonResponse($result ?: []);
}

if ($method === 'POST') {
    $body = getInput();
    $action = $body['action'] ?? 'send';

    // Terima permintaan
    if ($action === 'accept') {
        $requestID = (int)($body['request_id'] ?? 0);
        if (!$requestID) jsonResponse(['error' => 'request_id diperlukan'], 400);
        $stmt = $pdo->prepare("UPDATE friends SET status = 'accepted' WHERE id = ? AND to_user_id = ?");
        $stmt->execute([$requestID, $userID]);
        if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Permintaan tidak ditemukan atau bukan milik Anda'], 404);
        logActivity($userID, 'terima_teman', "Permintaan #{$requestID} diterima");
        jsonResponse(['message' => 'Permintaan diterima']);
    }

    // Tolak permintaan
    if ($action === 'reject') {
        $requestID = (int)($body['request_id'] ?? 0);
        if (!$requestID) jsonResponse(['error' => 'request_id diperlukan'], 400);
        $stmt = $pdo->prepare("UPDATE friends SET status = 'rejected' WHERE id = ? AND to_user_id = ?");
        $stmt->execute([$requestID, $userID]);
        if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Permintaan tidak ditemukan atau bukan milik Anda'], 404);
        logActivity($userID, 'tolak_teman', "Permintaan #{$requestID} ditolak");
        jsonResponse(['message' => 'Permintaan ditolak']);
    }

    // Hapus teman
    if ($action === 'delete') {
        $friendRowID = (int)($body['friend_id'] ?? 0);
        if (!$friendRowID) jsonResponse(['error' => 'friend_id diperlukan'], 400);
        $stmt = $pdo->prepare("DELETE FROM friends WHERE id = ? AND (from_user_id = ? OR to_user_id = ?)");
        $stmt->execute([$friendRowID, $userID, $userID]);
        jsonResponse(['message' => 'Teman dihapus']);
    }

    // Kirim permintaan teman (action = 'send' atau default)
    $rawID = $body['user_id'] ?? $body['target_user_id'] ?? 0;
    $toUserID = is_numeric($rawID) ? (int)$rawID : parseUserCode((string)$rawID);

    if (!$toUserID || $toUserID === $userID) {
        jsonResponse(['error' => 'ID pengguna tidak valid'], 400);
    }

    $stmt = $pdo->prepare("SELECT id FROM users WHERE id = ?");
    $stmt->execute([$toUserID]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Pengguna tidak ditemukan'], 404);
    }

    $stmt = $pdo->prepare("SELECT id, status, from_user_id FROM friends WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)");
    $stmt->execute([$userID, $toUserID, $toUserID, $userID]);
    $existing = $stmt->fetch();
    if ($existing) {
        if ($existing['status'] === 'accepted') {
            jsonResponse(['error' => 'Sudah berteman'], 400);
        } elseif ($existing['status'] === 'pending') {
            jsonResponse(['error' => 'Permintaan sudah terkirim, tunggu konfirmasi'], 400);
        } elseif ($existing['status'] === 'rejected') {
            if ((int)$existing['from_user_id'] === $userID) {
                $pdo->prepare("UPDATE friends SET status = 'pending', created_at = NOW() WHERE id = ?")->execute([$existing['id']]);
            } else {
                $pdo->prepare("UPDATE friends SET status = 'accepted' WHERE id = ?")->execute([$existing['id']]);
                logActivity($userID, 'terima_teman', "User #$toUserID");
                jsonResponse(['message' => 'Pertemanan diterima'], 200);
            }
            logActivity($userID, 'kirim_permintaan_teman', "Kirim ulang ke user #$toUserID");
            jsonResponse(['message' => 'Permintaan terkirim ulang'], 201);
        }
    }

    $stmt = $pdo->prepare("INSERT INTO friends (from_user_id, to_user_id, status) VALUES (?, ?, 'pending')");
    $stmt->execute([$userID, $toUserID]);
    logActivity($userID, 'kirim_permintaan_teman', "Ke user #$toUserID");
    jsonResponse(['message' => 'Permintaan terkirim'], 201);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
