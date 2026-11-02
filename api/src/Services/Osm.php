<?php
declare(strict_types=1);

namespace LeadForge\Services;

use LeadForge\Core\Config;
use LeadForge\Core\Database;
use LeadForge\Core\HttpException;

/**
 * OpenStreetMap integration (Nominatim geocoding + Overpass POI search).
 * Both services are free community resources: requests are cached in MySQL, Nominatim is throttled to
 * at most 1 request/second, and an identifying User-Agent is always sent (per their usage policies).
 */
final class Osm
{
    /** @return array{lat:float,lng:float,display_name:string,bbox:?array}|null */
    public static function geocode(string $query): ?array
    {
        $query = trim($query);
        if ($query === '') return null;
        $key = hash('sha256', 'geo|' . mb_strtolower($query));
        $cached = self::cacheGet($key);
        if ($cached !== null) return $cached ?: null;

        self::throttleNominatim();
        $url = rtrim((string) Config::get('osm.nominatim_url'), '/') . '/search?' . http_build_query([
            'q' => $query, 'format' => 'jsonv2', 'limit' => 1, 'addressdetails' => 0,
        ]);
        $raw = self::fetch($url, 'GET', null, 15, 2_000_000);
        $rows = json_decode($raw, true);
        $result = null;
        if (is_array($rows) && isset($rows[0]['lat'])) {
            $result = [
                'lat' => (float) $rows[0]['lat'],
                'lng' => (float) $rows[0]['lon'],
                'display_name' => (string) ($rows[0]['display_name'] ?? $query),
                'bbox' => isset($rows[0]['boundingbox']) ? array_map('floatval', $rows[0]['boundingbox']) : null,
            ];
        }
        self::cachePut($key, 'nominatim', $result ?? [], 60 * 60 * 24 * 30);
        return $result;
    }

    /**
     * @return list<array<string,mixed>> normalised businesses (not yet persisted)
     */
    public static function searchBusinesses(string $category, float $lat, float $lng, int $radius): array
    {
        if (!Categories::exists($category)) throw HttpException::validation(['category' => 'Unknown category.']);
        $radius = max(200, min(10000, $radius));
        $limit = (int) Config::get('osm.max_results', 300);

        $key = hash('sha256', sprintf('ovp|%s|%.4f|%.4f|%d|%d', $category, $lat, $lng, $radius, $limit));
        $cached = self::cacheGet($key);
        if ($cached !== null) return $cached;

        $parts = [];
        foreach (Categories::ALL[$category]['tags'] as [$k, $v]) {
            $parts[] = sprintf('nwr["%s"="%s"]["name"](around:%d,%.6f,%.6f);', $k, $v, $radius, $lat, $lng);
        }
        $ql = "[out:json][timeout:25];(" . implode('', $parts) . ");out center tags $limit;";
        $raw = self::fetch((string) Config::get('osm.overpass_url'), 'POST', http_build_query(['data' => $ql]), 40, 25_000_000);
        $json = json_decode($raw, true);
        if (!is_array($json) || !isset($json['elements'])) {
            throw new HttpException(502, 'OpenStreetMap Overpass returned an unexpected response. Try again shortly.');
        }

        $out = [];
        foreach ($json['elements'] as $el) {
            $b = self::normalize($el, $category);
            if ($b) $out[] = $b;
        }
        self::cachePut($key, 'overpass', $out, (int) Config::get('osm.cache_ttl', 86400));
        return $out;
    }

    /** @param array<string,mixed> $el */
    private static function normalize(array $el, string $category): ?array
    {
        $t = $el['tags'] ?? [];
        $name = trim((string) ($t['name'] ?? ''));
        if ($name === '') return null;
        $lat = $el['lat'] ?? ($el['center']['lat'] ?? null);
        $lng = $el['lon'] ?? ($el['center']['lon'] ?? null);
        if ($lat === null || $lng === null) return null;

        $pick = static function (string ...$keys) use ($t): ?string {
            foreach ($keys as $k) if (!empty($t[$k])) return mb_substr(trim((string) $t[$k]), 0, 490);
            return null;
        };
        $street = trim(implode(' ', array_filter([$t['addr:housenumber'] ?? null, $t['addr:street'] ?? null])));
        $socials = [];
        foreach (['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok', 'whatsapp'] as $net) {
            $v = $pick("contact:$net", $net);
            if ($v) $socials[$net] = $v;
        }
        $email = $pick('email', 'contact:email');
        if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) $email = null;

        return [
            'osm_type' => (string) $el['type'],
            'osm_id' => (int) $el['id'],
            'name' => mb_substr($name, 0, 250),
            'category' => $category,
            'street' => $street !== '' ? mb_substr($street, 0, 250) : $pick('addr:full'),
            'city' => $pick('addr:city', 'addr:town', 'addr:village'),
            'postcode' => $pick('addr:postcode'),
            'country' => $pick('addr:country'),
            'phone' => $pick('phone', 'contact:phone', 'contact:mobile'),
            'website' => $pick('website', 'contact:website', 'url'),
            'email' => $email,
            'socials' => $socials,
            'opening_hours' => $pick('opening_hours'),
            'lat' => (float) $lat,
            'lng' => (float) $lng,
            'raw_tags' => $t,
        ];
    }

    private static function fetch(string $url, string $method, ?string $body, int $timeout, int $maxBytes): string
    {
        $ch = curl_init($url);
        $buf = '';
        curl_setopt_array($ch, [
            CURLOPT_USERAGENT => (string) Config::get('osm.user_agent', 'LeadForge/1.0'),
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_ENCODING => '',
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$buf, $maxBytes): int {
                if (strlen($buf) + strlen($chunk) > $maxBytes) return -1;
                $buf .= $chunk;
                return strlen($chunk);
            },
        ]);
        if ($method === 'POST') { curl_setopt($ch, CURLOPT_POST, true); curl_setopt($ch, CURLOPT_POSTFIELDS, $body); }
        $ca = Config::get('http.ca_bundle');
        if (is_string($ca) && $ca !== '') curl_setopt($ch, CURLOPT_CAINFO, $ca);
        curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $errno = curl_errno($ch);
        if ($errno) throw new HttpException(502, 'Could not reach OpenStreetMap services. Check your internet connection.');
        if ($status === 429) throw new HttpException(429, 'OpenStreetMap rate limit reached. Please wait a minute before searching again.');
        if ($status === 504) throw new HttpException(504, 'Overpass API is busy. Try a smaller radius or retry shortly.');
        if ($status >= 400) throw new HttpException(502, "OpenStreetMap service error (HTTP $status).");
        return $buf;
    }

    private static function throttleNominatim(): void
    {
        $lockFile = Config::get('app.storage_path') . '/nominatim.lock';
        $fh = fopen($lockFile, 'c+');
        if (!$fh) return;
        flock($fh, LOCK_EX);
        $last = (float) stream_get_contents($fh);
        $wait = 1.05 - (microtime(true) - $last);
        if ($wait > 0) usleep((int) ($wait * 1_000_000));
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, (string) microtime(true));
        flock($fh, LOCK_UN);
        fclose($fh);
    }

    private static function cacheGet(string $key): mixed
    {
        $row = Database::one('SELECT payload FROM api_cache WHERE cache_key = ? AND expires_at > UTC_TIMESTAMP()', [$key]);
        return $row ? json_decode($row['payload'], true) : null;
    }

    private static function cachePut(string $key, string $source, mixed $payload, int $ttl): void
    {
        Database::run('REPLACE INTO api_cache (cache_key, source, payload, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
            [$key, $source, json_encode($payload, JSON_UNESCAPED_UNICODE), $ttl]);
        if (random_int(1, 50) === 1) Database::run('DELETE FROM api_cache WHERE expires_at < UTC_TIMESTAMP()');
    }
}
