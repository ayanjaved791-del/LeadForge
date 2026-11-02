<?php
/**
 * LeadForge configuration.
 *
 * XAMPP: copy this file to config.php and edit the defaults below.
 * Vercel / any host: leave config.php absent and set the environment variables named below
 * (DB_HOST, DB_NAME, …). config.php is git-ignored and never served.
 */
$env = static function (string $key, mixed $default = null): mixed {
    $v = getenv($key);
    if ($v === false || $v === '') return $default;
    return match (strtolower($v)) { 'true' => true, 'false' => false, default => $v };
};
$onVercel = (bool) getenv('VERCEL');
$vercelUrl = getenv('VERCEL_PROJECT_PRODUCTION_URL') ?: getenv('VERCEL_URL');

return [
    'app' => [
        'name'     => 'LeadForge',
        // Public URL of the frontend (used in emailed links).
        'url'      => $env('APP_URL', $vercelUrl ? "https://$vercelUrl" : 'http://localhost:5173'),
        'env'      => $env('APP_ENV', $onVercel ? 'production' : 'development'), // 'production' hides error details
        // Origins allowed to call the API with credentials (only needed when frontend and API are on different origins).
        'cors_origins' => array_filter(explode(',', (string) $env('CORS_ORIGINS', 'http://localhost:5173'))),
        // Behind a reverse proxy (Vercel) the client IP comes from X-Real-IP / X-Forwarded-For.
        'trust_proxy'  => (bool) $env('TRUST_PROXY', $onVercel),
        // Writable directory for logs, dev mail and locks. Serverless hosts only allow /tmp.
        'storage_path' => $env('STORAGE_PATH', $onVercel ? '/tmp/leadforge' : __DIR__ . '/storage'),
    ],
    'db' => [
        'host'     => $env('DB_HOST', '127.0.0.1'),
        'port'     => (int) $env('DB_PORT', 3306),
        'database' => $env('DB_NAME', 'leadforge'),
        'username' => $env('DB_USER', 'root'),
        'password' => $env('DB_PASSWORD', ''),
        // Hosted MySQL (TiDB Cloud, Aiven, PlanetScale…) requires TLS.
        'ssl'      => (bool) $env('DB_SSL', false),
        'ssl_ca'   => $env('DB_SSL_CA', ''), // empty = system CA bundle
    ],
    'session' => [
        'name'     => 'leadforge_sid',
        'lifetime' => 60 * 60 * 24 * 7,
        'secure'   => (bool) $env('SESSION_SECURE', $onVercel), // true when served over HTTPS
        // 'files' (XAMPP) or 'database' (required on serverless hosts such as Vercel).
        'driver'   => $env('SESSION_DRIVER', $onVercel ? 'database' : 'files'),
    ],
    'mail' => [
        // 'log'  → writes emails to storage/mail (free, local dev)
        // 'smtp' → any SMTP server (free tiers: Brevo, Gmail app password, …)
        // 'mail' → PHP mail()/sendmail
        'driver'   => $env('MAIL_DRIVER', 'log'),
        'from'     => $env('MAIL_FROM', 'no-reply@leadforge.local'),
        'host'     => $env('SMTP_HOST', ''),
        'port'     => (int) $env('SMTP_PORT', 587),
        'username' => $env('SMTP_USER', ''),
        'password' => $env('SMTP_PASSWORD', ''),
        'secure'   => $env('SMTP_SECURE', 'tls'), // 'tls' (STARTTLS, port 587) or 'ssl' (port 465)
    ],
    'osm' => [
        // Public Overpass / Nominatim endpoints. Both are free but rate limited — results are cached in MySQL.
        'overpass_url'  => $env('OVERPASS_URL', 'https://overpass-api.de/api/interpreter'),
        'nominatim_url' => $env('NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
        // Nominatim requires an identifying User-Agent with contact info.
        'user_agent'    => $env('OSM_USER_AGENT', 'LeadForge/1.0 (self-hosted; contact: admin@example.com)'),
        'cache_ttl'     => 60 * 60 * 24, // seconds
        'max_results'   => 300,
    ],
    'limits' => [
        // Free-plan monthly quotas per workspace.
        'discovery_search' => (int) $env('LIMIT_DISCOVERY', 300),
        'website_check'    => (int) $env('LIMIT_WEBSITE_CHECK', 2000),
        'website_audit'    => (int) $env('LIMIT_AUDIT', 300),
        'lead_export'      => (int) $env('LIMIT_EXPORT', 100),
    ],
];
