<?php
define('DB_HOST', 'localhost');
define('DB_USER', 'geono299_RDens2002');
define('DB_PASS', 'i0K7d4dEHkJC!@#');
define('DB_NAME', 'geono299_RDens2002');

define('SESSION_DURATION', 86400);
define('ADMIN_SESSION_DURATION', 3600);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Koneksi database gagal: ' . $e->getMessage()]);
            exit;
        }
    }
    return $pdo;
}

function jsonResponse($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function generateToken() {
    return bin2hex(random_bytes(32));
}

function getUserIDFromRequest() {
    $token = getTokenFromRequest();
    if (!$token) return null;

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?");
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    if (!$row || strtotime($row['expires_at']) < time()) {
        return null;
    }
    return (int)$row['user_id'];
}

function getTokenFromRequest() {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (str_starts_with($auth, 'Bearer ')) {
        return substr($auth, 7);
    }
    return $_COOKIE['session_token'] ?? null;
}

function requireAuth() {
    $userID = getUserIDFromRequest();
    if (!$userID) {
        jsonResponse(['error' => 'Autentikasi diperlukan'], 401);
    }
    return $userID;
}

function getAdminIDFromRequest() {
    $token = getTokenFromRequest();
    if (!$token) return null;

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT admin_id, expires_at FROM admin_sessions WHERE token = ?");
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    if (!$row || strtotime($row['expires_at']) < time()) {
        return null;
    }
    return (int)$row['admin_id'];
}

function requireAdmin() {
    $adminID = getAdminIDFromRequest();
    if (!$adminID) {
        jsonResponse(['error' => 'Akses admin diperlukan'], 401);
    }
    return $adminID;
}

function logActivity($userID, $aksi, $detail = '') {
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("INSERT INTO activity_logs (user_id, aksi, detail) VALUES (?, ?, ?)");
        $stmt->execute([$userID, $aksi, $detail ?: null]);
    } catch (Exception $e) {}
}

function logActivityAnon($aksi, $detail = '') {
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("INSERT INTO activity_logs (aksi, detail) VALUES (?, ?)");
        $stmt->execute([$aksi, $detail ?: null]);
    } catch (Exception $e) {}
}

function getInput() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}
