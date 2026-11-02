<?php
declare(strict_types=1);

namespace LeadForge\Services;

use LeadForge\Core\Config;

/**
 * Outbound HTTP client for user-supplied URLs (website checks & audits).
 *
 * SSRF protections:
 *  - only http/https, only ports 80/443, no embedded credentials
 *  - every hostname is resolved and ALL resolved addresses must be public (no private, loopback,
 *    link-local, reserved, CGNAT, multicast or IPv4-mapped private IPv6)
 *  - the connection is pinned to the validated IP (CURLOPT_RESOLVE) to defeat DNS rebinding
 *  - redirects are followed manually (max 4) and every hop is re-validated
 *  - response bodies are capped; transfers abort once the cap is reached
 *  - response bodies are only parsed as text, never executed
 */
final class SafeHttp
{
    public const UA = 'Mozilla/5.0 (compatible; LeadForgeBot/1.0; +https://github.com/ayanjaved791-del/leadforge)';

    /**
     * @return array{ok:bool,status:?int,headers:array<string,string>,body:string,final_url:string,time_ms:int,error:?string,error_code:?string,redirects:int,truncated:bool}
     */
    public static function get(string $url, int $maxBytes = 262144, int $timeout = 10, int $maxRedirects = 4): array
    {
        $started = microtime(true);
        $current = $url;
        $redirects = 0;
        while (true) {
            try {
                [$host, $port, $ip] = self::validate($current);
            } catch (\InvalidArgumentException $e) {
                return self::fail($current, $started, $e->getMessage(), $e->getCode() === 2 ? 'dns' : 'blocked', $redirects);
            }
            $res = self::request($current, $host, $port, $ip, $maxBytes, $timeout);
            if ($res['error'] !== null) return self::fail($current, $started, $res['error'], $res['error_code'], $redirects);

            $status = $res['status'];
            if ($status >= 300 && $status < 400 && isset($res['headers']['location'])) {
                if (++$redirects > $maxRedirects) return self::fail($current, $started, 'Too many redirects', 'redirects', $redirects);
                $current = self::resolveUrl($current, $res['headers']['location']);
                continue;
            }
            return [
                'ok' => true, 'status' => $status, 'headers' => $res['headers'], 'body' => $res['body'],
                'final_url' => $current, 'time_ms' => (int) round((microtime(true) - $started) * 1000),
                'error' => null, 'error_code' => null, 'redirects' => $redirects, 'truncated' => $res['truncated'],
            ];
        }
    }

    /** @return array{0:string,1:int,2:string} host, port, pinned IP */
    public static function validate(string $url): array
    {
        $parts = parse_url($url);
        if (!$parts || empty($parts['host'])) throw new \InvalidArgumentException('Invalid URL');
        $scheme = strtolower($parts['scheme'] ?? '');
        if (!in_array($scheme, ['http', 'https'], true)) throw new \InvalidArgumentException('Only http and https URLs are allowed');
        if (isset($parts['user']) || isset($parts['pass'])) throw new \InvalidArgumentException('URLs with credentials are not allowed');
        $port = (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
        if (!in_array($port, [80, 443], true)) throw new \InvalidArgumentException('Only ports 80 and 443 are allowed');

        $host = strtolower(trim($parts['host'], '[]'));
        if ($host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) {
            throw new \InvalidArgumentException('Internal hostnames are not allowed');
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $ips = [$host];
        } else {
            $ips = gethostbynamel($host) ?: [];
            $aaaa = @dns_get_record($host, DNS_AAAA) ?: [];
            foreach ($aaaa as $r) if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
            if (!$ips) throw new \InvalidArgumentException('Domain does not resolve (DNS lookup failed)', 2);
        }
        foreach ($ips as $ip) {
            if (!self::isPublicIp($ip)) throw new \InvalidArgumentException('Resolves to a private or reserved network address');
        }
        // Prefer IPv4 for pinning.
        $pinned = $ips[0];
        foreach ($ips as $ip) if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) { $pinned = $ip; break; }
        return [$host, $port, $pinned];
    }

    public static function isPublicIp(string $ip): bool
    {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
        $bin = inet_pton($ip);
        if ($bin === false) return false;
        if (strlen($bin) === 16) {
            // IPv4-mapped (::ffff:a.b.c.d) → check embedded IPv4
            if (str_starts_with($bin, str_repeat("\0", 10) . "\xff\xff")) return self::isPublicIp((string) inet_ntop(substr($bin, 12)));
            $first = ord($bin[0]);
            if (($first & 0xfe) === 0xfc) return false;                     // fc00::/7 unique local
            if ($first === 0xfe && (ord($bin[1]) & 0xc0) === 0x80) return false; // fe80::/10 link-local
            if ($first === 0xff) return false;                               // multicast
            return true;
        }
        $long = ip2long($ip);
        $blocked = [
            ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
            ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
            ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
        ];
        foreach ($blocked as [$net, $bits]) {
            $mask = -1 << (32 - $bits);
            if (($long & $mask) === (ip2long($net) & $mask)) return false;
        }
        return true;
    }

    /** @return array{status:int,headers:array<string,string>,body:string,error:?string,error_code:?string,truncated:bool} */
    private static function request(string $url, string $host, int $port, string $ip, int $maxBytes, int $timeout): array
    {
        $body = '';
        $headers = [];
        $truncated = false;
        $ch = curl_init($url);
        $resolveIp = str_contains($ip, ':') ? "[$ip]" : $ip;
        curl_setopt_array($ch, [
            CURLOPT_RESOLVE         => ["$host:$port:$resolveIp"],
            CURLOPT_FOLLOWLOCATION  => false,
            CURLOPT_PROTOCOLS       => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT  => min(6, $timeout),
            CURLOPT_TIMEOUT         => $timeout,
            CURLOPT_USERAGENT       => self::UA,
            CURLOPT_HTTPHEADER      => ['Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language: en'],
            CURLOPT_ENCODING        => '',
            CURLOPT_SSL_VERIFYPEER  => true,
            CURLOPT_SSL_VERIFYHOST  => 2,
            CURLOPT_HEADERFUNCTION  => static function ($ch, string $line) use (&$headers): int {
                if (str_starts_with($line, 'HTTP/')) $headers = [];
                $p = strpos($line, ':');
                if ($p !== false) $headers[strtolower(trim(substr($line, 0, $p)))] = trim(substr($line, $p + 1));
                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION   => static function ($ch, string $chunk) use (&$body, &$truncated, $maxBytes): int {
                $remaining = $maxBytes - strlen($body);
                if ($remaining <= 0) { $truncated = true; return -1; }
                $body .= substr($chunk, 0, $remaining);
                if (strlen($chunk) > $remaining) { $truncated = true; return -1; }
                return strlen($chunk);
            },
        ]);
        $ca = Config::get('http.ca_bundle');
        if (is_string($ca) && $ca !== '') curl_setopt($ch, CURLOPT_CAINFO, $ca);
        curl_exec($ch);
        $errno = curl_errno($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);

        if ($errno && !($truncated && $errno === CURLE_WRITE_ERROR)) {
            $code = match ($errno) {
                CURLE_OPERATION_TIMEDOUT => 'timeout',
                CURLE_COULDNT_RESOLVE_HOST => 'dns',
                CURLE_COULDNT_CONNECT => 'connect',
                CURLE_SSL_CONNECT_ERROR, CURLE_PEER_FAILED_VERIFICATION, 60 => 'tls',
                default => 'network',
            };
            $msg = match ($code) {
                'timeout' => 'The website did not respond in time',
                'dns' => 'Domain does not resolve',
                'connect' => 'Could not connect to the server',
                'tls' => 'TLS/SSL certificate problem',
                default => 'Network error: ' . substr($err, 0, 120),
            };
            return ['status' => $status, 'headers' => $headers, 'body' => '', 'error' => $msg, 'error_code' => $code, 'truncated' => false];
        }
        return ['status' => $status, 'headers' => $headers, 'body' => $body, 'error' => null, 'error_code' => null, 'truncated' => $truncated];
    }

    public static function resolveUrl(string $base, string $rel): string
    {
        if (preg_match('#^https?://#i', $rel)) return $rel;
        $b = parse_url($base);
        $origin = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
        if (str_starts_with($rel, '//')) return $b['scheme'] . ':' . $rel;
        if (str_starts_with($rel, '/')) return $origin . $rel;
        $dir = isset($b['path']) ? preg_replace('#/[^/]*$#', '/', $b['path']) : '/';
        return $origin . $dir . $rel;
    }

    private static function fail(string $url, float $started, string $error, ?string $code, int $redirects): array
    {
        return [
            'ok' => false, 'status' => null, 'headers' => [], 'body' => '', 'final_url' => $url,
            'time_ms' => (int) round((microtime(true) - $started) * 1000), 'error' => $error,
            'error_code' => $code, 'redirects' => $redirects, 'truncated' => false,
        ];
    }

    /** Normalises user/OSM website values into an absolute http(s) URL, or null. */
    public static function normalizeUrl(?string $raw): ?string
    {
        $raw = trim((string) $raw);
        if ($raw === '') return null;
        $raw = explode(';', $raw)[0];
        if (!preg_match('#^https?://#i', $raw)) $raw = 'http://' . ltrim($raw, '/');
        return filter_var($raw, FILTER_VALIDATE_URL) ? $raw : null;
    }
}
