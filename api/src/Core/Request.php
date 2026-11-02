<?php
declare(strict_types=1);

namespace LeadForge\Core;

final class Request
{
    /** @var array<string,string> */
    public array $params = [];
    /** @var array<string,mixed> */
    private array $body;

    public function __construct(public readonly string $method, public readonly string $path)
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw !== '' && strlen($raw) > 1_000_000) throw new HttpException(413, 'Request body too large');
        $decoded = $raw !== '' ? json_decode($raw, true) : [];
        if ($raw !== '' && !is_array($decoded)) throw new HttpException(400, 'Request body must be valid JSON');
        $this->body = $decoded ?? [];
    }

    public static function capture(): self
    {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        // Strip the directory the API is mounted in (e.g. /leadforge/api) so routes are location-independent.
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        if ($base !== '' && str_starts_with($uri, $base)) $uri = substr($uri, strlen($base));
        $uri = '/' . trim(preg_replace('#^/index\.php#', '', $uri) ?? '', '/');
        return new self(strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'), $uri);
    }

    public function input(string $key, mixed $default = null): mixed { return $this->body[$key] ?? $default; }
    /** @return array<string,mixed> */
    public function all(): array { return $this->body; }
    public function has(string $key): bool { return array_key_exists($key, $this->body); }

    public function query(string $key, mixed $default = null): mixed
    {
        $v = $_GET[$key] ?? $default;
        return is_string($v) ? trim($v) : $v;
    }

    public function param(string $key): string { return $this->params[$key] ?? ''; }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $_SERVER[$key] ?? null;
    }

    public function ip(): string { return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'; }
}
