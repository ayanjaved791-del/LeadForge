<?php
declare(strict_types=1);

namespace LeadForge\Services;

use LeadForge\Core\Auth;
use LeadForge\Core\Config;
use LeadForge\Core\Database;
use LeadForge\Core\HttpException;
use LeadForge\Core\Uuid;

/** Free-plan quota tracking. */
final class Usage
{
    public static function limit(string $metric): int
    {
        $sub = Database::one('SELECT limits FROM subscriptions WHERE workspace_id = ?', [Auth::workspaceId()]);
        $limits = $sub && $sub['limits'] ? json_decode($sub['limits'], true) : [];
        return (int) ($limits[$metric] ?? Config::get("limits.$metric", 1000));
    }

    public static function used(string $metric): int
    {
        return (int) Database::scalar(
            "SELECT COALESCE(SUM(quantity),0) FROM usage_records WHERE workspace_id = ? AND metric = ? AND recorded_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')",
            [Auth::workspaceId(), $metric]);
    }

    public static function consume(string $metric, int $qty = 1): void
    {
        if (self::used($metric) + $qty > self::limit($metric)) {
            throw new HttpException(402, 'Monthly free-plan limit reached for ' . str_replace('_', ' ', $metric) . '. It resets on the 1st of next month.');
        }
        Database::insert('usage_records', [
            'id' => Uuid::v4(), 'workspace_id' => Auth::workspaceId(), 'user_id' => Auth::id(), 'metric' => $metric, 'quantity' => $qty,
        ]);
    }

    /** @return list<array{metric:string,used:int,limit:int}> */
    public static function summary(): array
    {
        $out = [];
        foreach (['discovery_search', 'website_check', 'website_audit', 'lead_export'] as $m) {
            $out[] = ['metric' => $m, 'used' => self::used($m), 'limit' => self::limit($m)];
        }
        return $out;
    }
}
