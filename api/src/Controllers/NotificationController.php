<?php
declare(strict_types=1);

namespace LeadForge\Controllers;

use LeadForge\Core\Auth;
use LeadForge\Core\Database;
use LeadForge\Core\Fmt;
use LeadForge\Core\Request;
use LeadForge\Core\Scope;
use LeadForge\Services\Notifier;

final class NotificationController
{
    public static function list(Request $r): array
    {
        Notifier::syncDue(Auth::workspaceId(), Auth::id());
        $where = 'workspace_id = ? AND user_id = ?';
        if ($r->query('unread') === '1') $where .= ' AND read_at IS NULL';
        $rows = Database::all("SELECT * FROM notifications WHERE $where ORDER BY created_at DESC LIMIT 100", [Auth::workspaceId(), Auth::id()]);
        $unread = (int) Database::scalar('SELECT COUNT(*) FROM notifications WHERE workspace_id = ? AND user_id = ? AND read_at IS NULL', [Auth::workspaceId(), Auth::id()]);
        return ['unread' => $unread, 'items' => array_map(fn ($n) => Fmt::row($n, ['read_at', 'created_at']), $rows)];
    }

    public static function markRead(Request $r): array
    {
        $n = Scope::find('notifications', $r->param('id'), 'Notification');
        if ($n['user_id'] === Auth::id()) Database::run('UPDATE notifications SET read_at = COALESCE(read_at, UTC_TIMESTAMP()) WHERE id = ?', [$n['id']]);
        return ['ok' => true];
    }

    public static function markAll(Request $r): array
    {
        Database::run('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE workspace_id = ? AND user_id = ? AND read_at IS NULL', [Auth::workspaceId(), Auth::id()]);
        return ['ok' => true];
    }

    public static function delete(Request $r): array
    {
        $n = Scope::find('notifications', $r->param('id'), 'Notification');
        if ($n['user_id'] === Auth::id()) Database::run('DELETE FROM notifications WHERE id = ?', [$n['id']]);
        return ['deleted' => true];
    }
}
