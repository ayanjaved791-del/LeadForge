<?php
declare(strict_types=1);

namespace LeadForge\Core;

/** Fixed-window rate limiter stored in MySQL (works on any shared PHP host, no Redis needed). */
final class RateLimiter
{
    public static function hit(string $key, int $max, int $windowSeconds): void
    {
        $bucket = substr(hash('sha256', $key), 0, 64);
        $row = Database::one('SELECT hits, window_start FROM rate_limits WHERE bucket_key = ?', [$bucket]);
        $now = time();
        if (!$row || strtotime($row['window_start'] . ' UTC') + $windowSeconds <= $now) {
            Database::run('REPLACE INTO rate_limits (bucket_key, hits, window_start) VALUES (?, 1, UTC_TIMESTAMP())', [$bucket]);
            return;
        }
        if ((int) $row['hits'] >= $max) {
            $retry = strtotime($row['window_start'] . ' UTC') + $windowSeconds - $now;
            header('Retry-After: ' . max(1, $retry));
            throw new HttpException(429, 'Too many requests. Please wait ' . max(1, $retry) . ' seconds and try again.');
        }
        Database::run('UPDATE rate_limits SET hits = hits + 1 WHERE bucket_key = ?', [$bucket]);
    }
}
