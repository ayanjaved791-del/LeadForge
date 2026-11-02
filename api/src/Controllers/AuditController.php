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
use LeadForge\Services\Auditor;
use LeadForge\Services\Businesses;
use LeadForge\Services\Usage;

final class AuditController
{
    public static function format(array $a): array
    {
        return Fmt::row($a, ['created_at'], ['status_code', 'response_time_ms', 'h1_count', 'page_bytes', 'score'], [],
            ['is_reachable', 'uses_https', 'has_viewport', 'has_favicon', 'has_canonical'], ['checks']);
    }

    public static function run(Request $r): array
    {
        $d = Validator::validate($r->all(), ['url' => 'nullable|string|max:500', 'business_id' => 'nullable|uuid', 'lead_id' => 'nullable|uuid']);
        $business = !empty($d['business_id']) ? Scope::find('businesses', $d['business_id'], 'Business') : null;
        $lead = !empty($d['lead_id']) ? Scope::find('leads', $d['lead_id'], 'Lead') : null;
        $url = $d['url'] ?? $lead['website'] ?? $business['website'] ?? null;
        if (!$url) throw HttpException::validation(['url' => 'Enter a website URL to audit.']);
        if (!$business && $lead && $lead['business_id']) $business = Database::one('SELECT * FROM businesses WHERE id = ?', [$lead['business_id']]);

        RateLimiter::hit('audit|' . Auth::id(), 10, 60);
        Usage::consume('website_audit');
        try {
            $res = Auditor::run($url);
        } catch (\InvalidArgumentException $e) {
            throw HttpException::validation(['url' => $e->getMessage()]);
        }
        $id = Uuid::v4();
        Database::insert('website_audits', [
            'id' => $id, 'workspace_id' => Auth::workspaceId(), 'business_id' => $business['id'] ?? null, 'lead_id' => $lead['id'] ?? null,
            'created_by' => Auth::id(), 'url' => mb_substr($res['url'], 0, 500), 'final_url' => mb_substr((string) $res['final_url'], 0, 500),
            'status_code' => $res['status_code'], 'is_reachable' => (int) $res['is_reachable'], 'uses_https' => (int) $res['uses_https'],
            'response_time_ms' => $res['response_time_ms'], 'page_title' => $res['page_title'], 'meta_description' => $res['meta_description'],
            'has_viewport' => (int) $res['has_viewport'], 'has_favicon' => (int) $res['has_favicon'], 'has_canonical' => (int) $res['has_canonical'],
            'h1_count' => $res['h1_count'], 'html_lang' => $res['html_lang'], 'page_bytes' => $res['page_bytes'], 'score' => $res['score'],
            'checks' => json_encode($res['checks'], JSON_UNESCAPED_UNICODE), 'error' => $res['error'] ? mb_substr($res['error'], 0, 250) : null,
        ]);
        if ($business) {
            // The audit is also a website check — keep the business status in sync.
            $status = $res['is_reachable'] ? 'available' : ($res['status_code'] ? 'inactive' : 'needs_review');
            Database::run('UPDATE businesses SET website_status = ?, website_http_status = ?, website_check_note = ?, website_checked_at = UTC_TIMESTAMP() WHERE id = ?',
                [$status, $res['status_code'], 'Updated by website audit.', $business['id']]);
            Businesses::rescore($business['id']);
        }
        return self::format(Scope::find('website_audits', $id));
    }

    public static function list(Request $r): array
    {
        $limit = max(1, min(200, (int) ($r->query('limit') ?: 50)));
        $rows = Database::all('SELECT a.*, b.name AS business_name, l.name AS lead_name FROM website_audits a
            LEFT JOIN businesses b ON b.id = a.business_id LEFT JOIN leads l ON l.id = a.lead_id
            WHERE a.workspace_id = ? ORDER BY a.created_at DESC LIMIT ' . $limit, [Auth::workspaceId()]);
        return array_map([self::class, 'format'], $rows);
    }

    public static function show(Request $r): array
    {
        return self::format(Scope::find('website_audits', $r->param('id'), 'Audit'));
    }

    public static function delete(Request $r): array
    {
        $a = Scope::find('website_audits', $r->param('id'), 'Audit');
        Database::run('DELETE FROM website_audits WHERE id = ?', [$a['id']]);
        if ($a['business_id']) Businesses::rescore($a['business_id']);
        return ['deleted' => true];
    }
}
