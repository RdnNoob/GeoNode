<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

$userID = requireAuth();
$targetID = (int)($_GET['user_id'] ?? 0);
if (!$targetID) jsonResponse(['error' => 'user_id diperlukan'], 400);

$pdo = getDB();
$stmt = $pdo->prepare("SELECT public_key FROM public_keys WHERE user_id = ?");
$stmt->execute([$targetID]);
$row = $stmt->fetch();
if (!$row) jsonResponse(['error' => 'Kunci tidak ditemukan'], 404);
jsonResponse(['public_key' => $row['public_key']]);
