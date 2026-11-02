<?php
declare(strict_types=1);

namespace LeadForge\Core;

final class Config
{
    /** @var array<string,mixed> */
    private static array $data = [];

    /** @param array<string,mixed> $data */
    public static function load(array $data): void { self::$data = $data; }

    public static function get(string $path, mixed $default = null): mixed
    {
        $node = self::$data;
        foreach (explode('.', $path) as $key) {
            if (!is_array($node) || !array_key_exists($key, $node)) return $default;
            $node = $node[$key];
        }
        return $node;
    }
}
