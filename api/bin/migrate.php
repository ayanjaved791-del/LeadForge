<?php
declare(strict_types=1);

/**
 * Applies SQL migrations in database/migrations in order. Usage (from the api/ folder):
 *   php bin/migrate.php
 * In XAMPP: C:\xampp\php\php.exe bin\migrate.php
 * Alternatively import the .sql files with phpMyAdmin.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$config = require __DIR__ . '/../config.php';
$db = $config['db'];
$pdo = new PDO(sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $db['host'], $db['port']), $db['username'], $db['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$name = str_replace('`', '', $db['database']);
$pdo->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("USE `$name`");
$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');

$applied = $pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
$files = glob(__DIR__ . '/../../database/migrations/*.sql');
sort($files);
foreach ($files as $file) {
    $version = basename($file, '.sql');
    if (in_array($version, $applied, true)) { echo "  skip  $version\n"; continue; }
    $pdo->exec(file_get_contents($file));
    $pdo->prepare('INSERT INTO schema_migrations (version) VALUES (?)')->execute([$version]);
    echo "  apply $version\n";
}
echo "Database is up to date.\n";
