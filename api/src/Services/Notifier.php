<?php
declare(strict_types=1);

namespace LeadForge\Services;

use LeadForge\Core\Database;
use LeadForge\Core\Uuid;

final class Notifier
{
    public static function create(string $workspaceId, string $userId, string $type, string $title, ?string $body = null, ?string $link = null): void
    {
        Database::insert('notifications', [
            'id' => Uuid::v4(), 'workspace_id' => $workspaceId, 'user_id' => $userId, 'type' => $type,
            'title' => mb_substr($title, 0, 250), 'body' => $body ? mb_substr($body, 0, 495) : null, 'link' => $link,
        ]);
    }

    /** Creates reminders for follow-ups and tasks that became due (lazy, no cron required). */
    public static function syncDue(string $workspaceId, string $userId): void
    {
        $due = Database::all(
            "SELECT f.id, f.lead_id, f.channel, f.due_at, l.name FROM follow_ups f JOIN leads l ON l.id = f.lead_id
             WHERE f.workspace_id = ? AND f.status = 'pending' AND f.notified_at IS NULL AND f.due_at <= UTC_TIMESTAMP()
               AND (f.user_id = ? OR f.user_id IS NULL) LIMIT 50", [$workspaceId, $userId]);
        foreach ($due as $f) {
            self::create($workspaceId, $userId, 'follow_up_due', "Follow-up due: {$f['name']}", ucfirst($f['channel']) . ' follow-up is due.', "/leads/{$f['lead_id']}");
            Database::run('UPDATE follow_ups SET notified_at = UTC_TIMESTAMP() WHERE id = ?', [$f['id']]);
        }
    }
}
