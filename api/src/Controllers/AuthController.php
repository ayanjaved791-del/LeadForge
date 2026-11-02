<?php
declare(strict_types=1);

namespace LeadForge\Controllers;

use LeadForge\Core\Auth;
use LeadForge\Core\Config;
use LeadForge\Core\Csrf;
use LeadForge\Core\Database;
use LeadForge\Core\Fmt;
use LeadForge\Core\HttpException;
use LeadForge\Core\RateLimiter;
use LeadForge\Core\Request;
use LeadForge\Core\Session;
use LeadForge\Core\Uuid;
use LeadForge\Core\Validator;
use LeadForge\Services\Mailer;

final class AuthController
{
    public static function csrf(Request $r): array
    {
        return ['token' => Csrf::token()];
    }

    public static function register(Request $r): array
    {
        RateLimiter::hit('register|' . $r->ip(), 10, 3600);
        $d = Validator::validate($r->all(), [
            'name' => 'required|string|min:2|max:120',
            'email' => 'required|email|max:191',
            'password' => 'required|string|min:8|max:200',
            'workspace' => 'string|max:120',
        ]);
        self::assertStrongPassword($d['password']);
        $email = mb_strtolower($d['email']);
        if (Database::scalar('SELECT 1 FROM users WHERE email = ?', [$email])) {
            throw HttpException::validation(['email' => 'An account with this email already exists.']);
        }
        $uid = Uuid::v4();
        $wid = Uuid::v4();
        $wsName = $d['workspace'] ?? null ?: $d['name'] . "'s Workspace";
        Database::transaction(function () use ($uid, $wid, $email, $d, $wsName) {
            Database::insert('users', ['id' => $uid, 'email' => $email, 'name' => $d['name'],
                'password_hash' => password_hash($d['password'], PASSWORD_DEFAULT)]);
            Database::insert('profiles', ['user_id' => $uid]);
            Database::insert('workspaces', ['id' => $wid, 'name' => $wsName, 'slug' => self::slug($wsName), 'owner_id' => $uid, 'settings' => '{}']);
            Database::insert('workspace_members', ['id' => Uuid::v4(), 'workspace_id' => $wid, 'user_id' => $uid, 'role' => 'owner']);
            Database::insert('subscriptions', ['id' => Uuid::v4(), 'workspace_id' => $wid, 'plan' => 'free', 'status' => 'active',
                'limits' => json_encode(Config::get('limits', [])), 'current_period_start' => gmdate('Y-m-d H:i:s')]);
        });
        self::sendVerification($uid, $email, $d['name']);
        Auth::login($uid);
        return ['user_id' => $uid, 'csrf' => Csrf::token()];
    }

    public static function login(Request $r): array
    {
        $d = Validator::validate($r->all(), ['email' => 'required|email', 'password' => 'required|string|max:200']);
        $email = mb_strtolower($d['email']);
        RateLimiter::hit('login|' . $r->ip(), 20, 900);
        RateLimiter::hit('login-email|' . $email, 8, 900);
        $user = Database::one('SELECT id, password_hash, status FROM users WHERE email = ?', [$email]);
        // Constant-ish time: always run a verify.
        $hash = $user['password_hash'] ?? '$2y$10$usesomesillystringforsaltdoesnotmatchanythingxxxxxxxxx';
        if (!password_verify($d['password'], $hash) || !$user) {
            throw new HttpException(401, 'Incorrect email or password.');
        }
        if ($user['status'] !== 'active') throw HttpException::forbidden('This account is disabled.');
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            Database::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($d['password'], PASSWORD_DEFAULT), $user['id']]);
        }
        Auth::login($user['id']);
        return ['csrf' => Csrf::token()];
    }

    public static function logout(Request $r): array
    {
        Session::destroy();
        Session::start();
        return ['csrf' => Csrf::token()];
    }

    public static function me(Request $r): array
    {
        $u = Database::one(
            'SELECT u.id, u.email, u.name, u.email_verified_at, u.created_at, p.job_title, p.company, p.phone, p.timezone, p.currency,
                    p.default_city, p.default_country, p.onboarded_at
             FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ?', [Auth::id()]);
        $ws = Database::one('SELECT id, name, slug, settings, created_at FROM workspaces WHERE id = ?', [Auth::workspaceId()]);
        $workspaces = Database::all('SELECT w.id, w.name, m.role FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ? ORDER BY w.name', [Auth::id()]);
        return [
            'user' => Fmt::row($u, ['email_verified_at', 'created_at', 'onboarded_at']),
            'workspace' => Fmt::row($ws, ['created_at'], [], [], [], ['settings']) + ['role' => Auth::role()],
            'workspaces' => $workspaces,
            'csrf' => Csrf::token(),
        ];
    }

    public static function updateProfile(Request $r): array
    {
        $d = Validator::validate($r->all(), [
            'name' => 'string|min:2|max:120', 'job_title' => 'nullable|string|max:120', 'company' => 'nullable|string|max:160',
            'phone' => 'nullable|string|max:40', 'timezone' => 'string|max:64', 'currency' => 'string|min:3|max:3',
            'default_city' => 'nullable|string|max:120', 'default_country' => 'nullable|string|max:120', 'complete_onboarding' => 'bool',
        ]);
        if (isset($d['timezone']) && !in_array($d['timezone'], \DateTimeZone::listIdentifiers(), true)) {
            throw HttpException::validation(['timezone' => 'Unknown timezone.']);
        }
        if (isset($d['name'])) Database::update('users', ['name' => $d['name']], ['id' => Auth::id()]);
        $profile = array_intersect_key($d, array_flip(['job_title', 'company', 'phone', 'timezone', 'currency', 'default_city', 'default_country']));
        if (isset($profile['currency'])) $profile['currency'] = strtoupper($profile['currency']);
        if (!empty($d['complete_onboarding'])) $profile['onboarded_at'] = gmdate('Y-m-d H:i:s');
        Database::update('profiles', $profile, ['user_id' => Auth::id()]);
        return self::me($r);
    }

    public static function changePassword(Request $r): array
    {
        RateLimiter::hit('pwchange|' . Auth::id(), 10, 3600);
        $d = Validator::validate($r->all(), ['current_password' => 'required|string', 'password' => 'required|string|min:8|max:200']);
        $hash = (string) Database::scalar('SELECT password_hash FROM users WHERE id = ?', [Auth::id()]);
        if (!password_verify($d['current_password'], $hash)) throw HttpException::validation(['current_password' => 'Current password is incorrect.']);
        self::assertStrongPassword($d['password']);
        Database::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($d['password'], PASSWORD_DEFAULT), Auth::id()]);
        Session::regenerate();
        return ['changed' => true];
    }

    public static function forgotPassword(Request $r): array
    {
        RateLimiter::hit('forgot|' . $r->ip(), 5, 900);
        $d = Validator::validate($r->all(), ['email' => 'required|email']);
        $user = Database::one('SELECT id, name, email FROM users WHERE email = ? AND status = ?', [mb_strtolower($d['email']), 'active']);
        if ($user) {
            $token = bin2hex(random_bytes(32));
            Database::run('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [$user['id']]);
            Database::insert('password_resets', ['id' => Uuid::v4(), 'user_id' => $user['id'], 'token_hash' => hash('sha256', $token),
                'expires_at' => gmdate('Y-m-d H:i:s', time() + 3600)]);
            $link = rtrim((string) Config::get('app.url'), '/') . '/reset-password?token=' . $token;
            Mailer::send($user['email'], 'Reset your LeadForge password',
                "Hi {$user['name']},\n\nUse the link below to choose a new password. It expires in 1 hour.\n\n$link\n\nIf you didn't request this, you can ignore this email.");
        }
        // Same response whether or not the account exists (prevents user enumeration).
        return ['sent' => true];
    }

    public static function resetPassword(Request $r): array
    {
        RateLimiter::hit('reset|' . $r->ip(), 10, 900);
        $d = Validator::validate($r->all(), ['token' => 'required|string|max:128', 'password' => 'required|string|min:8|max:200']);
        self::assertStrongPassword($d['password']);
        $row = Database::one('SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()',
            [hash('sha256', $d['token'])]);
        if (!$row) throw new HttpException(400, 'This reset link is invalid or has expired.');
        Database::transaction(function () use ($row, $d) {
            Database::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($d['password'], PASSWORD_DEFAULT), $row['user_id']]);
            Database::run('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE id = ?', [$row['id']]);
        });
        return ['reset' => true];
    }

    public static function verifyEmail(Request $r): array
    {
        RateLimiter::hit('verify|' . $r->ip(), 20, 900);
        $d = Validator::validate($r->all(), ['token' => 'required|string|max:128']);
        $row = Database::one('SELECT id, user_id FROM email_verifications WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()',
            [hash('sha256', $d['token'])]);
        if (!$row) throw new HttpException(400, 'This verification link is invalid or has expired.');
        Database::run('UPDATE email_verifications SET used_at = UTC_TIMESTAMP() WHERE id = ?', [$row['id']]);
        Database::run('UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?', [$row['user_id']]);
        return ['verified' => true];
    }

    public static function resendVerification(Request $r): array
    {
        RateLimiter::hit('resend|' . Auth::id(), 3, 900);
        $u = Auth::user();
        if ($u['email_verified_at']) return ['sent' => false, 'already_verified' => true];
        self::sendVerification($u['id'], $u['email'], $u['name']);
        return ['sent' => true];
    }

    private static function sendVerification(string $uid, string $email, string $name): void
    {
        $token = bin2hex(random_bytes(32));
        Database::insert('email_verifications', ['id' => Uuid::v4(), 'user_id' => $uid, 'token_hash' => hash('sha256', $token),
            'expires_at' => gmdate('Y-m-d H:i:s', time() + 86400 * 2)]);
        $link = rtrim((string) Config::get('app.url'), '/') . '/verify-email?token=' . $token;
        Mailer::send($email, 'Verify your LeadForge email', "Hi $name,\n\nConfirm your email address to secure your account:\n\n$link\n\nThis link expires in 48 hours.");
    }

    private static function assertStrongPassword(string $pw): void
    {
        if (!preg_match('/[A-Za-z]/', $pw) || !preg_match('/\d/', $pw)) {
            throw HttpException::validation(['password' => 'Use at least 8 characters with letters and numbers.']);
        }
    }

    public static function slug(string $name): string
    {
        $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)) ?? '', '-') ?: 'workspace';
        return substr($base, 0, 100) . '-' . substr(bin2hex(random_bytes(4)), 0, 6);
    }
}
