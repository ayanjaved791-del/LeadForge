<?php
declare(strict_types=1);

namespace LeadForge\Services;

use LeadForge\Core\Auth;
use LeadForge\Core\Database;
use LeadForge\Core\Fmt;
use LeadForge\Core\Uuid;

final class Businesses
{
    /** @return array<string,int> */
    public static function scoringOverrides(string $workspaceId): array
    {
        $s = Database::scalar('SELECT settings FROM workspaces WHERE id = ?', [$workspaceId]);
        $settings = $s ? json_decode((string) $s, true) : [];
        return is_array($settings['scoring'] ?? null) ? $settings['scoring'] : [];
    }

    /**
     * Upserts normalised OSM results into the workspace and returns their ids in order.
     * @param list<array<string,mixed>> $items
     * @return list<string>
     */
    public static function upsertMany(array $items): array
    {
        $ws = Auth::workspaceId();
        if (!$items) return [];
        $overrides = self::scoringOverrides($ws);
        $ids = [];
        Database::transaction(function () use ($items, $ws, $overrides, &$ids) {
            foreach ($items as $it) {
                $existing = Database::one('SELECT id, website, website_checked_at, website_status, website_http_status, website_check_note FROM businesses WHERE workspace_id = ? AND osm_type = ? AND osm_id = ?',
                    [$ws, $it['osm_type'], $it['osm_id']]);
                $row = [
                    'name' => $it['name'], 'category' => $it['category'], 'street' => $it['street'], 'city' => $it['city'],
                    'postcode' => $it['postcode'], 'country' => $it['country'], 'phone' => $it['phone'],
                    'website' => $it['website'], 'email' => $it['email'],
                    'socials' => $it['socials'] ? json_encode($it['socials'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : null,
                    'opening_hours' => $it['opening_hours'], 'lat' => $it['lat'], 'lng' => $it['lng'],
                    'raw_tags' => json_encode($it['raw_tags'], JSON_UNESCAPED_UNICODE),
                ];
                $keepCheck = $existing && $existing['website_checked_at'] && $existing['website'] === $it['website'];
                if ($keepCheck) {
                    $row['website_status'] = $existing['website_status'];
                } else {
                    $init = WebsiteChecker::initial($it['website'], $it['socials']);
                    $row['website_status'] = $init['status'];
                    $row['website_check_note'] = $init['note'];
                    $row['website_checked_at'] = null;
                    $row['website_http_status'] = null;
                }
                $id = $existing['id'] ?? Uuid::v4();
                $audit = $existing ? self::latestAudit($id) : null;
                $score = Scoring::score($row, $audit, $overrides);
                $row['opportunity_score'] = $score['score'];
                $row['score_breakdown'] = json_encode($score['items']);
                if ($existing) {
                    Database::update('businesses', $row, ['id' => $id, 'workspace_id' => $ws]);
                } else {
                    Database::insert('businesses', $row + ['id' => $id, 'workspace_id' => $ws, 'osm_type' => $it['osm_type'], 'osm_id' => $it['osm_id']]);
                }
                $ids[] = $id;
            }
        });
        return $ids;
    }

    /** @return array<string,mixed>|null */
    public static function latestAudit(string $businessId): ?array
    {
        return Database::one('SELECT * FROM website_audits WHERE business_id = ? ORDER BY created_at DESC LIMIT 1', [$businessId]);
    }

    public static function rescore(string $id): void
    {
        $b = Database::one('SELECT * FROM businesses WHERE id = ?', [$id]);
        if (!$b) return;
        $score = Scoring::score($b, self::latestAudit($id), self::scoringOverrides($b['workspace_id']));
        Database::run('UPDATE businesses SET opportunity_score = ?, score_breakdown = ? WHERE id = ?', [$score['score'], json_encode($score['items']), $id]);
    }

    public static function rescoreWorkspace(string $ws): void
    {
        foreach (Database::all('SELECT id FROM businesses WHERE workspace_id = ?', [$ws]) as $r) self::rescore($r['id']);
    }

    /** @param array<string,mixed> $b */
    public static function format(array $b): array
    {
        $socials = $b['socials'] ? json_decode($b['socials'], true) : [];
        $address = implode(', ', array_filter([$b['street'], $b['city'], $b['postcode'], $b['country']]));
        $score = (int) $b['opportunity_score'];
        return [
            'id' => $b['id'],
            'osm_type' => $b['osm_type'],
            'osm_id' => (int) $b['osm_id'],
            'osm_url' => "https://www.openstreetmap.org/{$b['osm_type']}/{$b['osm_id']}",
            'name' => $b['name'],
            'category' => $b['category'],
            'category_label' => Categories::ALL[$b['category']]['label'] ?? $b['category'],
            'address' => $address !== '' ? $address : null,
            'street' => $b['street'], 'city' => $b['city'], 'postcode' => $b['postcode'], 'country' => $b['country'],
            'phone' => $b['phone'], 'website' => $b['website'], 'email' => $b['email'],
            'socials' => $socials ?: (object) [],
            'opening_hours' => $b['opening_hours'],
            'lat' => (float) $b['lat'], 'lng' => (float) $b['lng'],
            'website_status' => $b['website_status'],
            'website_status_label' => WebsiteChecker::LABELS[$b['website_status']] ?? 'Unknown',
            'website_check_note' => $b['website_check_note'],
            'website_http_status' => $b['website_http_status'] !== null ? (int) $b['website_http_status'] : null,
            'website_checked_at' => Fmt::dt($b['website_checked_at']),
            'score' => $score,
            'band' => Scoring::band($score),
            'score_breakdown' => $b['score_breakdown'] ? json_decode($b['score_breakdown'], true) : [],
            'lead_id' => $b['lead_id'] ?? null,
            'discovered_at' => Fmt::dt($b['discovered_at']),
        ];
    }
}
