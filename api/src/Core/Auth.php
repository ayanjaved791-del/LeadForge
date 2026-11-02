<?php
declare(strict_types=1);

namespace LeadForge\Core;

/** Authentication middleware + current workspace/role resolution. */
final class Auth
{
    /** @var array<string,mixed>|null */
    private static ?array $user = null;
    private static ?string $workspaceId = null;
    private static ?string $role = null;

    public static function require(): void
    {
        $uid = $_SESSION['user_id'] ?? null;
        if (!is_string($uid)) throw HttpException::unauthorized();
        $user = Database::one("SELECT id, email, name, status, email_verified_at FROM users WHERE id = ?", [$uid]);
        if (!$user || $user['status'] !== 'active') { Session::destroy(); throw HttpException::unauthorized(); }
        self::$user = $user;

        $ws = $_SESSION['workspace_id'] ?? null;
        $member = $ws ? Database::one('SELECT workspace_id, role FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [$ws, $uid]) : null;
        if (!$member) {
            $member = Database::one('SELECT workspace_id, role FROM workspace_members WHERE user_id = ? ORDER BY created_at LIMIT 1', [$uid]);
            if (!$member) throw HttpException::forbidden('You are not a member of any workspace.');
            $_SESSION['workspace_id'] = $member['workspace_id'];
        }
        self::$workspaceId = $member['workspace_id'];
        self::$role = $member['role'];
    }

    public static function login(string $userId): void
    {
        Session::regenerate();
        $_SESSION['user_id'] = $userId;
        unset($_SESSION['workspace_id']);
        Csrf::rotate();
        Database::run('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [$userId]);
    }

    /** @return array<string,mixed> */
    public static function user(): array { return self::$user ?? throw HttpException::unauthorized(); }
    public static function id(): string { return (string) self::user()['id']; }
    public static function workspaceId(): string { return self::$workspaceId ?? throw HttpException::unauthorized(); }
    public static function role(): string { return self::$role ?? 'member'; }

    public static function requireRole(string ...$roles): void
    {
        if (!in_array(self::role(), $roles, true)) throw HttpException::forbidden('Your role does not allow this action.');
    }
}
