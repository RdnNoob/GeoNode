==========================================================
 GeoLocate - Panduan Setup Database
==========================================================

LANGKAH 1: Buat Database di CWP
---------------------------------
1. Login ke CWP panel
2. Pergi ke MySQL > Create Database
3. Buat database baru (misal: geono299_geolocate)
4. Buat user MySQL dan assign ke database tersebut

LANGKAH 2: Import SQL
---------------------------------
1. Buka phpMyAdmin (port 2087 di CWP)
2. Klik database yang sudah dibuat
3. Klik tab "Import"
4. Pilih file: geolocate_database.sql
5. Klik "Go" / "Import"

LANGKAH 3: Sesuaikan config.php
---------------------------------
Edit file: public_html/api/config.php
Ubah nilai berikut:
  define('DB_HOST', 'localhost');
  define('DB_USER', 'USERNAME_MYSQL_ANDA');
  define('DB_PASS', 'PASSWORD_MYSQL_ANDA');
  define('DB_NAME', 'NAMA_DATABASE_ANDA');

LANGKAH 4: Setup Password Admin
---------------------------------
Setelah upload semua file ke public_html, buka browser:
https://domain-anda.com/admin/setup_admin.php?key=geolocate_setup_2025

Ini akan membuat akun admin:
  Username: admin
  Password: admin!@#

PENTING: Hapus file setup_admin.php setelah berhasil login!

LANGKAH 5: Akses Admin Panel
---------------------------------
URL Login Admin: https://domain-anda.com/admin/login.html
Username: admin
Password: admin!@#

==========================================================
 File yang tersedia di folder DB:
==========================================================
- geolocate_database.sql   : File SQL untuk di-import
- generate_admin_hash.php  : Helper generate hash password
- README.txt               : Panduan ini
==========================================================
