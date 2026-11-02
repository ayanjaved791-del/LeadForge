<?php
declare(strict_types=1);

namespace LeadForge\Core;

/**
 * Stores PHP sessions in MySQL (table `sessions`).
 * Required on serverless hosts such as Vercel, where each request may run on a fresh instance
 * and the filesystem is not shared between invocations.
 */
final class DatabaseSessionHandler implements \SessionHandlerInterface, \SessionUpdateTimestampHandlerInterface
{
    public function open(string $path, string $name): bool { return true; }
    public function close(): bool { return true; }

    public function read(string $id): string|false
    {
        $row = Database::one('SELECT data FROM sessions WHERE id = ? AND expires_at > ?', [$id, time()]);
        return $row ? (string) $row['data'] : '';
    }

    public function write(string $id, string $data): bool
    {
        $ttl = (int) Config::get('session.lifetime', 604800);
        Database::run('REPLACE INTO sessions (id, data, expires_at) VALUES (?, ?, ?)', [$id, $data, time() + $ttl]);
        return true;
    }

    public function destroy(string $id): bool
    {
        Database::run('DELETE FROM sessions WHERE id = ?', [$id]);
        return true;
    }

    public function gc(int $max_lifetime): int|false
    {
        return Database::run('DELETE FROM sessions WHERE expires_at < ?', [time()])->rowCount();
    }

    public function validateId(string $id): bool
    {
        return (bool) Database::scalar('SELECT 1 FROM sessions WHERE id = ? AND expires_at > ?', [$id, time()]);
    }

    public function updateTimestamp(string $id, string $data): bool
    {
        Database::run('UPDATE sessions SET expires_at = ? WHERE id = ?', [time() + (int) Config::get('session.lifetime', 604800), $id]);
        return true;
    }
}
