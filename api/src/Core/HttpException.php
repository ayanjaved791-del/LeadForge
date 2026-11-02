<?php
declare(strict_types=1);

namespace LeadForge\Core;

final class HttpException extends \RuntimeException
{
    /** @param array<string,string> $errors */
    public function __construct(public readonly int $status, string $message, public readonly array $errors = [])
    {
        parent::__construct($message, $status);
    }

    public static function notFound(string $what = 'Resource'): self { return new self(404, "$what not found"); }
    public static function forbidden(string $msg = 'Forbidden'): self { return new self(403, $msg); }
    public static function unauthorized(): self { return new self(401, 'Authentication required'); }
    /** @param array<string,string> $errors */
    public static function validation(array $errors): self { return new self(422, 'Validation failed', $errors); }
}
