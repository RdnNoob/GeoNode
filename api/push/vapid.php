<?php
require_once dirname(dirname(__DIR__)) . '/api/config.php';

header('Content-Type: application/json');
echo json_encode([
    'publicKey' => 'BKLSQwXALRS92YqtJsjUCZZUhTmUfElrZZc0SCzJ5U9zCKdGpg0CiJIA_-3U2vjdUFC-OAXTyeuMeH7CxA__Nv0'
]);
