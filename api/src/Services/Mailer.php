<?php
declare(strict_types=1);

namespace LeadForge\Services;

use LeadForge\Core\Config;
use LeadForge\Core\Uuid;

/**
 * Zero-cost mailer.
 *  - 'log'  (default): writes each message to storage/mail/*.eml for local development
 *  - 'smtp': minimal SMTP client (STARTTLS or implicit TLS, AUTH LOGIN) for free SMTP providers
 *  - 'mail': PHP mail()/sendmail
 */
final class Mailer
{
    public static function send(string $to, string $subject, string $text): bool
    {
        $from = (string) Config::get('mail.from', 'no-reply@leadforge.local');
        $driver = Config::get('mail.driver', 'log');
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        if ($driver === 'smtp') {
            try {
                return self::smtp($from, $to, $encodedSubject, $text);
            } catch (\Throwable $e) {
                error_log('[LeadForge] SMTP error: ' . $e->getMessage());
                return false;
            }
        }
        $headers = "From: LeadForge <$from>\r\nContent-Type: text/plain; charset=UTF-8\r\nMIME-Version: 1.0";
        if ($driver === 'mail') return mail($to, $encodedSubject, $text, $headers);
        $file = Config::get('app.storage_path') . '/mail/' . gmdate('Ymd-His') . '-' . substr(Uuid::v4(), 0, 8) . '.eml';
        return (bool) @file_put_contents($file, "To: $to\r\nSubject: $subject\r\n$headers\r\n\r\n$text\r\n");
    }

    private static function smtp(string $from, string $to, string $subject, string $text): bool
    {
        $host = (string) Config::get('mail.host');
        $port = (int) Config::get('mail.port', 587);
        $secure = Config::get('mail.secure', 'tls');
        if ($host === '') throw new \RuntimeException('SMTP_HOST is not configured');
        foreach ([$from, $to] as $addr) {
            if (!filter_var($addr, FILTER_VALIDATE_EMAIL)) throw new \RuntimeException('Invalid email address');
        }

        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
        $remote = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . "$host:$port";
        $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) throw new \RuntimeException("Cannot connect to $host:$port ($errstr)");
        stream_set_timeout($fp, 15);

        $read = static function () use ($fp): string {
            $data = '';
            while (($line = fgets($fp, 515)) !== false) {
                $data .= $line;
                if (strlen($line) < 4 || $line[3] === ' ') break;
            }
            return $data;
        };
        $cmd = static function (string $c, array $ok) use ($fp, $read): string {
            fwrite($fp, $c . "\r\n");
            $resp = $read();
            if (!in_array((int) substr($resp, 0, 3), $ok, true)) throw new \RuntimeException('SMTP: ' . trim($resp));
            return $resp;
        };

        $read();
        $ehlo = 'EHLO ' . (gethostname() ?: 'leadforge');
        $cmd($ehlo, [250]);
        if ($secure === 'tls') {
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new \RuntimeException('STARTTLS failed');
            }
            $cmd($ehlo, [250]);
        }
        if (Config::get('mail.username')) {
            $cmd('AUTH LOGIN', [334]);
            $cmd(base64_encode((string) Config::get('mail.username')), [334]);
            $cmd(base64_encode((string) Config::get('mail.password')), [235]);
        }
        $cmd("MAIL FROM:<$from>", [250]);
        $cmd("RCPT TO:<$to>", [250, 251]);
        $cmd('DATA', [354]);
        $body = preg_replace('/^\./m', '..', str_replace(["\r\n", "\r"], "\n", $text)) ?? $text;
        $msg = "From: LeadForge <$from>\r\nTo: <$to>\r\nSubject: $subject\r\nDate: " . gmdate('D, d M Y H:i:s') . " +0000\r\n"
            . 'Message-ID: <' . Uuid::v4() . '@' . substr(strrchr($from, '@') ?: '@leadforge', 1) . ">\r\n"
            . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n"
            . str_replace("\n", "\r\n", $body) . "\r\n.";
        $cmd($msg, [250]);
        $cmd('QUIT', [221]);
        fclose($fp);
        return true;
    }
}
