<?php
declare(strict_types=1);

namespace LeadForge\Core;

/** Synchronizer-token CSRF protection. The token is returned by GET /auth/csrf and sent back in X-CSRF-Token. */
final class Csrf
{
    public static function token(): string
    {
        if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
        return $_SESSION['csrf'];
    }

    public static function verify(Request $req): void
    {
        $sent = $req->header('X-CSRF-Token') ?? '';
        if (empty($_SESSION['csrf']) || !is_string($sent) || !hash_equals($_SESSION['csrf'], $sent)) {
            throw new HttpException(419, 'Invalid or missing CSRF token. Refresh the page and try again.');
        }
    }

    public static function rotate(): string
    {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        return $_SESSION['csrf'];
    }
}
