<?php
/**
 * WebSocket Fallback - Polling endpoint
 * Karena CWP shared hosting tidak mendukung WebSocket native,
 * gunakan polling HTTP sebagai alternatif.
 */
require_once dirname(__DIR__) . '/config.php';

$userID = requireAuth();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $since = $_GET['since'] ?? date('Y-m-d H:i:s', time() - 30);
    $friendID = (int)($_GET['friend_id'] ?? 0);

    $data = [];

    // Pesan baru
    if ($friendID) {
        $stmt = $pdo->prepare("SELECT id, from_user_id, to_user_id, encrypted_content, created_at
            FROM messages
            WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
            AND created_at > ? ORDER BY created_at ASC");
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

    // Update lokasi teman
    $stmt = $pdo->prepare("
        SELECT u.id, u.nama, u.avatar_warna, u.is_online, l.latitude, l.longitude
        FROM friends f
        JOIN users u ON (CASE WHEN f.from_user_id = :uid THEN f.to_user_id ELSE f.from_user_id END = u.id)
        LEFT JOIN locations l ON l.user_id = u.id
        WHERE (f.from_user_id = :uid2 OR f.to_user_id = :uid3) AND f.status = 'accepted'
        AND (l.updated_at > :since OR u.is_online != u.is_online)
    ");
    $stmt->execute([':uid' => $userID, ':uid2' => $userID, ':uid3' => $userID, ':since' => $since]);
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
        }
    }

    jsonResponse(['events' => $data, 'timestamp' => date('Y-m-d H:i:s')]);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
