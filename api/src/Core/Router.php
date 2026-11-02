<?php
declare(strict_types=1);

namespace LeadForge\Core;

final class Router
{
    /** @var list<array{string,string,callable,array<string,bool>}> */
    private array $routes = [];

    /** @param array<string,bool> $opts  auth (default true), csrf (default true for writes), guest */
    public function add(string $method, string $pattern, callable $handler, array $opts = []): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[A-Za-z0-9-]+)', rtrim($pattern, '/') ?: '/') . '$#';
        $this->routes[] = [$method, $regex, $handler, $opts];
    }

    public function get(string $p, callable $h, array $o = []): void { $this->add('GET', $p, $h, $o); }
    public function post(string $p, callable $h, array $o = []): void { $this->add('POST', $p, $h, $o); }
    public function patch(string $p, callable $h, array $o = []): void { $this->add('PATCH', $p, $h, $o); }
    public function put(string $p, callable $h, array $o = []): void { $this->add('PUT', $p, $h, $o); }
    public function delete(string $p, callable $h, array $o = []): void { $this->add('DELETE', $p, $h, $o); }

    public function dispatch(Request $req): never
    {
        $allowed = false;
        foreach ($this->routes as [$method, $regex, $handler, $opts]) {
            if (!preg_match($regex, $req->path, $m)) continue;
            $allowed = true;
            if ($method !== $req->method) continue;
            $req->params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);

            if ($req->method !== 'GET' && ($opts['csrf'] ?? true)) Csrf::verify($req);
            if ($opts['auth'] ?? true) Auth::require();

            $result = $handler($req);
            Response::ok($result);
        }
        if ($allowed) Response::error(405, 'Method not allowed');
        Response::error(404, 'Endpoint not found');
    }
}
