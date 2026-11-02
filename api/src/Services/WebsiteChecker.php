<?php
declare(strict_types=1);

namespace LeadForge\Services;

/**
 * Cautious website status classification.
 *
 *   available     — a listed website answered with a successful response
 *   no_website    — no website is listed in OpenStreetMap and no social profile either.
 *                   NOTE: this is NOT proof that the business has no website; the UI says so.
 *   inactive      — a listed website is unreachable (DNS failure, connection refused, 404/410/5xx)
 *   needs_review  — ambiguous: bot protection (401/403/429), timeouts, parked domains,
 *                   social-only presence, or a URL pointing at a private network
 *   unknown       — a website is listed but has not been checked yet
 */
final class WebsiteChecker
{
    public const LABELS = [
        'available' => 'Website Available',
        'no_website' => 'No Website Found',
        'inactive' => 'Website Inactive',
        'needs_review' => 'Needs Review',
        'unknown' => 'Unknown',
    ];

    /** Classification from OSM data alone (no network). @return array{status:string,note:string} */
    public static function initial(?string $website, array $socials): array
    {
        if ($website && SafeHttp::normalizeUrl($website)) {
            return ['status' => 'unknown', 'note' => 'Website listed in OpenStreetMap — not verified yet.'];
        }
        if ($socials) {
            return ['status' => 'needs_review', 'note' => 'No website listed, but social profiles exist. The business may use social media instead of a website.'];
        }
        return ['status' => 'no_website', 'note' => 'No website listed in OpenStreetMap. This is not proof that none exists — verify before outreach.'];
    }

    /** @return array{status:string,http_status:?int,note:string,final_url:?string,time_ms:int} */
    public static function check(string $website): array
    {
        $url = SafeHttp::normalizeUrl($website);
        if (!$url) return ['status' => 'needs_review', 'http_status' => null, 'note' => 'Listed website value is not a valid URL.', 'final_url' => null, 'time_ms' => 0];

        $res = SafeHttp::get($url, 65536, 10);
        // Some servers refuse plain http but serve https (or vice versa) — retry once with the other scheme.
        if (!$res['ok'] && in_array($res['error_code'], ['connect', 'tls'], true)) {
            $alt = str_starts_with($url, 'https://') ? 'http://' . substr($url, 8) : 'https://' . substr($url, 7);
            $retry = SafeHttp::get($alt, 65536, 10);
            if ($retry['ok']) $res = $retry;
        }

        if (!$res['ok']) {
            [$status, $note] = match ($res['error_code']) {
                'dns' => ['inactive', 'Domain does not resolve — the website appears to be offline or expired.'],
                'connect' => ['inactive', 'Server refused the connection.'],
                'blocked' => ['needs_review', 'Not checked: ' . $res['error'] . '.'],
                'timeout' => ['needs_review', 'The website did not respond within 10 seconds.'],
                'tls' => ['needs_review', 'TLS/SSL certificate problem — site may be misconfigured.'],
                default => ['needs_review', (string) $res['error']],
            };
            return ['status' => $status, 'http_status' => null, 'note' => $note, 'final_url' => null, 'time_ms' => $res['time_ms']];
        }

        $code = (int) $res['status'];
        if ($code >= 200 && $code < 300) {
            $lower = strtolower(substr($res['body'], 0, 65536));
            foreach (['this domain is for sale', 'domain is parked', 'buy this domain', 'parkingcrew', 'sedoparking', 'domain may be for sale'] as $needle) {
                if (str_contains($lower, $needle)) {
                    return ['status' => 'needs_review', 'http_status' => $code, 'note' => 'Domain responds but looks parked or for sale.', 'final_url' => $res['final_url'], 'time_ms' => $res['time_ms']];
                }
            }
            return ['status' => 'available', 'http_status' => $code, 'note' => "Responded with HTTP $code in {$res['time_ms']} ms.", 'final_url' => $res['final_url'], 'time_ms' => $res['time_ms']];
        }
        if (in_array($code, [401, 403, 429, 503], true)) {
            return ['status' => 'needs_review', 'http_status' => $code, 'note' => "HTTP $code — the site may block automated checks. Verify manually.", 'final_url' => $res['final_url'], 'time_ms' => $res['time_ms']];
        }
        return ['status' => 'inactive', 'http_status' => $code, 'note' => "Website returned HTTP $code.", 'final_url' => $res['final_url'], 'time_ms' => $res['time_ms']];
    }
}
