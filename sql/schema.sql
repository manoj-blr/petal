-- Petal HTTP Client — Full Database Schema
-- Run: mysql -u root -p < sql/schema.sql

CREATE DATABASE IF NOT EXISTS petal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE petal;

-- Stores named groups of requests (like Postman collections)
CREATE TABLE collections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Stores saved API requests, optionally belonging to a collection
CREATE TABLE saved_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    collection_id INT NULL,
    name VARCHAR(255) NOT NULL,
    method ENUM('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS') DEFAULT 'GET',
    url TEXT NOT NULL,
    headers JSON NULL,
    body TEXT NULL,
    body_type ENUM('none','json','form','raw') DEFAULT 'none',
    params JSON NULL,
    auth       JSON NULL,
    notes      TEXT NULL,
    verify_ssl  TINYINT(1) NOT NULL DEFAULT 1,
    timeout_sec INT        NOT NULL DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
);

-- Stores named environments (e.g. Local, Staging, Production)
CREATE TABLE environments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    is_active TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Stores key=value variables scoped to an environment
CREATE TABLE environment_variables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    environment_id INT NOT NULL,
    var_key VARCHAR(255) NOT NULL,
    var_value TEXT NOT NULL,
    is_secret TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE
);

-- Stores a log of every request sent, with full request + response data
CREATE TABLE request_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    saved_request_id INT NULL,
    method VARCHAR(10) NOT NULL,
    url TEXT NOT NULL,
    request_headers JSON NULL,
    request_body TEXT NULL,
    response_status INT NULL,
    response_headers JSON NULL,
    response_body LONGTEXT NULL,
    response_size_bytes INT NULL,
    duration_ms INT NULL,
    environment_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (saved_request_id) REFERENCES saved_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL
);

-- Stores persistent UI preferences (localStorage is the fast read layer; this is the source of truth)
CREATE TABLE settings (
    key        VARCHAR(100) PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed: default "Local" environment, active by default
INSERT INTO environments (name, is_active) VALUES ('Local', 1);

-- Seed: base_url variable pointing to localhost
INSERT INTO environment_variables (environment_id, var_key, var_value)
VALUES (1, 'base_url', 'http://localhost/petal');

-- Seed: default UI preferences
INSERT INTO settings (key, value) VALUES
    ('layout',          'stacked'),
    ('sidebar_visible', 'true');
