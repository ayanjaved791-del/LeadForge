<?php
declare(strict_types=1);

namespace LeadForge\Controllers;

use LeadForge\Core\Auth;
use LeadForge\Core\Database;
use LeadForge\Core\Fmt;
use LeadForge\Core\HttpException;
use LeadForge\Core\Request;
use LeadForge\Core\Scope;
use LeadForge\Core\Uuid;
use LeadForge\Core\Validator;

/** Contacts, activities, tasks, follow-ups, calendar events and email templates. */
final class CrmController
{
    private static function touchLead(?string $leadId): void
    {
        if ($leadId) Database::run('UPDATE leads SET updated_at = UTC_TIMESTAMP() WHERE id = ?', [$leadId]);
    }

    private static function paging(Request $r, int $default = 50): array
    {
        $limit = max(1, min(500, (int) ($r->query('limit') ?: $default)));
        $page = max(1, (int) ($r->query('page') ?: 1));
        return [$limit, $page, ($page - 1) * $limit];
    }

    // ------------------------------------------------------------------ contacts
    private const CONTACT_RULES = [
        'first_name' => 'string|min:1|max:80', 'last_name' => 'nullable|string|max:80', 'job_title' => 'nullable|string|max:120',
        'email' => 'nullable|email|max:191', 'phone' => 'nullable|string|max:40', 'whatsapp' => 'nullable|string|max:40',
        'notes' => 'nullable|string|max:5000', 'lead_id' => 'nullable|uuid',
    ];

    public static function contacts(Request $r): array
    {
        $where = 'c.workspace_id = :ws';
        $p = ['ws' => Auth::workspaceId()];
        if ($q = $r->query('q')) {
            $where .= ' AND (c.first_name LIKE :a OR c.last_name LIKE :b OR c.email LIKE :c OR c.phone LIKE :d OR l.name LIKE :e)';
            $p['a'] = $p['b'] = $p['c'] = $p['d'] = $p['e'] = Fmt::like((string) $q);
        }
        if ($lid = $r->query('lead_id')) { $where .= ' AND c.lead_id = :lid'; $p['lid'] = $lid; }
        [$limit, $page, $offset] = self::paging($r);
        $total = (int) Database::scalar("SELECT COUNT(*) FROM contacts c LEFT JOIN leads l ON l.id = c.lead_id WHERE $where", $p);
        $rows = Database::all("SELECT c.*, l.name AS lead_name, l.status AS lead_status,
                (SELECT MAX(a.occurred_at) FROM lead_activities a WHERE a.contact_id = c.id) AS last_contacted_at
            FROM contacts c LEFT JOIN leads l ON l.id = c.lead_id WHERE $where ORDER BY c.first_name, c.last_name LIMIT $limit OFFSET $offset", $p);
        return ['total' => $total, 'page' => $page, 'limit' => $limit,
            'items' => array_map(fn ($c) => Fmt::row($c, ['created_at', 'updated_at', 'last_contacted_at']), $rows)];
    }

    public static function createContact(Request $r): array
    {
        $d = Validator::validate($r->all(), ['first_name' => 'required|string|max:80'] + self::CONTACT_RULES);
        $d['lead_id'] = Scope::optional('leads', $d['lead_id'] ?? null, 'Lead');
        $id = Uuid::v4();
        Database::insert('contacts', ['id' => $id, 'workspace_id' => Auth::workspaceId()] + $d);
        self::touchLead($d['lead_id']);
        return Fmt::row(Scope::find('contacts', $id), ['created_at', 'updated_at']);
    }

    public static function updateContact(Request $r): array
    {
        $c = Scope::find('contacts', $r->param('id'), 'Contact');
        $d = Validator::validate($r->all(), self::CONTACT_RULES);
        if (array_key_exists('lead_id', $d)) $d['lead_id'] = Scope::optional('leads', $d['lead_id'], 'Lead');
        if (array_key_exists('first_name', $d) && !$d['first_name']) throw HttpException::validation(['first_name' => 'This field is required.']);
        Database::update('contacts', $d, ['id' => $c['id']]);
        return Fmt::row(Scope::find('contacts', $c['id']), ['created_at', 'updated_at']);
    }

    public static function deleteContact(Request $r): array
    {
        $c = Scope::find('contacts', $r->param('id'), 'Contact');
        Database::run('DELETE FROM contacts WHERE id = ?', [$c['id']]);
        return ['deleted' => true];
    }

    // ---------------------------------------------------------------- activities
    public static function formatActivity(array $a): array
    {
        return Fmt::row($a, ['occurred_at', 'created_at'], ['duration_minutes']);
    }

    public static function activities(Request $r): array
    {
        $where = 'a.workspace_id = :ws';
        $p = ['ws' => Auth::workspaceId()];
        $types = ['call', 'email', 'meeting', 'whatsapp', 'note', 'status_change', 'system'];
        if (($t = $r->query('type')) && in_array($t, $types, true)) { $where .= ' AND a.type = :t'; $p['t'] = $t; }
        else $where .= " AND a.type NOT IN ('system')";
        if ($lid = $r->query('lead_id')) { $where .= ' AND a.lead_id = :lid'; $p['lid'] = $lid; }
        [$limit, $page, $offset] = self::paging($r);
        $total = (int) Database::scalar("SELECT COUNT(*) FROM lead_activities a WHERE $where", $p);
        $rows = Database::all("SELECT a.*, l.name AS lead_name, u.name AS author, CONCAT_WS(' ', c.first_name, c.last_name) AS contact_name
            FROM lead_activities a JOIN leads l ON l.id = a.lead_id LEFT JOIN users u ON u.id = a.user_id LEFT JOIN contacts c ON c.id = a.contact_id
            WHERE $where ORDER BY a.occurred_at DESC LIMIT $limit OFFSET $offset", $p);
        $counts = Database::all("SELECT type, COUNT(*) AS n FROM lead_activities WHERE workspace_id = ? AND type IN ('call','email','meeting','whatsapp','note') GROUP BY type", [Auth::workspaceId()]);
        return ['total' => $total, 'page' => $page, 'limit' => $limit, 'items' => array_map([self::class, 'formatActivity'], $rows),
            'counts' => array_column($counts, 'n', 'type')];
    }

    public static function createActivity(Request $r): array
    {
        $d = Validator::validate($r->all(), [
            'lead_id' => 'required|uuid', 'contact_id' => 'nullable|uuid', 'type' => 'required|in:call,email,meeting,whatsapp,note',
            'direction' => 'nullable|in:inbound,outbound', 'subject' => 'nullable|string|max:255', 'body' => 'nullable|string|max:10000',
            'outcome' => 'nullable|string|max:120', 'duration_minutes' => 'nullable|int', 'occurred_at' => 'nullable|date',
        ]);
        Scope::find('leads', $d['lead_id'], 'Lead');
        $d['contact_id'] = Scope::optional('contacts', $d['contact_id'] ?? null, 'Contact');
        if (isset($d['duration_minutes']) && ($d['duration_minutes'] < 0 || $d['duration_minutes'] > 1440)) throw HttpException::validation(['duration_minutes' => 'Must be 0–1440 minutes.']);
        $id = Uuid::v4();
        Database::insert('lead_activities', ['id' => $id, 'workspace_id' => Auth::workspaceId(), 'user_id' => Auth::id(),
            'occurred_at' => $d['occurred_at'] ?? gmdate('Y-m-d H:i:s')] + $d);
        // First outreach automatically moves a brand-new lead to "contacted".
        if (in_array($d['type'], ['call', 'email', 'meeting', 'whatsapp'], true) && ($d['direction'] ?? 'outbound') === 'outbound') {
            $lead = Database::one('SELECT status FROM leads WHERE id = ?', [$d['lead_id']]);
            if ($lead && $lead['status'] === 'new') {
                Database::run("UPDATE leads SET status = 'contacted' WHERE id = ?", [$d['lead_id']]);
                Database::insert('lead_activities', ['id' => Uuid::v4(), 'workspace_id' => Auth::workspaceId(), 'lead_id' => $d['lead_id'], 'user_id' => Auth::id(),
                    'type' => 'status_change', 'subject' => 'Status changed', 'body' => 'New → Contacted', 'occurred_at' => gmdate('Y-m-d H:i:s')]);
            }
        }
        self::touchLead($d['lead_id']);
        return ['id' => $id];
    }

    public static function deleteActivity(Request $r): array
    {
        $a = Scope::find('lead_activities', $r->param('id'), 'Activity');
        if (in_array($a['type'], ['system', 'status_change'], true)) throw HttpException::forbidden('System history entries cannot be deleted.');
        Database::run('DELETE FROM lead_activities WHERE id = ?', [$a['id']]);
        return ['deleted' => true];
    }

    // --------------------------------------------------------------------- tasks
    private const TASK_RULES = [
        'title' => 'string|min:1|max:255', 'description' => 'nullable|string|max:5000', 'priority' => 'in:low,medium,high,urgent',
        'status' => 'in:todo,in_progress,done', 'due_at' => 'nullable|date', 'lead_id' => 'nullable|uuid', 'assigned_to' => 'nullable|uuid',
    ];

    public static function tasks(Request $r): array
    {
        $where = 't.workspace_id = :ws';
        $p = ['ws' => Auth::workspaceId()];
        if (($s = $r->query('status')) && in_array($s, ['todo', 'in_progress', 'done'], true)) { $where .= ' AND t.status = :s'; $p['s'] = $s; }
        if ($r->query('status') === 'open') $where .= " AND t.status <> 'done'";
        if ($r->query('due') === 'overdue') $where .= " AND t.status <> 'done' AND t.due_at < UTC_TIMESTAMP()";
        if ($r->query('due') === 'today') $where .= " AND DATE(t.due_at) = UTC_DATE()";
        if ($r->query('mine') === '1') { $where .= ' AND t.assigned_to = :me'; $p['me'] = Auth::id(); }
        if ($lid = $r->query('lead_id')) { $where .= ' AND t.lead_id = :lid'; $p['lid'] = $lid; }
        if ($q = $r->query('q')) { $where .= ' AND t.title LIKE :q'; $p['q'] = Fmt::like((string) $q); }
        [$limit, $page, $offset] = self::paging($r, 100);
        $total = (int) Database::scalar("SELECT COUNT(*) FROM tasks t WHERE $where", $p);
        $rows = Database::all("SELECT t.*, l.name AS lead_name, u.name AS assignee_name FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id
            LEFT JOIN users u ON u.id = t.assigned_to WHERE $where
            ORDER BY t.status = 'done', t.due_at IS NULL, t.due_at ASC, FIELD(t.priority,'urgent','high','medium','low') LIMIT $limit OFFSET $offset", $p);
        $counts = Database::one("SELECT SUM(status='todo') todo, SUM(status='in_progress') in_progress, SUM(status='done') done,
            SUM(status<>'done' AND due_at < UTC_TIMESTAMP()) overdue FROM tasks WHERE workspace_id = ?", [Auth::workspaceId()]);
        return ['total' => $total, 'page' => $page, 'limit' => $limit,
            'items' => array_map(fn ($t) => Fmt::row($t, ['due_at', 'completed_at', 'created_at', 'updated_at']), $rows),
            'counts' => array_map('intval', $counts ?? [])];
    }

    private static function assertMember(?string $userId): ?string
    {
        if (!$userId) return null;
        if (!Database::scalar('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [Auth::workspaceId(), $userId])) {
            throw HttpException::validation(['assigned_to' => 'Assignee must be a workspace member.']);
        }
        return $userId;
    }

    public static function createTask(Request $r): array
    {
        $d = Validator::validate($r->all(), ['title' => 'required|string|max:255'] + self::TASK_RULES);
        $d['lead_id'] = Scope::optional('leads', $d['lead_id'] ?? null, 'Lead');
        $d['assigned_to'] = self::assertMember($d['assigned_to'] ?? Auth::id());
        $id = Uuid::v4();
        if (($d['status'] ?? null) === 'done') $d['completed_at'] = gmdate('Y-m-d H:i:s');
        Database::insert('tasks', ['id' => $id, 'workspace_id' => Auth::workspaceId(), 'created_by' => Auth::id()] + $d);
        self::touchLead($d['lead_id']);
        return Fmt::row(Scope::find('tasks', $id), ['due_at', 'completed_at', 'created_at', 'updated_at']);
    }

    public static function updateTask(Request $r): array
    {
        $t = Scope::find('tasks', $r->param('id'), 'Task');
        $d = Validator::validate($r->all(), self::TASK_RULES);
        if (array_key_exists('lead_id', $d)) $d['lead_id'] = Scope::optional('leads', $d['lead_id'], 'Lead');
        if (array_key_exists('assigned_to', $d)) $d['assigned_to'] = self::assertMember($d['assigned_to']);
        if (isset($d['status'])) $d['completed_at'] = $d['status'] === 'done' ? ($t['completed_at'] ?? gmdate('Y-m-d H:i:s')) : null;
        Database::update('tasks', $d, ['id' => $t['id']]);
        return Fmt::row(Scope::find('tasks', $t['id']), ['due_at', 'completed_at', 'created_at', 'updated_at']);
    }

    public static function deleteTask(Request $r): array
    {
        $t = Scope::find('tasks', $r->param('id'), 'Task');
        Database::run('DELETE FROM tasks WHERE id = ?', [$t['id']]);
        return ['deleted' => true];
    }

    // ---------------------------------------------------------------- follow-ups
    public static function followUps(Request $r): array
    {
        $where = 'f.workspace_id = :ws';
        $p = ['ws' => Auth::workspaceId()];
        $scope = $r->query('scope', 'pending');
        if ($scope === 'pending') $where .= " AND f.status = 'pending'";
        if ($scope === 'overdue') $where .= " AND f.status = 'pending' AND f.due_at < UTC_TIMESTAMP()";
        if ($scope === 'upcoming') $where .= " AND f.status = 'pending' AND f.due_at >= UTC_TIMESTAMP()";
        if ($scope === 'done') $where .= " AND f.status <> 'pending'";
        if ($lid = $r->query('lead_id')) { $where .= ' AND f.lead_id = :lid'; $p['lid'] = $lid; }
        [$limit, $page, $offset] = self::paging($r, 100);
        $order = $scope === 'done' ? 'f.completed_at DESC' : 'f.due_at ASC';
        $total = (int) Database::scalar("SELECT COUNT(*) FROM follow_ups f WHERE $where", $p);
        $rows = Database::all("SELECT f.*, l.name AS lead_name, l.status AS lead_status, l.phone AS lead_phone, l.email AS lead_email
            FROM follow_ups f JOIN leads l ON l.id = f.lead_id WHERE $where ORDER BY $order LIMIT $limit OFFSET $offset", $p);
        $counts = Database::one("SELECT SUM(status='pending' AND due_at < UTC_TIMESTAMP()) overdue,
            SUM(status='pending' AND DATE(due_at) = UTC_DATE()) today, SUM(status='pending') pending, SUM(status<>'pending') done
            FROM follow_ups WHERE workspace_id = ?", [Auth::workspaceId()]);
        return ['total' => $total, 'page' => $page, 'limit' => $limit,
            'items' => array_map(fn ($f) => Fmt::row($f, ['due_at', 'completed_at', 'created_at', 'notified_at']), $rows),
            'counts' => array_map('intval', $counts ?? [])];
    }

    public static function createFollowUp(Request $r): array
    {
        $d = Validator::validate($r->all(), ['lead_id' => 'required|uuid', 'due_at' => 'required|date',
            'channel' => 'in:call,email,meeting,whatsapp,other', 'note' => 'nullable|string|max:500']);
        Scope::find('leads', $d['lead_id'], 'Lead');
        $id = Uuid::v4();
        Database::insert('follow_ups', ['id' => $id, 'workspace_id' => Auth::workspaceId(), 'user_id' => Auth::id(), 'channel' => $d['channel'] ?? 'call'] + $d);
        self::touchLead($d['lead_id']);
        return Fmt::row(Scope::find('follow_ups', $id), ['due_at', 'completed_at', 'created_at', 'notified_at']);
    }

    public static function updateFollowUp(Request $r): array
    {
        $f = Scope::find('follow_ups', $r->param('id'), 'Follow-up');
        $d = Validator::validate($r->all(), ['due_at' => 'date', 'channel' => 'in:call,email,meeting,whatsapp,other',
            'note' => 'nullable|string|max:500', 'status' => 'in:pending,done,skipped']);
        if (isset($d['status'])) $d['completed_at'] = $d['status'] === 'pending' ? null : gmdate('Y-m-d H:i:s');
        if (isset($d['due_at'])) $d['notified_at'] = null;
        Database::update('follow_ups', $d, ['id' => $f['id']]);
        return Fmt::row(Scope::find('follow_ups', $f['id']), ['due_at', 'completed_at', 'created_at', 'notified_at']);
    }

    public static function deleteFollowUp(Request $r): array
    {
        $f = Scope::find('follow_ups', $r->param('id'), 'Follow-up');
        Database::run('DELETE FROM follow_ups WHERE id = ?', [$f['id']]);
        return ['deleted' => true];
    }

    // ------------------------------------------------------------------ calendar
    /** Unified calendar feed: events + pending follow-ups + tasks with due dates. */
    public static function calendar(Request $r): array
    {
        $from = strtotime((string) $r->query('from')) ?: strtotime('first day of this month 00:00 UTC');
        $to = strtotime((string) $r->query('to')) ?: strtotime('+1 month', $from);
        if ($to - $from > 86400 * 100) $to = $from + 86400 * 100;
        $p = [Auth::workspaceId(), gmdate('Y-m-d H:i:s', $from), gmdate('Y-m-d H:i:s', $to)];
        $events = Database::all('SELECT e.*, l.name AS lead_name FROM calendar_events e LEFT JOIN leads l ON l.id = e.lead_id
            WHERE e.workspace_id = ? AND e.starts_at < ? AND e.ends_at >= ? ORDER BY e.starts_at',
            [Auth::workspaceId(), $p[2], $p[1]]);
        $follow = Database::all("SELECT f.id, f.lead_id, f.due_at, f.channel, f.note, f.status, l.name AS lead_name FROM follow_ups f JOIN leads l ON l.id = f.lead_id
            WHERE f.workspace_id = ? AND f.due_at BETWEEN ? AND ? ORDER BY f.due_at", $p);
        $tasks = Database::all("SELECT t.id, t.lead_id, t.title, t.due_at, t.status, t.priority, l.name AS lead_name FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id
            WHERE t.workspace_id = ? AND t.due_at BETWEEN ? AND ? ORDER BY t.due_at", $p);
        return [
            'events' => array_map(fn ($e) => Fmt::row($e, ['starts_at', 'ends_at', 'created_at']), $events),
            'follow_ups' => array_map(fn ($f) => Fmt::row($f, ['due_at']), $follow),
            'tasks' => array_map(fn ($t) => Fmt::row($t, ['due_at']), $tasks),
        ];
    }

    private const EVENT_RULES = ['title' => 'string|min:1|max:255', 'description' => 'nullable|string|max:5000',
        'type' => 'in:meeting,call,demo,other', 'location' => 'nullable|string|max:255', 'starts_at' => 'date', 'ends_at' => 'date', 'lead_id' => 'nullable|uuid'];

    public static function createEvent(Request $r): array
    {
        $d = Validator::validate($r->all(), ['title' => 'required|string|max:255', 'starts_at' => 'required|date', 'ends_at' => 'required|date'] + self::EVENT_RULES);
        if (strtotime($d['ends_at']) < strtotime($d['starts_at'])) throw HttpException::validation(['ends_at' => 'End must be after start.']);
        $d['lead_id'] = Scope::optional('leads', $d['lead_id'] ?? null, 'Lead');
        $id = Uuid::v4();
        Database::insert('calendar_events', ['id' => $id, 'workspace_id' => Auth::workspaceId(), 'user_id' => Auth::id()] + $d);
        if ($d['lead_id'] && ($d['type'] ?? 'meeting') === 'meeting') {
            Database::insert('lead_activities', ['id' => Uuid::v4(), 'workspace_id' => Auth::workspaceId(), 'lead_id' => $d['lead_id'], 'user_id' => Auth::id(),
                'type' => 'meeting', 'subject' => 'Meeting scheduled: ' . $d['title'], 'body' => $d['description'] ?? null, 'occurred_at' => $d['starts_at']]);
        }
        return Fmt::row(Scope::find('calendar_events', $id), ['starts_at', 'ends_at', 'created_at']);
    }

    public static function updateEvent(Request $r): array
    {
        $e = Scope::find('calendar_events', $r->param('id'), 'Event');
        $d = Validator::validate($r->all(), self::EVENT_RULES);
        if (array_key_exists('lead_id', $d)) $d['lead_id'] = Scope::optional('leads', $d['lead_id'], 'Lead');
        $start = $d['starts_at'] ?? $e['starts_at'];
        $end = $d['ends_at'] ?? $e['ends_at'];
        if (strtotime($end) < strtotime($start)) throw HttpException::validation(['ends_at' => 'End must be after start.']);
        Database::update('calendar_events', $d, ['id' => $e['id']]);
        return Fmt::row(Scope::find('calendar_events', $e['id']), ['starts_at', 'ends_at', 'created_at']);
    }

    public static function deleteEvent(Request $r): array
    {
        $e = Scope::find('calendar_events', $r->param('id'), 'Event');
        Database::run('DELETE FROM calendar_events WHERE id = ?', [$e['id']]);
        return ['deleted' => true];
    }

    // ----------------------------------------------------------- email templates
    public static function templates(Request $r): array
    {
        return array_map(fn ($t) => Fmt::row($t, ['created_at', 'updated_at']),
            Database::all('SELECT * FROM email_templates WHERE workspace_id = ? ORDER BY name', [Auth::workspaceId()]));
    }

    public static function createTemplate(Request $r): array
    {
        $d = Validator::validate($r->all(), ['name' => 'required|string|max:120', 'subject' => 'required|string|max:255', 'body' => 'required|string|max:20000']);
        $id = Uuid::v4();
        Database::insert('email_templates', ['id' => $id, 'workspace_id' => Auth::workspaceId(), 'created_by' => Auth::id()] + $d);
        return Fmt::row(Scope::find('email_templates', $id), ['created_at', 'updated_at']);
    }

    public static function updateTemplate(Request $r): array
    {
        $t = Scope::find('email_templates', $r->param('id'), 'Template');
        $d = Validator::validate($r->all(), ['name' => 'string|min:1|max:120', 'subject' => 'string|min:1|max:255', 'body' => 'string|min:1|max:20000']);
        Database::update('email_templates', $d, ['id' => $t['id']]);
        return Fmt::row(Scope::find('email_templates', $t['id']), ['created_at', 'updated_at']);
    }

    public static function deleteTemplate(Request $r): array
    {
        $t = Scope::find('email_templates', $r->param('id'), 'Template');
        Database::run('DELETE FROM email_templates WHERE id = ?', [$t['id']]);
        return ['deleted' => true];
    }
}
