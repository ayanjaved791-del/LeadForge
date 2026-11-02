<?php
declare(strict_types=1);

namespace LeadForge\Core;

final class Session
{
    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) return;
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.sid_length', '48');
        ini_set('session.sid_bits_per_character', '6');
        ini_set('session.gc_maxlifetime', (string) Config::get('session.lifetime', 604800));
        session_name((string) Config::get('session.name', 'leadforge_sid'));
        session_set_cookie_params([
            'lifetime' => (int) Config::get('session.lifetime', 604800),
            'path'     => '/',
            'secure'   => (bool) Config::get('session.secure', false),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();

        // Idle timeout.
        $now = time();
        if (isset($_SESSION['last_seen']) && $now - (int) $_SESSION['last_seen'] > (int) Config::get('session.lifetime', 604800)) {
            self::destroy();
            session_start();
        }
        $_SESSION['last_seen'] = $now;
    }

    public static function regenerate(): void { session_regenerate_id(true); }

    public static function destroy(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Lax']);
        }
        session_destroy();
    }
}
