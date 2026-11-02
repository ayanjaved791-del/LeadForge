<?php
declare(strict_types=1);

namespace LeadForge\Controllers;

use LeadForge\Core\Auth;
use LeadForge\Core\Database;
use LeadForge\Core\Fmt;
use LeadForge\Core\HttpException;
use LeadForge\Core\Request;
use LeadForge\Core\Response;
use LeadForge\Core\Scope;
use LeadForge\Core\Uuid;
use LeadForge\Core\Validator;
use LeadForge\Services\Businesses;
use LeadForge\Services\Usage;

final class LeadController
{
    public const STATUSES = ['new', 'contacted', 'interested', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'];
    public const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

    private const LIST_SQL = "SELECT l.*, b.opportunity_score, b.website_status, b.lat, b.lng,
            (SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '\x1f') FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = l.id) AS tag_list,
            (SELECT MIN(f.due_at) FROM follow_ups f WHERE f.lead_id = l.id AND f.status = 'pending') AS next_follow_up_at,
            (SELECT MAX(a.occurred_at) FROM lead_activities a WHERE a.lead_id = l.id AND a.type NOT IN ('system','status_change')) AS last_activity_at
        FROM leads l LEFT JOIN businesses b ON b.id = l.business_id";

    /** @return array<string,mixed> */
    public static function format(array $l): array
    {
        $tags = $l['tag_list'] ?? null;
        unset($l['tag_list'], $l['position']);
        $l = Fmt::row($l, ['won_at', 'lost_at', 'created_at', 'updated_at', 'next_follow_up_at', 'last_activity_at'],
            ['opportunity_score'], ['deal_value', 'lat', 'lng']);
        $l['tags'] = $tags ? explode("\x1f", $tags) : [];
        return $l;
    }

    /** @return array{0:string,1:array<string,mixed>} */
    private static function filters(Request $r): array
    {
        $where = ['l.workspace_id = :ws'];
        $p = ['ws' => Auth::workspaceId()];
        if ($q = $r->query('q')) {
            $where[] = '(l.name LIKE :q1 OR l.email LIKE :q2 OR l.phone LIKE :q3 OR l.address LIKE :q4)';
            $p['q1'] = $p['q2'] = $p['q3'] = $p['q4'] = Fmt::like((string) $q);
        }
        if (($s = $r->query('status')) && in_array($s, self::STATUSES, true)) { $where[] = 'l.status = :st'; $p['st'] = $s; }
        if (($pr = $r->query('priority')) && in_array($pr, self::PRIORITIES, true)) { $where[] = 'l.priority = :pr'; $p['pr'] = $pr; }
        if ($c = $r->query('category')) { $where[] = 'l.category = :cat'; $p['cat'] = $c; }
        if ($t = $r->query('tag')) {
            $where[] = 'EXISTS (SELECT 1 FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = l.id AND t.name = :tag)';
            $p['tag'] = $t;
        }
        if ($r->query('follow_up') === 'overdue') $where[] = "EXISTS (SELECT 1 FROM follow_ups f WHERE f.lead_id = l.id AND f.status='pending' AND f.due_at < UTC_TIMESTAMP())";
        if ($r->query('follow_up') === 'upcoming') $where[] = "EXISTS (SELECT 1 FROM follow_ups f WHERE f.lead_id = l.id AND f.status='pending' AND f.due_at >= UTC_TIMESTAMP())";
        return [implode(' AND ', $where), $p];
    }

    public static function list(Request $r): array
    {
        [$where, $p] = self::filters($r);
        $sort = match ($r->query('sort')) {
            'name' => 'l.name ASC', 'value' => 'l.deal_value DESC', 'score' => 'b.opportunity_score DESC',
            'updated' => 'l.updated_at DESC', 'follow_up' => 'next_follow_up_at IS NULL, next_follow_up_at ASC',
            'pipeline' => 'l.position ASC, l.created_at DESC', default => 'l.created_at DESC',
        };
        $limit = max(1, min(500, (int) ($r->query('limit') ?: 25)));
        $page = max(1, (int) ($r->query('page') ?: 1));
        $total = (int) Database::scalar("SELECT COUNT(*) FROM leads l LEFT JOIN businesses b ON b.id = l.business_id WHERE $where", $p);
        $rows = Database::all(self::LIST_SQL . " WHERE $where ORDER BY $sort LIMIT $limit OFFSET " . (($page - 1) * $limit), $p);
        $tags = Database::all('SELECT name FROM tags WHERE workspace_id = ? ORDER BY name', [Auth::workspaceId()]);
        return ['total' => $total, 'page' => $page, 'limit' => $limit, 'items' => array_map([self::class, 'format'], $rows),
            'all_tags' => array_column($tags, 'name')];
    }

    public static function show(Request $r): array
    {
        $lead = Scope::find('leads', $r->param('id'), 'Lead');
        $row = Database::one(self::LIST_SQL . ' WHERE l.id = ?', [$lead['id']]);
        $out = self::format($row);
        if ($lead['business_id']) {
            $b = Database::one('SELECT * FROM businesses WHERE id = ?', [$lead['business_id']]);
            $out['business'] = $b ? Businesses::format($b + ['lead_id' => $lead['id']]) : null;
        } else {
            $out['business'] = null;
        }
        $id = $lead['id'];
        $out['notes'] = array_map(fn ($n) => Fmt::row($n, ['created_at', 'updated_at']),
            Database::all('SELECT n.id, n.body, n.created_at, n.updated_at, u.name AS author FROM lead_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.lead_id = ? ORDER BY n.created_at DESC', [$id]));
        $out['activities'] = array_map(fn ($a) => CrmController::formatActivity($a),
            Database::all('SELECT a.*, u.name AS author, CONCAT_WS(" ", c.first_name, c.last_name) AS contact_name FROM lead_activities a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN contacts c ON c.id = a.contact_id WHERE a.lead_id = ? ORDER BY a.occurred_at DESC LIMIT 200', [$id]));
        $out['follow_ups'] = array_map(fn ($f) => Fmt::row($f, ['due_at', 'completed_at', 'created_at', 'notified_at']),
            Database::all('SELECT * FROM follow_ups WHERE lead_id = ? ORDER BY status = "pending" DESC, due_at ASC', [$id]));
        $out['tasks'] = array_map(fn ($t) => Fmt::row($t, ['due_at', 'completed_at', 'created_at', 'updated_at']),
            Database::all('SELECT * FROM tasks WHERE lead_id = ? ORDER BY status = "done", due_at IS NULL, due_at', [$id]));
        $out['contacts'] = array_map(fn ($c) => Fmt::row($c, ['created_at', 'updated_at']),
            Database::all('SELECT * FROM contacts WHERE lead_id = ? ORDER BY first_name', [$id]));
        $out['audits'] = array_map([AuditController::class, 'format'],
            Database::all('SELECT * FROM website_audits WHERE lead_id = ? OR (business_id IS NOT NULL AND business_id = ?) ORDER BY created_at DESC LIMIT 10', [$id, $lead['business_id']]));
        return $out;
    }

    private const RULES = [
        'name' => 'string|min:1|max:255', 'category' => 'nullable|string|max:60', 'address' => 'nullable|string|max:500',
        'phone' => 'nullable|string|max:80', 'email' => 'nullable|email|max:191', 'website' => 'nullable|url|max:500',
        'status' => 'in:new,contacted,interested,qualified,proposal_sent,negotiation,won,lost',
        'priority' => 'in:low,medium,high,urgent', 'deal_value' => 'numeric', 'lost_reason' => 'nullable|string|max:255',
        'tags' => 'array|max:20', 'business_id' => 'nullable|uuid', 'follow_up_at' => 'nullable|date', 'note' => 'nullable|string|max:5000',
    ];

    public static function create(Request $r): array
    {
        $d = Validator::validate($r->all(), self::RULES);
        $ws = Auth::workspaceId();
        $lead = ['id' => Uuid::v4(), 'workspace_id' => $ws, 'owner_id' => Auth::id(), 'status' => $d['status'] ?? 'new',
            'priority' => $d['priority'] ?? 'medium', 'deal_value' => max(0, (float) ($d['deal_value'] ?? 0))];

        if (!empty($d['business_id'])) {
            $b = Scope::find('businesses', $d['business_id'], 'Business');
            $existing = Database::scalar('SELECT id FROM leads WHERE business_id = ? AND workspace_id = ?', [$b['id'], $ws]);
            if ($existing) throw new HttpException(409, 'This business is already saved as a lead.');
            $fb = Businesses::format($b);
            $lead += ['business_id' => $b['id'], 'name' => $b['name'], 'category' => $b['category'], 'address' => $fb['address'],
                'phone' => $b['phone'], 'email' => $b['email'], 'website' => $b['website']];
        } else {
            if (empty($d['name'])) throw HttpException::validation(['name' => 'This field is required.']);
        }
        foreach (['name', 'category', 'address', 'phone', 'email', 'website'] as $f) if (!empty($d[$f])) $lead[$f] = $d[$f];
        if ($lead['status'] === 'won') $lead['won_at'] = gmdate('Y-m-d H:i:s');
        if ($lead['status'] === 'lost') $lead['lost_at'] = gmdate('Y-m-d H:i:s');
        $lead['position'] = (int) Database::scalar('SELECT COALESCE(MIN(position), 0) - 1 FROM leads WHERE workspace_id = ? AND status = ?', [$ws, $lead['status']]);

        Database::transaction(function () use ($lead, $d) {
            Database::insert('leads', $lead);
            if (isset($d['tags'])) self::syncTags($lead['id'], $d['tags']);
            self::logSystem($lead['id'], 'Lead created' . (!empty($lead['business_id']) ? ' from discovery' : ''));
            if (!empty($d['note'])) Database::insert('lead_notes', ['id' => Uuid::v4(), 'workspace_id' => $lead['workspace_id'], 'lead_id' => $lead['id'], 'user_id' => Auth::id(), 'body' => $d['note']]);
            if (!empty($d['follow_up_at'])) Database::insert('follow_ups', ['id' => Uuid::v4(), 'workspace_id' => $lead['workspace_id'], 'lead_id' => $lead['id'], 'user_id' => Auth::id(), 'due_at' => $d['follow_up_at'], 'channel' => 'call']);
        });
        $r->params['id'] = $lead['id'];
        return self::show($r);
    }

    public static function update(Request $r): array
    {
        $lead = Scope::find('leads', $r->param('id'), 'Lead');
        $d = Validator::validate($r->all(), self::RULES);
        $row = array_intersect_key($d, array_flip(['name', 'category', 'address', 'phone', 'email', 'website', 'status', 'priority', 'deal_value', 'lost_reason']));
        if (array_key_exists('name', $row) && !$row['name']) throw HttpException::validation(['name' => 'This field is required.']);
        if (isset($row['deal_value'])) $row['deal_value'] = max(0, (float) $row['deal_value']);
        Database::transaction(function () use ($lead, $row, $d) {
            if (isset($row['status']) && $row['status'] !== $lead['status']) {
                $row += self::statusSideEffects($lead, $row['status']);
            }
            Database::update('leads', $row, ['id' => $lead['id'], 'workspace_id' => Auth::workspaceId()]);
            if (isset($d['tags'])) self::syncTags($lead['id'], $d['tags']);
        });
        return self::show($r);
    }

    /** Pipeline drag & drop: move a lead to a status column at an index. */
    public static function move(Request $r): array
    {
        $lead = Scope::find('leads', $r->param('id'), 'Lead');
        $d = Validator::validate($r->all(), ['status' => 'required|in:' . implode(',', self::STATUSES), 'index' => 'required|int']);
        Database::transaction(function () use ($lead, $d) {
            $ids = array_column(Database::all('SELECT id FROM leads WHERE workspace_id = ? AND status = ? AND id <> ? ORDER BY position, created_at DESC',
                [Auth::workspaceId(), $d['status'], $lead['id']]), 'id');
            array_splice($ids, max(0, min(count($ids), (int) $d['index'])), 0, [$lead['id']]);
            $row = ['status' => $d['status']];
            if ($d['status'] !== $lead['status']) $row += self::statusSideEffects($lead, $d['status']);
            Database::update('leads', $row, ['id' => $lead['id']]);
            foreach ($ids as $i => $id) Database::run('UPDATE leads SET position = ? WHERE id = ?', [$i, $id]);
        });
        return ['moved' => true];
    }

    /** @return array<string,mixed> */
    private static function statusSideEffects(array $lead, string $new): array
    {
        $extra = [];
        $extra['won_at'] = $new === 'won' ? ($lead['won_at'] ?? gmdate('Y-m-d H:i:s')) : null;
        $extra['lost_at'] = $new === 'lost' ? ($lead['lost_at'] ?? gmdate('Y-m-d H:i:s')) : null;
        $label = fn ($s) => ucwords(str_replace('_', ' ', $s));
        Database::insert('lead_activities', ['id' => Uuid::v4(), 'workspace_id' => Auth::workspaceId(), 'lead_id' => $lead['id'],
            'user_id' => Auth::id(), 'type' => 'status_change', 'subject' => 'Status changed',
            'body' => $label($lead['status']) . ' → ' . $label($new), 'occurred_at' => gmdate('Y-m-d H:i:s')]);
        return $extra;
    }

    public static function delete(Request $r): array
    {
        $lead = Scope::find('leads', $r->param('id'), 'Lead');
        Database::run('DELETE FROM leads WHERE id = ? AND workspace_id = ?', [$lead['id'], Auth::workspaceId()]);
        return ['deleted' => true];
    }

    public static function bulkDelete(Request $r): array
    {
        $ids = $r->input('ids');
        if (!is_array($ids) || !$ids || count($ids) > 500) throw HttpException::validation(['ids' => 'Select leads to delete.']);
        $ids = array_values(array_filter($ids, [Uuid::class, 'isValid']));
        if (!$ids) return ['deleted' => 0];
        $in = implode(',', array_fill(0, count($ids), '?'));
        $n = Database::run("DELETE FROM leads WHERE workspace_id = ? AND id IN ($in)", array_merge([Auth::workspaceId()], $ids))->rowCount();
        return ['deleted' => $n];
    }

    public static function export(Request $r): never
    {
        Usage::consume('lead_export');
        [$where, $p] = self::filters($r);
        $rows = Database::all(self::LIST_SQL . " WHERE $where ORDER BY l.created_at DESC LIMIT 10000", $p);
        $header = ['Name', 'Category', 'Status', 'Priority', 'Deal value', 'Opportunity score', 'Website status', 'Phone', 'Email', 'Website', 'Address', 'Tags', 'Next follow-up (UTC)', 'Created (UTC)'];
        $out = (function () use ($rows) {
            foreach ($rows as $l) {
                yield [$l['name'], $l['category'], $l['status'], $l['priority'], $l['deal_value'], $l['opportunity_score'], $l['website_status'],
                    $l['phone'], $l['email'], $l['website'], $l['address'], str_replace("\x1f", '; ', (string) $l['tag_list']), $l['next_follow_up_at'], $l['created_at']];
            }
        })();
        Response::csv('leadforge-leads-' . gmdate('Y-m-d') . '.csv', $header, $out);
    }

    // ---- notes ----
    public static function addNote(Request $r): array
    {
        $lead = Scope::find('leads', $r->param('id'), 'Lead');
        $d = Validator::validate($r->all(), ['body' => 'required|string|max:5000']);
        $id = Uuid::v4();
        Database::insert('lead_notes', ['id' => $id, 'workspace_id' => Auth::workspaceId(), 'lead_id' => $lead['id'], 'user_id' => Auth::id(), 'body' => $d['body']]);
        Database::run('UPDATE leads SET updated_at = UTC_TIMESTAMP() WHERE id = ?', [$lead['id']]);
        return ['id' => $id];
    }

    public static function deleteNote(Request $r): array
    {
        $n = Scope::find('lead_notes', $r->param('noteId'), 'Note');
        Database::run('DELETE FROM lead_notes WHERE id = ?', [$n['id']]);
        return ['deleted' => true];
    }

    public static function tags(Request $r): array
    {
        return Database::all('SELECT t.name, COUNT(lt.lead_id) AS lead_count FROM tags t LEFT JOIN lead_tags lt ON lt.tag_id = t.id WHERE t.workspace_id = ? GROUP BY t.id ORDER BY t.name', [Auth::workspaceId()]);
    }

    /** @param list<mixed> $names */
    private static function syncTags(string $leadId, array $names): void
    {
        $ws = Auth::workspaceId();
        $clean = [];
        foreach ($names as $n) {
            if (!is_string($n)) continue;
            $n = mb_substr(trim(preg_replace('/\s+/', ' ', $n) ?? ''), 0, 50);
            if ($n !== '') $clean[mb_strtolower($n)] = $n;
        }
        Database::run('DELETE FROM lead_tags WHERE lead_id = ?', [$leadId]);
        foreach ($clean as $name) {
            $tagId = Database::scalar('SELECT id FROM tags WHERE workspace_id = ? AND name = ?', [$ws, $name]);
            if (!$tagId) { $tagId = Uuid::v4(); Database::insert('tags', ['id' => $tagId, 'workspace_id' => $ws, 'name' => $name]); }
            Database::run('INSERT IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)', [$leadId, $tagId]);
        }
        Database::run('DELETE t FROM tags t LEFT JOIN lead_tags lt ON lt.tag_id = t.id WHERE t.workspace_id = ? AND lt.tag_id IS NULL', [$ws]);
    }

    private static function logSystem(string $leadId, string $subject): void
    {
        Database::insert('lead_activities', ['id' => Uuid::v4(), 'workspace_id' => Auth::workspaceId(), 'lead_id' => $leadId,
            'user_id' => Auth::id(), 'type' => 'system', 'subject' => $subject, 'occurred_at' => gmdate('Y-m-d H:i:s')]);
    }
}
