<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';
require_once dirname(__DIR__) . '/push/send.php';

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
$stmt = $pdo->prepare("SELECT id FROM group_members WHERE group_id = ? AND user_id = ?");
$stmt->execute([$gid, $userID]);
if (!$stmt->fetch()) jsonResponse(['error' => 'Kamu bukan anggota grup ini'], 403);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $after_id = (int)($_GET['after_id'] ?? 0);
    $since = $_GET['since'] ?? null;
    if ($after_id) {
        $stmt = $pdo->prepare("SELECT gm.id, gm.group_id, gm.from_user_id, gm.content, gm.created_at,
            u.nama as from_nama, u.avatar_warna
            FROM group_messages gm JOIN users u ON u.id = gm.from_user_id
            WHERE gm.group_id = ? AND gm.id > ?
            ORDER BY gm.id ASC LIMIT 50");
        $stmt->execute([$gid, $after_id]);
    } elseif ($since) {
        $stmt = $pdo->prepare("SELECT gm.id, gm.group_id, gm.from_user_id, gm.content, gm.created_at,
            u.nama as from_nama, u.avatar_warna
            FROM group_messages gm JOIN users u ON u.id = gm.from_user_id
            WHERE gm.group_id = ? AND gm.created_at > ?
            ORDER BY gm.created_at ASC");
        $stmt->execute([$gid, $since]);
    } else {
        $stmt = $pdo->prepare("SELECT gm.id, gm.group_id, gm.from_user_id, gm.content, gm.created_at,
            u.nama as from_nama, u.avatar_warna
            FROM group_messages gm JOIN users u ON u.id = gm.from_user_id
            WHERE gm.group_id = ?
            ORDER BY gm.created_at ASC LIMIT 100");
        $stmt->execute([$gid]);
    }
    $msgs = $stmt->fetchAll();
    foreach ($msgs as &$msg) {
        $msg['id'] = (int)$msg['id'];
        $msg['group_id'] = (int)$msg['group_id'];
        $msg['from_user_id'] = (int)$msg['from_user_id'];
        $msg['is_mine'] = (int)$msg['from_user_id'] === $userID;
    }
    jsonResponse($msgs);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = getInput();
    $content = trim($body['content'] ?? '');
    if (!$content) jsonResponse(['error' => 'Konten pesan wajib diisi'], 400);
    
    $stmt = $pdo->prepare("INSERT INTO group_messages (group_id, from_user_id, content) VALUES (?, ?, ?)");
    $stmt->execute([$gid, $userID, $content]);
    $msgID = (int)$pdo->lastInsertId();
    
    // Ambil info pengirim
    $stmt2 = $pdo->prepare("SELECT nama, avatar_warna FROM users WHERE id = ?");
    $stmt2->execute([$userID]);
    $sender = $stmt2->fetch();
    
    $stmtGroup = $pdo->prepare("SELECT nama FROM `groups` WHERE id = ?");
    $stmtGroup->execute([$gid]);
    $groupInfo = $stmtGroup->fetch();
    $groupNama = $groupInfo ? $groupInfo['nama'] : 'Grup';

    try {
        sendPushToGroupMembers($gid, $userID, [
            'title' => $groupNama,
            'body' => ($sender['nama'] ?? 'Anggota') . ': ' . mb_substr($content, 0, 100),
            'tag' => 'group-' . $gid,
            'url' => '/app.html',
            'groupId' => $gid,
            'groupNama' => $groupNama
        ]);
    } catch (Exception $e) {}

    jsonResponse([
        'id' => $msgID,
        'group_id' => $gid,
        'from_user_id' => $userID,
        'from_nama' => $sender['nama'],
        'avatar_warna' => $sender['avatar_warna'],
        'content' => $content,
        'created_at' => date('Y-m-d H:i:s'),
        'is_mine' => true
    ], 201);
}

jsonResponse(['error' => 'Method tidak diizinkan'], 405);
