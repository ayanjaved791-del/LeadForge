<?php
declare(strict_types=1);

/**
 * Applies SQL migrations in database/migrations in order.
 *
 *   php bin/migrate.php                     (uses api/config.php, or environment variables)
 *   DB_HOST=... DB_PORT=4000 DB_USER=... DB_PASSWORD=... DB_NAME=leadforge DB_SSL=true php bin/migrate.php
 *
 * In XAMPP: C:\xampp\php\php.exe bin\migrate.php — or import the .sql files with phpMyAdmin.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require __DIR__ . '/../bootstrap.php';

use LeadForge\Core\Config;
use LeadForge\Core\Database;

$pdo = Database::connect(false);
$name = str_replace('`', '', (string) Config::get('db.database'));
$pdo->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("USE `$name`");
$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');

$applied = $pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
$files = glob(__DIR__ . '/../../database/migrations/*.sql');
sort($files);
foreach ($files as $file) {
    $version = basename($file, '.sql');
    if (in_array($version, $applied, true)) { echo "  skip  $version\n"; continue; }
    // Run statement by statement (some hosted MySQL services disallow multi-statement queries).
    $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
    foreach (array_filter(array_map('trim', explode(";\n", str_replace("\r\n", "\n", $sql)))) as $statement) {
        $pdo->exec(rtrim($statement, ';'));
    }
    $pdo->prepare('INSERT INTO schema_migrations (version) VALUES (?)')->execute([$version]);
    echo "  apply $version\n";
}
echo "Database is up to date.\n";
