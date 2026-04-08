<?php
/**
 * WebSocket Fallback - Polling endpoint (v2)
 * Polling tiap 3 detik untuk update lokasi & pesan
 */
require_once dirname(__DIR__) . '/config.php';

$userID = requireAuth();
$pdo = getDB();

// Update last_seen & is_online
try {
    $pdo->prepare("UPDATE users SET is_online = 1, last_seen = NOW() WHERE id = ?")->execute([$userID]);
} catch (Exception $e) {}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $since = $_GET['since'] ?? date('Y-m-d H:i:s', time() - 10);
    $friendID = (int)($_GET['friend_id'] ?? 0);
    $groupID = (int)($_GET['group_id'] ?? 0);

    $data = [];

    // Pesan baru dari teman aktif
    if ($friendID) {
        $stmt = $pdo->prepare("SELECT id, from_user_id, to_user_id, encrypted_content, created_at
            FROM messages
            WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
            AND created_at > ? ORDER BY created_at ASC LIMIT 50");
        $stmt->execute([$userID, $friendID, $friendID, $userID, $since]);
        $msgs = $stmt->fetchAll();
        foreach ($msgs as $m) {
            $data[] = [
                'type' => 'new_message',
                'payload' => [
                    'id' => (int)$m['id'],
                    'from_user_id' => (int)$m['from_user_id'],
                    'to_user_id' => (int)$m['to_user_id'],
                    'encrypted_content' => $m['encrypted_content'],
                    'created_at' => $m['created_at'],
                    'is_mine' => (int)$m['from_user_id'] === $userID,
                ]
            ];
        }
    }
    
    // Pesan baru dari group aktif
    if ($groupID) {
        // Cek keanggotaan
        $stmtCheck = $pdo->prepare("SELECT id FROM group_members WHERE group_id = ? AND user_id = ?");
        $stmtCheck->execute([$groupID, $userID]);
        if ($stmtCheck->fetch()) {
            try {
                $stmt = $pdo->prepare("SELECT gm.id, gm.group_id, gm.from_user_id, gm.content, gm.created_at,
                    u.nama as from_nama, u.avatar_warna
                    FROM group_messages gm JOIN users u ON u.id = gm.from_user_id
                    WHERE gm.group_id = ? AND gm.created_at > ? AND gm.from_user_id != ?
                    ORDER BY gm.created_at ASC LIMIT 50");
                $stmt->execute([$groupID, $since, $userID]);
                $gmsgs = $stmt->fetchAll();
                foreach ($gmsgs as $gm) {
                    $data[] = [
                        'type' => 'group_message',
                        'payload' => [
                            'id' => (int)$gm['id'],
                            'group_id' => (int)$gm['group_id'],
                            'from_user_id' => (int)$gm['from_user_id'],
                            'from_nama' => $gm['from_nama'],
                            'avatar_warna' => $gm['avatar_warna'],
                            'content' => $gm['content'],
                            'created_at' => $gm['created_at'],
                            'is_mine' => false
                        ]
                    ];
                }
            } catch (Exception $e) {}
        }
    }

    // Notif permintaan teman baru (pending)
    try {
        $stmtReq = $pdo->prepare("SELECT f.id, f.from_user_id, u.nama, u.avatar_warna
            FROM friends f JOIN users u ON u.id = f.from_user_id
            WHERE f.to_user_id = ? AND f.status = 'pending' AND f.created_at > ?");
        $stmtReq->execute([$userID, $since]);
        $newReqs = $stmtReq->fetchAll();
        foreach ($newReqs as $req) {
            $data[] = [
                'type' => 'friend_request',
                'payload' => [
                    'id' => (int)$req['id'],
                    'from_user_id' => (int)$req['from_user_id'],
                    'from_nama' => $req['nama'],
                ]
            ];
        }
    } catch (Exception $e) {}

    // Notif pesan dari teman lain (unread)
    $stmt = $pdo->prepare("SELECT DISTINCT from_user_id FROM messages
        WHERE to_user_id = ? AND created_at > ? AND from_user_id != ?
        ORDER BY created_at DESC");
    $stmt->execute([$userID, $since, $friendID ?: 0]);
    $unread = $stmt->fetchAll();
    foreach ($unread as $u) {
        $data[] = [
            'type' => 'unread_message',
            'payload' => ['from_user_id' => (int)$u['from_user_id']]
        ];
    }

    // Update lokasi semua teman (SEMUA, bukan hanya yang berubah - untuk fix bug pertama)
    $stmt = $pdo->prepare("
        SELECT u.id, u.nama, u.avatar_warna, u.is_online, l.latitude, l.longitude, l.updated_at
        FROM friends f
        JOIN users u ON (CASE WHEN f.from_user_id = :uid THEN f.to_user_id ELSE f.from_user_id END = u.id)
        LEFT JOIN locations l ON l.user_id = u.id
        WHERE (f.from_user_id = :uid2 OR f.to_user_id = :uid3) AND f.status = 'accepted'
    ");
    $stmt->execute([':uid' => $userID, ':uid2' => $userID, ':uid3' => $userID]);
    $locs = $stmt->fetchAll();
    foreach ($locs as $l) {
        if ($l['latitude'] && $l['longitude']) {
            $data[] = [
                'type' => 'location_update',
                'payload' => [
                    'user_id' => (int)$l['id'],
                    'nama' => $l['nama'],
                    'latitude' => (float)$l['latitude'],
                    'longitude' => (float)$l['longitude'],
                    'is_online' => (bool)$l['is_online'],
                    'avatar_warna' => $l['avatar_warna'],
                ]
            ];
        } else {
            // User offline / no location
            $data[] = [
                'type' => 'user_status',
                'payload' => [
                    'user_id' => (int)$l['id'],
                    'is_online' => (bool)$l['is_online'],
                ]
            ];
        }
    }

    jsonResponse(['events' => $data, 'timestamp' => date('Y-m-d H:i:s')]);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
