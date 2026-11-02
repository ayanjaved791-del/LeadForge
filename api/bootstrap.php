<?php
declare(strict_types=1);

/** Shared bootstrap for the web front controller and CLI scripts. */
spl_autoload_register(static function (string $class): void {
    $prefix = 'LeadForge\\';
    if (!str_starts_with($class, $prefix)) return;
    $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) require $file;
});

// config.php (XAMPP) wins; otherwise everything comes from environment variables (Vercel).
$cfg = is_file(__DIR__ . '/config.php') ? __DIR__ . '/config.php' : __DIR__ . '/config.example.php';
\LeadForge\Core\Config::load(require $cfg);

$storage = (string) \LeadForge\Core\Config::get('app.storage_path');
foreach (['', '/mail', '/logs'] as $sub) {
    if (!is_dir($storage . $sub)) @mkdir($storage . $sub, 0775, true);
}
date_default_timezone_set('UTC');
