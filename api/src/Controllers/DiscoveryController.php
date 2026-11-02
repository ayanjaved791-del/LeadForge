<?php
declare(strict_types=1);

namespace LeadForge\Controllers;

use LeadForge\Core\Auth;
use LeadForge\Core\Database;
use LeadForge\Core\Fmt;
use LeadForge\Core\HttpException;
use LeadForge\Core\RateLimiter;
use LeadForge\Core\Request;
use LeadForge\Core\Scope;
use LeadForge\Core\Uuid;
use LeadForge\Core\Validator;
use LeadForge\Services\Businesses;
use LeadForge\Services\Categories;
use LeadForge\Services\Osm;
use LeadForge\Services\Usage;
use LeadForge\Services\WebsiteChecker;

final class DiscoveryController
{
    public static function categories(Request $r): array
    {
        return Categories::list();
    }

    public static function geocode(Request $r): ?array
    {
        RateLimiter::hit('geocode|' . Auth::id(), 30, 60);
        $q = (string) $r->query('q', '');
        if (mb_strlen($q) < 2 || mb_strlen($q) > 200) throw HttpException::validation(['q' => 'Enter a location.']);
        return Osm::geocode($q);
    }

    /** Runs an OpenStreetMap search and stores the results in the workspace. */
    public static function search(Request $r): array
    {
        $d = Validator::validate($r->all(), [
            'category' => 'required|string|max:40', 'country' => 'nullable|string|max:120', 'city' => 'nullable|string|max:120',
            'area' => 'nullable|string|max:120', 'radius' => 'required|int', 'lat' => 'nullable|numeric', 'lng' => 'nullable|numeric',
        ]);
        if (!Categories::exists($d['category'])) throw HttpException::validation(['category' => 'Choose a category.']);
        $radius = (int) $d['radius'];
        if ($radius < 200 || $radius > 10000) throw HttpException::validation(['radius' => 'Radius must be between 200 m and 10 km.']);

        if (isset($d['lat'], $d['lng'])) {
            if (abs($d['lat']) > 90 || abs($d['lng']) > 180) throw HttpException::validation(['lat' => 'Invalid coordinates.']);
            $center = ['lat' => (float) $d['lat'], 'lng' => (float) $d['lng'], 'display_name' => sprintf('%.5f, %.5f', $d['lat'], $d['lng'])];
        } else {
            $q = implode(', ', array_filter([$d['area'] ?? null, $d['city'] ?? null, $d['country'] ?? null]));
            if ($q === '') throw HttpException::validation(['city' => 'Enter a city or pick a point on the map.']);
            $center = Osm::geocode($q);
            if (!$center) throw HttpException::validation(['city' => "We couldn't find \"$q\" on OpenStreetMap."]);
        }

        // Courtesy limit for the public Overpass instance.
        RateLimiter::hit('overpass|' . Auth::workspaceId(), 10, 60);
        Usage::consume('discovery_search');
        $items = Osm::searchBusinesses($d['category'], $center['lat'], $center['lng'], $radius);
        $ids = Businesses::upsertMany($items);

        $rows = [];
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $rows = Database::all("SELECT b.*, l.id AS lead_id FROM businesses b LEFT JOIN leads l ON l.business_id = b.id
                WHERE b.workspace_id = ? AND b.id IN ($in) ORDER BY b.opportunity_score DESC, b.name", array_merge([Auth::workspaceId()], $ids));
        }
        return [
            'center' => $center,
            'radius' => $radius,
            'count' => count($rows),
            'businesses' => array_map([Businesses::class, 'format'], $rows),
            'attribution' => 'Data © OpenStreetMap contributors, ODbL',
        ];
    }

    public static function list(Request $r): array
    {
        $where = ['b.workspace_id = :ws'];
        $p = ['ws' => Auth::workspaceId()];
        if ($q = $r->query('q')) { $where[] = '(b.name LIKE :q OR b.city LIKE :q2 OR b.street LIKE :q3)'; $p['q'] = $p['q2'] = $p['q3'] = Fmt::like($q); }
        if (($c = $r->query('category')) && Categories::exists($c)) { $where[] = 'b.category = :cat'; $p['cat'] = $c; }
        if (($s = $r->query('website_status')) && isset(WebsiteChecker::LABELS[$s])) { $where[] = 'b.website_status = :st'; $p['st'] = $s; }
        if (is_numeric($r->query('min_score'))) { $where[] = 'b.opportunity_score >= :min'; $p['min'] = (int) $r->query('min_score'); }
        if ($r->query('saved') === '1') $where[] = 'l.id IS NOT NULL';
        if ($r->query('saved') === '0') $where[] = 'l.id IS NULL';
        if ($bbox = $r->query('bbox')) {
            $parts = array_map('floatval', explode(',', (string) $bbox));
            if (count($parts) === 4) {
                $where[] = 'b.lat BETWEEN :s AND :n AND b.lng BETWEEN :w AND :e';
                [$p['w'], $p['s'], $p['e'], $p['n']] = $parts;
            }
        }
        $sort = match ($r->query('sort')) { 'name' => 'b.name ASC', 'recent' => 'b.discovered_at DESC', default => 'b.opportunity_score DESC, b.name ASC' };
        $limit = max(1, min(500, (int) ($r->query('limit') ?: 50)));
        $page = max(1, (int) ($r->query('page') ?: 1));
        $whereSql = implode(' AND ', $where);
        $total = (int) Database::scalar("SELECT COUNT(*) FROM businesses b LEFT JOIN leads l ON l.business_id = b.id WHERE $whereSql", $p);
        $rows = Database::all("SELECT b.*, l.id AS lead_id FROM businesses b LEFT JOIN leads l ON l.business_id = b.id
            WHERE $whereSql ORDER BY $sort LIMIT $limit OFFSET " . (($page - 1) * $limit), $p);
        return ['total' => $total, 'page' => $page, 'limit' => $limit, 'items' => array_map([Businesses::class, 'format'], $rows)];
    }

    public static function show(Request $r): array
    {
        $b = Scope::find('businesses', $r->param('id'), 'Business');
        $b['lead_id'] = Database::scalar('SELECT id FROM leads WHERE business_id = ?', [$b['id']]) ?: null;
        $out = Businesses::format($b);
        $audit = Businesses::latestAudit($b['id']);
        $out['latest_audit'] = $audit ? AuditController::format($audit) : null;
        return $out;
    }

    public static function checkWebsite(Request $r): array
    {
        $b = Scope::find('businesses', $r->param('id'), 'Business');
        RateLimiter::hit('webcheck|' . Auth::id(), 30, 60);
        if (!$b['website']) {
            $init = WebsiteChecker::initial(null, $b['socials'] ? json_decode($b['socials'], true) : []);
            Database::run('UPDATE businesses SET website_status = ?, website_check_note = ?, website_checked_at = UTC_TIMESTAMP() WHERE id = ?',
                [$init['status'], $init['note'], $b['id']]);
        } else {
            Usage::consume('website_check');
            $res = WebsiteChecker::check($b['website']);
            Database::run('UPDATE businesses SET website_status = ?, website_http_status = ?, website_check_note = ?, website_checked_at = UTC_TIMESTAMP() WHERE id = ?',
                [$res['status'], $res['http_status'], mb_substr($res['note'], 0, 250), $b['id']]);
        }
        Businesses::rescore($b['id']);
        return self::show($r);
    }

    /** Checks up to 10 unverified websites in one call. */
    public static function checkBatch(Request $r): array
    {
        $ids = $r->input('ids');
        if (!is_array($ids) || !$ids || count($ids) > 10) throw HttpException::validation(['ids' => 'Provide 1–10 business ids.']);
        RateLimiter::hit('webcheck|' . Auth::id(), 30, 60);
        $out = [];
        foreach ($ids as $id) {
            if (!Uuid::isValid($id)) continue;
            $b = Database::one('SELECT * FROM businesses WHERE id = ? AND workspace_id = ?', [$id, Auth::workspaceId()]);
            if (!$b || !$b['website']) continue;
            Usage::consume('website_check');
            $res = WebsiteChecker::check($b['website']);
            Database::run('UPDATE businesses SET website_status = ?, website_http_status = ?, website_check_note = ?, website_checked_at = UTC_TIMESTAMP() WHERE id = ?',
                [$res['status'], $res['http_status'], mb_substr($res['note'], 0, 250), $b['id']]);
            Businesses::rescore($b['id']);
            $row = Database::one('SELECT b.*, l.id AS lead_id FROM businesses b LEFT JOIN leads l ON l.business_id = b.id WHERE b.id = ?', [$b['id']]);
            $out[] = Businesses::format($row);
        }
        return $out;
    }

    public static function delete(Request $r): array
    {
        $b = Scope::find('businesses', $r->param('id'), 'Business');
        Database::run('DELETE FROM businesses WHERE id = ? AND workspace_id = ?', [$b['id'], Auth::workspaceId()]);
        return ['deleted' => true];
    }

    // ---- saved searches ----
    public static function savedSearches(Request $r): array
    {
        return array_map(fn ($s) => Fmt::row($s, ['last_run_at', 'created_at'], ['result_count'], [], [], ['params']),
            Database::all('SELECT * FROM saved_searches WHERE workspace_id = ? ORDER BY created_at DESC', [Auth::workspaceId()]));
    }

    public static function createSavedSearch(Request $r): array
    {
        $d = Validator::validate($r->all(), ['name' => 'required|string|max:120', 'params' => 'required|array', 'result_count' => 'nullable|int']);
        $params = array_intersect_key($d['params'], array_flip(['category', 'country', 'city', 'area', 'radius', 'lat', 'lng']));
        if (!isset($params['category']) || !Categories::exists((string) $params['category'])) throw HttpException::validation(['params' => 'Invalid search.']);
        $id = Uuid::v4();
        Database::insert('saved_searches', ['id' => $id, 'workspace_id' => Auth::workspaceId(), 'user_id' => Auth::id(), 'name' => $d['name'],
            'params' => json_encode($params), 'result_count' => $d['result_count'] ?? null, 'last_run_at' => gmdate('Y-m-d H:i:s')]);
        return Fmt::row(Scope::find('saved_searches', $id), ['last_run_at', 'created_at'], ['result_count'], [], [], ['params']);
    }

    public static function touchSavedSearch(Request $r): array
    {
        $s = Scope::find('saved_searches', $r->param('id'), 'Saved search');
        $count = $r->input('result_count');
        Database::run('UPDATE saved_searches SET last_run_at = UTC_TIMESTAMP(), result_count = ? WHERE id = ?', [is_numeric($count) ? (int) $count : $s['result_count'], $s['id']]);
        return ['ok' => true];
    }

    public static function deleteSavedSearch(Request $r): array
    {
        $s = Scope::find('saved_searches', $r->param('id'), 'Saved search');
        Database::run('DELETE FROM saved_searches WHERE id = ?', [$s['id']]);
        return ['deleted' => true];
    }
}
