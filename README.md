# GeoNode — Backend Server 🗺️

Backend PHP + MySQL untuk aplikasi GeoNode. Menyediakan REST API untuk autentikasi, pelacakan lokasi real-time, pertemanan, chat, dan grup.

## Fitur API

- **Auth** — Register, login, logout, cek sesi
- **Lokasi** — Update & ambil lokasi teman secara real-time
- **Pertemanan** — Kirim/terima/tolak permintaan teman via kode unik
- **Chat** — Pesan langsung antar pengguna
- **Grup** — Buat grup, kirim pesan grup, lihat lokasi anggota di peta
- **Admin Panel** — Dashboard statistik, manajemen user, maintenance mode
- **Push Notification** — Web Push via VAPID

## Tech Stack

- PHP 8+
- MySQL / MariaDB
- PDO (prepared statements)
- Session-based auth dengan Bearer Token
- Web Push (VAPID)

## Struktur Folder

```
/
├── api/
│   ├── config.php          ← Konfigurasi database (wajib diisi)
│   ├── auth/               ← Login, register, logout, me
│   ├── friends/            ← Manajemen pertemanan
│   ├── location/           ← Update & ambil lokasi
│   ├── chat/               ← Pesan langsung
│   ├── groups/             ← Grup & pesan grup
│   ├── push/               ← Web Push notification
│   ├── ws/                 ← Polling events
│   └── admin/              ← API khusus admin
├── admin/                  ← Halaman admin panel (HTML)
├── DB/
│   ├── geolocate_database.sql  ← File SQL untuk di-import
│   └── README.txt              ← Panduan setup database
├── js/                     ← Frontend JavaScript (PWA web)
├── css/                    ← Stylesheet
├── index.html              ← Halaman utama (PWA)
└── .htaccess               ← Konfigurasi Apache
```

## Cara Deploy

### 1. Upload File
Upload semua isi folder ini ke `public_html` di hosting kamu (cPanel, CWP, dll).

### 2. Buat Database
1. Buka **phpMyAdmin** di panel hosting
2. Buat database baru
3. Import file `DB/geolocate_database.sql`

### 3. Konfigurasi Database
Edit file `api/config.php`, isi dengan data database kamu:
```php
define('DB_HOST', 'localhost');
define('DB_USER', 'username_mysql_kamu');
define('DB_PASS', 'password_mysql_kamu');
define('DB_NAME', 'nama_database_kamu');
```

### 4. Setup Admin
Buka browser dan akses:
```
https://domain-kamu.com/admin/setup_admin.php?key=geolocate_setup_2025
```
Akun admin default:
- Username: `admin`
- Password: `admin!@#`

> ⚠️ **Hapus file `setup_admin.php` setelah berhasil login!**

### 5. Akses Admin Panel
```
https://domain-kamu.com/admin/login.html
```

## Endpoint API Utama

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| POST | `/api/auth/register` | Daftar akun baru |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Info user aktif |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/friends` | Daftar teman |
| POST | `/api/friends` | Tambah teman via kode |
| GET | `/api/friends/requests` | Permintaan teman masuk |
| POST | `/api/location/update` | Update lokasi |
| GET | `/api/location/friends` | Lokasi semua teman |
| GET | `/api/chat/messages?friend_id=X` | Ambil pesan |
| POST | `/api/chat/messages` | Kirim pesan |
| GET | `/api/groups` | Daftar grup |
| POST | `/api/groups` | Buat grup baru |

## Keamanan

> ⚠️ **Jangan pernah push `config.php` dengan kredensial asli ke GitHub!**
> Gunakan placeholder seperti yang ada di file ini, lalu isi kredensial langsung di server hosting.

## Mobile App

Lihat repo mobile app-nya di: [RdnNoob/GApps](https://github.com/RdnNoob/GApps)
