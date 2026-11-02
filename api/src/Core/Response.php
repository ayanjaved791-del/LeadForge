<?php
declare(strict_types=1);

namespace LeadForge\Core;

final class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function ok(mixed $data = null): never { self::json(['data' => $data]); }
    public static function created(mixed $data = null): never { self::json(['data' => $data], 201); }

    /** @param array<string,string> $errors */
    public static function error(int $status, string $message, array $errors = []): never
    {
        $payload = ['error' => ['message' => $message]];
        if ($errors) $payload['error']['fields'] = $errors;
        self::json($payload, $status);
    }

    public static function csv(string $filename, array $header, iterable $rows): never
    {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '', $filename) . '"');
        header('Cache-Control: no-store');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, $header, ',', '"', '\\');
        foreach ($rows as $row) {
            // Neutralise spreadsheet formula injection.
            $row = array_map(static function ($v) {
                $s = (string) ($v ?? '');
                return ($s !== '' && in_array($s[0], ['=', '+', '-', '@', "\t", "\r"], true)) ? "'" . $s : $s;
            }, $row);
            fputcsv($out, $row, ',', '"', '\\');
        }
        fclose($out);
        exit;
    }
}
