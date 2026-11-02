<?php
declare(strict_types=1);

namespace LeadForge\Services;

use LeadForge\Core\Config;
use LeadForge\Core\Uuid;

/**
 * Zero-cost mailer. The default 'log' driver writes each message to storage/mail/*.eml so password
 * reset and verification links can be opened locally. Switch to 'mail' to use PHP mail()/sendmail.
 */
final class Mailer
{
    public static function send(string $to, string $subject, string $text): bool
    {
        $from = (string) Config::get('mail.from', 'no-reply@leadforge.local');
        $headers = "From: LeadForge <$from>\r\nContent-Type: text/plain; charset=UTF-8\r\nMIME-Version: 1.0";
        if (Config::get('mail.driver', 'log') === 'mail') {
            return mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, $headers);
        }
        $file = dirname(__DIR__, 2) . '/storage/mail/' . gmdate('Ymd-His') . '-' . substr(Uuid::v4(), 0, 8) . '.eml';
        return (bool) file_put_contents($file, "To: $to\r\nSubject: $subject\r\n$headers\r\n\r\n$text\r\n");
    }
}
