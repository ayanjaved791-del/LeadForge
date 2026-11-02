<?php
/**
 * LeadForge configuration.
 * Copy to config.php and adjust. config.php is git-ignored and never served (see .htaccess).
 */
return [
    'app' => [
        'name'     => 'LeadForge',
        // Public URL of the frontend (used in emailed links).
        'url'      => 'http://localhost:5173',
        'env'      => 'development', // 'production' hides error details
        // Origins allowed to call the API with credentials (only needed when frontend and API are on different origins).
        'cors_origins' => ['http://localhost:5173'],
    ],
    'db' => [
        'host'     => '127.0.0.1',
        'port'     => 3306,
        'database' => 'leadforge',
        'username' => 'root',
        'password' => '',
    ],
    'session' => [
        'name'     => 'leadforge_sid',
        'lifetime' => 60 * 60 * 24 * 7,
        'secure'   => false, // set true when served over HTTPS
    ],
    'mail' => [
        // 'log' writes emails to storage/mail (free, local dev). 'mail' uses PHP mail() (configure sendmail in XAMPP).
        'driver' => 'log',
        'from'   => 'no-reply@leadforge.local',
    ],
    'osm' => [
        // Public Overpass / Nominatim endpoints. Both are free but rate limited — results are cached in MySQL.
        'overpass_url'  => 'https://overpass-api.de/api/interpreter',
        'nominatim_url' => 'https://nominatim.openstreetmap.org',
        // Nominatim requires an identifying User-Agent with contact info.
        'user_agent'    => 'LeadForge/1.0 (self-hosted; contact: admin@example.com)',
        'cache_ttl'     => 60 * 60 * 24, // seconds
        'max_results'   => 300,
    ],
    'limits' => [
        // Free-plan monthly quotas per workspace.
        'discovery_search' => 300,
        'website_check'    => 2000,
        'website_audit'    => 300,
        'lead_export'      => 100,
    ],
];
