<?php
class WebPush {
    private $publicKey;
    private $privateKey;
    private $subject;

    public function __construct($publicKey, $privateKey, $subject = 'mailto:admin@geonode.gt.tc') {
        $this->publicKey = $publicKey;
        $this->privateKey = $privateKey;
        $this->subject = $subject;
    }

    public function sendNotification($endpoint, $p256dh, $auth, $payload) {
        $payloadJson = is_string($payload) ? $payload : json_encode($payload, JSON_UNESCAPED_UNICODE);

        $encrypted = null;
        $useEncrypted = false;

        if (function_exists('openssl_pkey_derive')) {
            try {
                $encrypted = $this->encryptPayload($payloadJson, $p256dh, $auth);
                $useEncrypted = true;
            } catch (Exception $e) {
                error_log("WebPush encryption failed, sending without payload: " . $e->getMessage());
            }
        }

        $jwt = $this->createVapidJwt($endpoint);

        $headers = [
            'TTL: 86400',
            'Urgency: high',
            'Authorization: vapid t=' . $jwt . ', k=' . $this->publicKey,
        ];

        if ($useEncrypted && $encrypted) {
            $headers[] = 'Content-Type: application/octet-stream';
            $headers[] = 'Content-Encoding: aes128gcm';
            $headers[] = 'Content-Length: ' . strlen($encrypted);
            $body = $encrypted;
        } else {
            $headers[] = 'Content-Length: 0';
            $body = '';
        }

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        return [
            'success' => $httpCode >= 200 && $httpCode < 300,
            'statusCode' => $httpCode,
            'response' => $response,
            'error' => $error,
            'encrypted' => $useEncrypted,
        ];
    }

    private function encryptPayload($payload, $p256dh, $auth) {
        $userPublicKey = self::base64urlDecode($p256dh);
        $userAuth = self::base64urlDecode($auth);

        $localKey = openssl_pkey_new([
            'curve_name' => 'prime256v1',
            'private_key_type' => OPENSSL_KEYTYPE_EC,
        ]);
        if (!$localKey) throw new Exception('Failed to generate local key');

        $localKeyDetails = openssl_pkey_get_details($localKey);
        $localPublicKeyRaw = $this->extractPublicKeyRaw($localKeyDetails);

        $sharedSecret = $this->computeSharedSecret($localKey, $userPublicKey);

        $salt = random_bytes(16);

        $authInfo = "Content-Encoding: auth\x00";
        $ikm = $this->hkdf($userAuth, $sharedSecret, $authInfo, 32);

        $keyInfo = $this->createKeyInfo($userPublicKey, $localPublicKeyRaw);
        $nonceInfo = $this->createNonceInfo($userPublicKey, $localPublicKeyRaw);

        $cek = $this->hkdf($salt, $ikm, $keyInfo, 16);
        $nonce = $this->hkdf($salt, $ikm, $nonceInfo, 12);

        $paddedPayload = "\x02\x00" . $payload;

        $tag = '';
        $encrypted = openssl_encrypt(
            $paddedPayload,
            'aes-128-gcm',
            $cek,
            OPENSSL_RAW_DATA,
            $nonce,
            $tag,
            '',
            16
        );

        if ($encrypted === false) throw new Exception('AES-GCM encryption failed');

        $recordSize = 4096;
        $result = $salt
                . pack('N', $recordSize)
                . chr(strlen($localPublicKeyRaw))
                . $localPublicKeyRaw
                . $encrypted . $tag;

        return $result;
    }

    private function createKeyInfo($clientPublicKey, $serverPublicKey) {
        return "Content-Encoding: aes128gcm\x00"
             . "P-256\x00"
             . pack('n', strlen($clientPublicKey)) . $clientPublicKey
             . pack('n', strlen($serverPublicKey)) . $serverPublicKey;
    }

    private function createNonceInfo($clientPublicKey, $serverPublicKey) {
        return "Content-Encoding: nonce\x00"
             . "P-256\x00"
             . pack('n', strlen($clientPublicKey)) . $clientPublicKey
             . pack('n', strlen($serverPublicKey)) . $serverPublicKey;
    }

    private function createVapidJwt($endpoint) {
        $parsedUrl = parse_url($endpoint);
        $audience = $parsedUrl['scheme'] . '://' . $parsedUrl['host'];

        $header = self::base64urlEncode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $payload = self::base64urlEncode(json_encode([
            'aud' => $audience,
            'exp' => time() + 43200,
            'sub' => $this->subject,
        ]));

        $signingInput = $header . '.' . $payload;
        $privateKeyPem = $this->buildPrivateKeyPem();
        $key = openssl_pkey_get_private($privateKeyPem);

        if (!$key) throw new Exception('Invalid VAPID private key');

        openssl_sign($signingInput, $derSig, $key, OPENSSL_ALGO_SHA256);
        $rawSig = $this->derToRaw($derSig);

        return $signingInput . '.' . self::base64urlEncode($rawSig);
    }

    private function buildPrivateKeyPem() {
        $privBytes = self::base64urlDecode($this->privateKey);
        $pubBytes = self::base64urlDecode($this->publicKey);

        $der = "\x30\x77"
             . "\x02\x01\x01"
             . "\x04\x20" . $privBytes
             . "\xa0\x0a\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07"
             . "\xa1\x44\x03\x42\x00" . $pubBytes;

        return "-----BEGIN EC PRIVATE KEY-----\n"
             . chunk_split(base64_encode($der), 64, "\n")
             . "-----END EC PRIVATE KEY-----\n";
    }

    private function derToRaw($der) {
        $pos = 0;
        if (ord($der[$pos]) !== 0x30) return $der;
        $pos += 2;

        if (ord($der[$pos]) !== 0x02) return $der;
        $pos++;
        $rLen = ord($der[$pos]);
        $pos++;
        $r = substr($der, $pos, $rLen);
        $pos += $rLen;

        if (ord($der[$pos]) !== 0x02) return $der;
        $pos++;
        $sLen = ord($der[$pos]);
        $pos++;
        $s = substr($der, $pos, $sLen);

        $r = ltrim($r, "\x00");
        $s = ltrim($s, "\x00");
        $r = str_pad($r, 32, "\x00", STR_PAD_LEFT);
        $s = str_pad($s, 32, "\x00", STR_PAD_LEFT);

        return $r . $s;
    }

    private function extractPublicKeyRaw($keyDetails) {
        $x = str_pad($keyDetails['ec']['x'], 32, "\x00", STR_PAD_LEFT);
        $y = str_pad($keyDetails['ec']['y'], 32, "\x00", STR_PAD_LEFT);
        return "\x04" . $x . $y;
    }

    private function computeSharedSecret($localPrivateKey, $remotePublicKeyRaw) {
        $remotePublicKeyPem = $this->rawPublicKeyToPem($remotePublicKeyRaw);
        $remotePubKeyRes = openssl_pkey_get_public($remotePublicKeyPem);
        
        if (!$remotePubKeyRes) {
            throw new Exception('Failed to parse remote public key');
        }

        $sharedSecret = openssl_pkey_derive($localPrivateKey, $remotePubKeyRes, 256);

        if ($sharedSecret === false) {
            throw new Exception('Failed to derive shared secret');
        }

        return $sharedSecret;
    }

    private function rawPublicKeyToPem($rawKey) {
        $der = "\x30\x59"
             . "\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07"
             . "\x03\x42\x00" . $rawKey;

        return "-----BEGIN PUBLIC KEY-----\n"
             . chunk_split(base64_encode($der), 64, "\n")
             . "-----END PUBLIC KEY-----\n";
    }

    private function hkdf($salt, $ikm, $info, $length) {
        if (empty($salt)) $salt = str_repeat("\x00", 32);
        $prk = hash_hmac('sha256', $ikm, $salt, true);
        $t = '';
        $lastBlock = '';
        $counter = 1;
        while (strlen($t) < $length) {
            $lastBlock = hash_hmac('sha256', $lastBlock . $info . chr($counter), $prk, true);
            $t .= $lastBlock;
            $counter++;
        }
        return substr($t, 0, $length);
    }

    public static function base64urlEncode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function base64urlDecode($data) {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
    }
}
