<?php
declare(strict_types=1);

namespace LeadForge\Controllers;

use LeadForge\Core\Auth;
use LeadForge\Core\Database;
use LeadForge\Core\Fmt;
use LeadForge\Core\HttpException;
use LeadForge\Core\Request;
use LeadForge\Core\Uuid;
use LeadForge\Core\Validator;
use LeadForge\Services\Businesses;
use LeadForge\Services\Scoring;
use LeadForge\Services\Usage;

final class WorkspaceController
{
    public static function show(Request $r): array
    {
        $ws = Database::one('SELECT id, name, slug, settings, owner_id, created_at FROM workspaces WHERE id = ?', [Auth::workspaceId()]);
        $sub = Database::one('SELECT plan, status, current_period_start FROM subscriptions WHERE workspace_id = ?', [Auth::workspaceId()]);
        $counts = Database::one('SELECT
            (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = :w) AS members,
            (SELECT COUNT(*) FROM leads WHERE workspace_id = :w2) AS leads,
            (SELECT COUNT(*) FROM businesses WHERE workspace_id = :w3) AS businesses', ['w' => Auth::workspaceId(), 'w2' => Auth::workspaceId(), 'w3' => Auth::workspaceId()]);
        return [
            'workspace' => Fmt::row($ws, ['created_at'], [], [], [], ['settings']) + ['role' => Auth::role()],
            'subscription' => $sub ? Fmt::row($sub, ['current_period_start']) : null,
            'counts' => array_map('intval', $counts),
            'usage' => Usage::summary(),
        ];
    }

    public static function update(Request $r): array
    {
        Auth::requireRole('owner', 'admin');
        $d = Validator::validate($r->all(), ['name' => 'string|min:2|max:120']);
        if (isset($d['name'])) Database::update('workspaces', ['name' => $d['name']], ['id' => Auth::workspaceId()]);
        return self::show($r);
    }

    public static function switch(Request $r): array
    {
        $d = Validator::validate($r->all(), ['workspace_id' => 'required|uuid']);
        $ok = Database::scalar('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [$d['workspace_id'], Auth::id()]);
        if (!$ok) throw HttpException::forbidden();
        $_SESSION['workspace_id'] = $d['workspace_id'];
        return ['switched' => true];
    }

    public static function scoring(Request $r): array
    {
        $overrides = Businesses::scoringOverrides(Auth::workspaceId());
        $rules = [];
        foreach (Scoring::rules($overrides) as $k => $rule) $rules[] = ['key' => $k, 'default' => Scoring::RULES[$k]['points']] + $rule;
        return ['rules' => $rules, 'bands' => Scoring::BANDS];
    }

    public static function updateScoring(Request $r): array
    {
        Auth::requireRole('owner', 'admin');
        $points = $r->input('points');
        if (!is_array($points)) throw HttpException::validation(['points' => 'Provide points per rule.']);
        $clean = [];
        foreach ($points as $k => $v) {
            if (!isset(Scoring::RULES[$k]) || !is_numeric($v) || $v < 0 || $v > 100) throw HttpException::validation(['points' => "Invalid value for $k (0–100)."]);
            $clean[$k] = (int) $v;
        }
        $settings = json_decode((string) Database::scalar('SELECT settings FROM workspaces WHERE id = ?', [Auth::workspaceId()]) ?: '{}', true) ?: [];
        $settings['scoring'] = $clean;
        Database::update('workspaces', ['settings' => json_encode($settings)], ['id' => Auth::workspaceId()]);
        Businesses::rescoreWorkspace(Auth::workspaceId());
        return self::scoring($r);
    }

    public static function members(Request $r): array
    {
        return Database::all('SELECT m.id, m.role, m.created_at, u.id AS user_id, u.name, u.email FROM workspace_members m
            JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.created_at', [Auth::workspaceId()]);
    }

    public static function addMember(Request $r): array
    {
        Auth::requireRole('owner', 'admin');
        $d = Validator::validate($r->all(), ['email' => 'required|email', 'role' => 'required|in:admin,member']);
        $u = Database::one('SELECT id FROM users WHERE email = ?', [mb_strtolower($d['email'])]);
        if (!$u) throw HttpException::validation(['email' => 'No LeadForge account uses this email. Ask them to register first.']);
        if (Database::scalar('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [Auth::workspaceId(), $u['id']])) {
            throw HttpException::validation(['email' => 'This user is already a member.']);
        }
        Database::insert('workspace_members', ['id' => Uuid::v4(), 'workspace_id' => Auth::workspaceId(), 'user_id' => $u['id'], 'role' => $d['role']]);
        return self::members($r);
    }

    public static function removeMember(Request $r): array
    {
        Auth::requireRole('owner', 'admin');
        $m = Database::one('SELECT id, role, user_id FROM workspace_members WHERE id = ? AND workspace_id = ?', [$r->param('id'), Auth::workspaceId()]);
        if (!$m) throw HttpException::notFound('Member');
        if ($m['role'] === 'owner') throw HttpException::forbidden('The workspace owner cannot be removed.');
        Database::run('DELETE FROM workspace_members WHERE id = ?', [$m['id']]);
        return self::members($r);
    }
}
