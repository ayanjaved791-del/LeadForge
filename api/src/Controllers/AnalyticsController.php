<?php
declare(strict_types=1);

namespace LeadForge\Controllers;

use LeadForge\Core\Auth;
use LeadForge\Core\Database;
use LeadForge\Core\Fmt;
use LeadForge\Core\Request;
use LeadForge\Services\Categories;
use LeadForge\Services\Usage;

/** Every number here is computed from the database — nothing is hard-coded. */
final class AnalyticsController
{
    public static function dashboard(Request $r): array
    {
        $ws = Auth::workspaceId();
        $year = (int) ($r->query('year') ?: gmdate('Y'));
        if ($year < 2000 || $year > 2100) $year = (int) gmdate('Y');

        $kpi = Database::one("SELECT
              COUNT(*) AS total_leads,
              SUM(status = 'new') AS new_leads,
              SUM(status = 'contacted') AS contacted,
              SUM(status = 'qualified') AS qualified,
              SUM(status = 'won') AS won,
              SUM(status = 'lost') AS lost,
              COALESCE(SUM(CASE WHEN status = 'won' THEN deal_value END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN status NOT IN ('won','lost') THEN deal_value END), 0) AS pipeline_value,
              SUM(created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) AS leads_30d,
              SUM(created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 DAY) AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) AS leads_prev_30d,
              COALESCE(SUM(CASE WHEN status='won' AND won_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) THEN deal_value END),0) AS revenue_30d,
              COALESCE(SUM(CASE WHEN status='won' AND won_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 DAY) AND won_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) THEN deal_value END),0) AS revenue_prev_30d
            FROM leads WHERE workspace_id = ?", [$ws]);
        $kpi = array_map(fn ($v) => (float) ($v ?? 0), $kpi);

        $biz = Database::one("SELECT COUNT(*) AS total, SUM(website_status='no_website') AS no_website, SUM(website_status='inactive') AS inactive,
              SUM(opportunity_score >= 50) AS high_opportunity,
              SUM(discovered_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) AS d30
            FROM businesses WHERE workspace_id = ?", [$ws]);
        $biz = array_map(fn ($v) => (int) ($v ?? 0), $biz);

        $follow = Database::one("SELECT SUM(due_at < UTC_TIMESTAMP()) AS overdue, COUNT(*) AS pending,
              SUM(DATE(due_at) = UTC_DATE()) AS today FROM follow_ups WHERE workspace_id = ? AND status = 'pending'", [$ws]);
        $follow = array_map(fn ($v) => (int) ($v ?? 0), $follow);

        $closed = $kpi['won'] + $kpi['lost'];
        $monthly = [];
        for ($m = 1; $m <= 12; $m++) $monthly[$m] = ['month' => $m, 'leads' => 0, 'won' => 0, 'lost' => 0, 'revenue' => 0.0];
        foreach (Database::all('SELECT MONTH(created_at) m, COUNT(*) n FROM leads WHERE workspace_id = ? AND YEAR(created_at) = ? GROUP BY m', [$ws, $year]) as $row) $monthly[(int) $row['m']]['leads'] = (int) $row['n'];
        foreach (Database::all('SELECT MONTH(won_at) m, COUNT(*) n, SUM(deal_value) v FROM leads WHERE workspace_id = ? AND status = "won" AND YEAR(won_at) = ? GROUP BY m', [$ws, $year]) as $row) {
            $monthly[(int) $row['m']]['won'] = (int) $row['n'];
            $monthly[(int) $row['m']]['revenue'] = (float) $row['v'];
        }
        foreach (Database::all('SELECT MONTH(lost_at) m, COUNT(*) n FROM leads WHERE workspace_id = ? AND status = "lost" AND YEAR(lost_at) = ? GROUP BY m', [$ws, $year]) as $row) $monthly[(int) $row['m']]['lost'] = (int) $row['n'];

        // Daily pipeline additions (last 30 days) for the sparkline.
        $daily = [];
        $rows = Database::all('SELECT DATE(created_at) d, COUNT(*) n, SUM(deal_value) v FROM leads WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL 29 DAY) GROUP BY d', [$ws]);
        $byDay = array_column($rows, null, 'd');
        for ($i = 29; $i >= 0; $i--) {
            $d = gmdate('Y-m-d', strtotime("-$i days"));
            $daily[] = ['date' => $d, 'leads' => (int) ($byDay[$d]['n'] ?? 0), 'value' => (float) ($byDay[$d]['v'] ?? 0)];
        }

        $years = array_map('intval', array_column(Database::all('SELECT DISTINCT YEAR(created_at) y FROM leads WHERE workspace_id = ? ORDER BY y DESC', [$ws]), 'y'));
        if (!in_array((int) gmdate('Y'), $years, true)) array_unshift($years, (int) gmdate('Y'));

        $upcoming = Database::all("SELECT f.id, f.lead_id, f.due_at, f.channel, f.note, l.name AS lead_name FROM follow_ups f JOIN leads l ON l.id = f.lead_id
            WHERE f.workspace_id = ? AND f.status = 'pending' ORDER BY f.due_at ASC LIMIT 5", [$ws]);
        $recent = Database::all("SELECT a.id, a.lead_id, a.type, a.subject, a.body, a.occurred_at, l.name AS lead_name, l.deal_value, l.status
            FROM lead_activities a JOIN leads l ON l.id = a.lead_id WHERE a.workspace_id = ? AND a.type <> 'system'
            ORDER BY a.occurred_at DESC LIMIT 6", [$ws]);
        $topOpp = Database::all("SELECT b.id, b.name, b.category, b.city, b.opportunity_score, b.website_status, l.id AS lead_id FROM businesses b
            LEFT JOIN leads l ON l.business_id = b.id WHERE b.workspace_id = ? ORDER BY b.opportunity_score DESC, b.discovered_at DESC LIMIT 5", [$ws]);
        foreach ($topOpp as &$t) { $t['opportunity_score'] = (int) $t['opportunity_score']; $t['category_label'] = Categories::ALL[$t['category']]['label'] ?? $t['category']; }

        $ws_row = Database::one('SELECT w.name, w.created_at, s.plan, s.status FROM workspaces w LEFT JOIN subscriptions s ON s.workspace_id = w.id WHERE w.id = ?', [$ws]);
        $members = (int) Database::scalar('SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ?', [$ws]);

        return [
            'kpi' => $kpi + [
                'conversion_rate' => $closed > 0 ? round($kpi['won'] / $closed * 100, 1) : null,
                'win_rate_all' => $kpi['total_leads'] > 0 ? round($kpi['won'] / $kpi['total_leads'] * 100, 1) : null,
            ],
            'businesses' => $biz,
            'follow_ups' => $follow,
            'monthly' => array_values($monthly),
            'year' => $year,
            'years' => $years,
            'daily' => $daily,
            'upcoming_follow_ups' => array_map(fn ($f) => Fmt::row($f, ['due_at']), $upcoming),
            'recent_activity' => array_map(fn ($a) => Fmt::row($a, ['occurred_at'], [], ['deal_value']), $recent),
            'top_opportunities' => $topOpp,
            'workspace' => Fmt::row($ws_row ?? [], ['created_at']) + ['members' => $members],
            'usage' => Usage::summary(),
        ];
    }

    public static function analytics(Request $r): array
    {
        $ws = Auth::workspaceId();
        $days = (int) ($r->query('days') ?: 90);
        if (!in_array($days, [7, 30, 90, 180, 365], true)) $days = 90;

        $funnelOrder = ['new', 'contacted', 'interested', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'];
        $byStatus = array_column(Database::all('SELECT status, COUNT(*) n, COALESCE(SUM(deal_value),0) v FROM leads WHERE workspace_id = ? GROUP BY status', [$ws]), null, 'status');
        $statuses = array_map(fn ($s) => ['status' => $s, 'count' => (int) ($byStatus[$s]['n'] ?? 0), 'value' => (float) ($byStatus[$s]['v'] ?? 0)], $funnelOrder);

        $series = [];
        $leadRows = array_column(Database::all('SELECT DATE(created_at) d, COUNT(*) n FROM leads WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY) GROUP BY d', [$ws, $days - 1]), 'n', 'd');
        $wonRows = Database::all("SELECT DATE(won_at) d, COUNT(*) n, SUM(deal_value) v FROM leads WHERE workspace_id = ? AND status='won' AND won_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY) GROUP BY d", [$ws, $days - 1]);
        $wonBy = array_column($wonRows, null, 'd');
        $bizRows = array_column(Database::all('SELECT DATE(discovered_at) d, COUNT(*) n FROM businesses WHERE workspace_id = ? AND discovered_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY) GROUP BY d', [$ws, $days - 1]), 'n', 'd');
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = gmdate('Y-m-d', strtotime("-$i days"));
            $series[] = ['date' => $d, 'leads' => (int) ($leadRows[$d] ?? 0), 'discovered' => (int) ($bizRows[$d] ?? 0),
                'won' => (int) ($wonBy[$d]['n'] ?? 0), 'revenue' => (float) ($wonBy[$d]['v'] ?? 0)];
        }

        $categories = array_map(fn ($c) => ['category' => $c['category'], 'label' => Categories::ALL[$c['category']]['label'] ?? ($c['category'] ?: 'Uncategorised'),
            'leads' => (int) $c['n'], 'won' => (int) $c['w'], 'revenue' => (float) $c['v']],
            Database::all("SELECT COALESCE(category,'') category, COUNT(*) n, SUM(status='won') w, COALESCE(SUM(CASE WHEN status='won' THEN deal_value END),0) v
                FROM leads WHERE workspace_id = ? GROUP BY category ORDER BY n DESC LIMIT 12", [$ws]));

        $websiteStatus = array_map(fn ($w) => ['status' => $w['website_status'], 'count' => (int) $w['n']],
            Database::all('SELECT website_status, COUNT(*) n FROM businesses WHERE workspace_id = ? GROUP BY website_status', [$ws]));

        $bands = Database::one('SELECT SUM(opportunity_score < 25) low, SUM(opportunity_score >= 25 AND opportunity_score < 50) medium,
            SUM(opportunity_score >= 50 AND opportunity_score < 75) high, SUM(opportunity_score >= 75) very_high FROM businesses WHERE workspace_id = ?', [$ws]);

        $activity = array_map(fn ($a) => ['type' => $a['type'], 'count' => (int) $a['n']],
            Database::all("SELECT type, COUNT(*) n FROM lead_activities WHERE workspace_id = ? AND type IN ('call','email','meeting','whatsapp','note')
                AND occurred_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY) GROUP BY type", [$ws, $days]));

        $cycle = Database::scalar("SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, won_at)) / 24 FROM leads WHERE workspace_id = ? AND status = 'won' AND won_at IS NOT NULL", [$ws]);
        $avgDeal = Database::scalar("SELECT AVG(deal_value) FROM leads WHERE workspace_id = ? AND status = 'won'", [$ws]);
        $lostReasons = Database::all("SELECT lost_reason AS reason, COUNT(*) n FROM leads WHERE workspace_id = ? AND status='lost' AND lost_reason IS NOT NULL AND lost_reason <> '' GROUP BY lost_reason ORDER BY n DESC LIMIT 6", [$ws]);
        $taskStats = Database::one("SELECT SUM(status='done') done, SUM(status<>'done') open, SUM(status<>'done' AND due_at < UTC_TIMESTAMP()) overdue FROM tasks WHERE workspace_id = ?", [$ws]);

        return [
            'days' => $days,
            'statuses' => $statuses,
            'series' => $series,
            'categories' => $categories,
            'website_status' => $websiteStatus,
            'score_bands' => array_map(fn ($v) => (int) ($v ?? 0), $bands ?? []),
            'activity' => $activity,
            'avg_sales_cycle_days' => $cycle !== null ? round((float) $cycle, 1) : null,
            'avg_deal_value' => $avgDeal !== null ? round((float) $avgDeal, 2) : null,
            'lost_reasons' => array_map(fn ($l) => ['reason' => $l['reason'], 'count' => (int) $l['n']], $lostReasons),
            'tasks' => array_map(fn ($v) => (int) ($v ?? 0), $taskStats ?? []),
        ];
    }
}
