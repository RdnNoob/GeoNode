<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';
require_once __DIR__ . '/WebPush.php';

define('VAPID_PUBLIC_KEY', 'BKLSQwXALRS92YqtJsjUCZZUhTmUfElrZZc0SCzJ5U9zCKdGpg0CiJIA_-3U2vjdUFC-OAXTyeuMeH7CxA__Nv0');
define('VAPID_PRIVATE_KEY', 'SelTnNGOwi6eLXTF5yDLc4qxMCLcBJ2aOAcpj8FJwZk');

function sendPushToUser($targetUserID, $payload) {
    $pdo = getDB();

    $stmt = $pdo->prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?");
    $stmt->execute([$targetUserID]);
    $subs = $stmt->fetchAll();

    if (empty($subs)) return;

    $webpush = new WebPush(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE);

    $expiredIds = [];

    foreach ($subs as $sub) {
        try {
            $result = $webpush->sendNotification(
                $sub['endpoint'],
                $sub['p256dh'],
                $sub['auth'],
                $payloadJson
            );

            if ($result['statusCode'] === 404 || $result['statusCode'] === 410) {
                $expiredIds[] = $sub['id'];
            }
        } catch (Exception $e) {
            error_log("Push notification error for user $targetUserID: " . $e->getMessage());
        }
    }

    if (!empty($expiredIds)) {
        $placeholders = implode(',', array_fill(0, count($expiredIds), '?'));
        $stmt = $pdo->prepare("DELETE FROM push_subscriptions WHERE id IN ($placeholders)");
        $stmt->execute($expiredIds);
    }
}

function sendPushToGroupMembers($groupID, $excludeUserID, $payload) {
    $pdo = getDB();

    $stmt = $pdo->prepare("SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?");
    $stmt->execute([$groupID, $excludeUserID]);
    $members = $stmt->fetchAll();

    foreach ($members as $member) {
        sendPushToUser($member['user_id'], $payload);
    }
}
