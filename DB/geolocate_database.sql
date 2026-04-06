-- ============================================================
-- GeoLocate - Database SQL untuk phpMyAdmin
-- ============================================================
-- CARA IMPORT:
-- 1. Buka phpMyAdmin
-- 2. Buat database baru (misal: geono299_geolocate)  
-- 3. Klik database tersebut
-- 4. Pilih tab Import
-- 5. Pilih file ini dan klik Go
-- ============================================================
-- SETELAH IMPORT:
-- Kunjungi: https://domain-anda.com/admin/setup_admin.php?key=geolocate_setup_2025
-- untuk setup password admin (admin!@#)
-- HAPUS setup_admin.php setelah selesai!
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+07:00";
SET NAMES utf8mb4;

-- Tabel: users
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `kata_sandi` VARCHAR(255) NOT NULL,
  `no_telepon` VARCHAR(20) DEFAULT NULL,
  `avatar_warna` VARCHAR(20) NOT NULL DEFAULT '#22c55e',
  `is_online` TINYINT(1) NOT NULL DEFAULT 0,
  `last_seen` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel: sessions
CREATE TABLE IF NOT EXISTS `sessions` (
  `token` VARCHAR(64) NOT NULL,
  `user_id` INT(11) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`token`),
  KEY `idx_sessions_user_id` (`user_id`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel: friends
CREATE TABLE IF NOT EXISTS `friends` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `from_user_id` INT(11) NOT NULL,
  `to_user_id` INT(11) NOT NULL,
  `status` ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_friends_pair` (`from_user_id`, `to_user_id`),
  KEY `idx_friends_to` (`to_user_id`),
  CONSTRAINT `fk_friends_from` FOREIGN KEY (`from_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_friends_to` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel: messages
CREATE TABLE IF NOT EXISTS `messages` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `from_user_id` INT(11) NOT NULL,
  `to_user_id` INT(11) NOT NULL,
  `encrypted_content` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_messages_from` (`from_user_id`),
  KEY `idx_messages_to` (`to_user_id`),
  KEY `idx_messages_created` (`created_at`),
  CONSTRAINT `fk_messages_from` FOREIGN KEY (`from_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_to` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel: locations
CREATE TABLE IF NOT EXISTS `locations` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL,
  `latitude` DECIMAL(10,8) DEFAULT NULL,
  `longitude` DECIMAL(11,8) DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_locations_user` (`user_id`),
  CONSTRAINT `fk_locations_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel: activity_logs
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) DEFAULT NULL,
  `aksi` VARCHAR(100) NOT NULL,
  `detail` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_logs_user` (`user_id`),
  KEY `idx_logs_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel: public_keys
CREATE TABLE IF NOT EXISTS `public_keys` (
  `user_id` INT(11) NOT NULL,
  `public_key` TEXT NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_keys_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel: admin
CREATE TABLE IF NOT EXISTS `admin` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NOT NULL,
  `kata_sandi` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_admin_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel: admin_sessions
CREATE TABLE IF NOT EXISTS `admin_sessions` (
  `token` VARCHAR(64) NOT NULL,
  `admin_id` INT(11) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`token`),
  KEY `idx_admin_sessions_admin` (`admin_id`),
  CONSTRAINT `fk_admin_sessions_admin` FOREIGN KEY (`admin_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CATATAN PENTING SETELAH IMPORT:
-- Kunjungi /admin/setup_admin.php?key=geolocate_setup_2025
-- untuk membuat akun admin dengan password: admin!@#
-- Hapus file setup_admin.php dari server setelah selesai!
-- ============================================================
