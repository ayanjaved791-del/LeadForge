<?php
declare(strict_types=1);

namespace LeadForge\Core;

/** Workspace-scoped lookups — every tenant read goes through the current workspace id. */
final class Scope
{
    private const TABLES = ['businesses', 'leads', 'contacts', 'lead_notes', 'lead_activities', 'tasks', 'follow_ups',
        'calendar_events', 'email_templates', 'website_audits', 'saved_searches', 'notifications', 'tags'];

    /** @return array<string,mixed> */
    public static function find(string $table, string $id, string $label = 'Record'): array
    {
        if (!in_array($table, self::TABLES, true)) throw new \LogicException('Unscoped table');
        if (!Uuid::isValid($id)) throw HttpException::notFound($label);
        $row = Database::one("SELECT * FROM `$table` WHERE id = ? AND workspace_id = ?", [$id, Auth::workspaceId()]);
        if (!$row) throw HttpException::notFound($label);
        return $row;
    }

    /** Validates an optional foreign id belongs to this workspace. */
    public static function optional(string $table, mixed $id, string $label): ?string
    {
        if ($id === null || $id === '') return null;
        self::find($table, (string) $id, $label);
        return (string) $id;
    }
}
