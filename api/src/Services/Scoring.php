<?php
declare(strict_types=1);

namespace LeadForge\Services;

/**
 * Transparent rule-based opportunity scoring (0–100).
 * The score indicates how much a business could benefit from web services, based only on verifiable
 * signals. It is NOT a probability of closing a deal. Points are configurable per workspace.
 */
final class Scoring
{
    /** @var array<string,array{label:string,points:int,description:string}> */
    public const RULES = [
        'no_website'      => ['label' => 'No website found',               'points' => 40, 'description' => 'No website listed in OpenStreetMap or social profiles (not proof that none exists).'],
        'website_inactive'=> ['label' => 'Website unreachable',            'points' => 20, 'description' => 'A listed website failed to load (DNS failure, refused connection, 404/5xx).'],
        'needs_review'    => ['label' => 'Website status uncertain',       'points' => 10, 'description' => 'Website check was ambiguous or the business relies on social media only.'],
        'no_https'        => ['label' => 'Website not using HTTPS',        'points' => 10, 'description' => 'The verified website does not use a secure connection.'],
        'no_phone'        => ['label' => 'No phone number listed',          'points' => 5,  'description' => 'No phone number in public data.'],
        'no_email'        => ['label' => 'No email address listed',         'points' => 5,  'description' => 'No email address in public data.'],
        'no_social'       => ['label' => 'No social media listed',          'points' => 5,  'description' => 'No social profiles in public data.'],
        'no_hours'        => ['label' => 'No opening hours listed',         'points' => 5,  'description' => 'Opening hours are missing from public listings.'],
        'audit_viewport'  => ['label' => 'Not mobile friendly',             'points' => 10, 'description' => 'Latest audit found no mobile viewport tag.'],
        'audit_meta'      => ['label' => 'Missing meta description',        'points' => 5,  'description' => 'Latest audit found no meta description.'],
        'audit_title'     => ['label' => 'Missing page title',              'points' => 5,  'description' => 'Latest audit found no <title>.'],
        'audit_slow'      => ['label' => 'Slow response',                   'points' => 5,  'description' => 'Latest audit measured a response time above 3 seconds.'],
    ];

    public const BANDS = [
        ['min' => 75, 'key' => 'very_high', 'label' => 'Very High Opportunity'],
        ['min' => 50, 'key' => 'high',      'label' => 'High Opportunity'],
        ['min' => 25, 'key' => 'medium',    'label' => 'Medium Opportunity'],
        ['min' => 0,  'key' => 'low',       'label' => 'Low Opportunity'],
    ];

    /** @param array<string,int> $overrides  @return array<string,array{label:string,points:int,description:string}> */
    public static function rules(array $overrides = []): array
    {
        $rules = self::RULES;
        foreach ($overrides as $k => $pts) if (isset($rules[$k])) $rules[$k]['points'] = max(0, min(100, (int) $pts));
        return $rules;
    }

    /**
     * @param array<string,mixed> $b business row (socials may be array or JSON string)
     * @param array<string,mixed>|null $audit latest website_audits row
     * @return array{score:int,band:string,items:list<array{rule:string,label:string,points:int}>}
     */
    public static function score(array $b, ?array $audit, array $overrides = []): array
    {
        $rules = self::rules($overrides);
        $socials = is_string($b['socials'] ?? null) ? (json_decode($b['socials'], true) ?: []) : ($b['socials'] ?? []);
        $hits = [];
        $status = $b['website_status'] ?? 'unknown';
        if ($status === 'no_website') $hits[] = 'no_website';
        if ($status === 'inactive') $hits[] = 'website_inactive';
        if ($status === 'needs_review') $hits[] = 'needs_review';
        if ($status === 'available' && !empty($b['website']) && $audit === null) {
            $final = (string) ($b['website'] ?? '');
            if (str_starts_with(strtolower($final), 'http://')) $hits[] = 'no_https';
        }
        if (empty($b['phone'])) $hits[] = 'no_phone';
        if (empty($b['email'])) $hits[] = 'no_email';
        if (!$socials) $hits[] = 'no_social';
        if (empty($b['opening_hours'])) $hits[] = 'no_hours';
        if ($audit && (int) $audit['is_reachable'] === 1) {
            if (!(int) $audit['uses_https']) $hits[] = 'no_https';
            if (!(int) $audit['has_viewport']) $hits[] = 'audit_viewport';
            if (empty($audit['meta_description'])) $hits[] = 'audit_meta';
            if (empty($audit['page_title'])) $hits[] = 'audit_title';
            if ((int) $audit['response_time_ms'] > 3000) $hits[] = 'audit_slow';
        }
        $items = [];
        $total = 0;
        foreach (array_unique($hits) as $rule) {
            $pts = $rules[$rule]['points'];
            if ($pts <= 0) continue;
            $items[] = ['rule' => $rule, 'label' => $rules[$rule]['label'], 'points' => $pts];
            $total += $pts;
        }
        $score = min(100, $total);
        return ['score' => $score, 'band' => self::band($score), 'items' => $items];
    }

    public static function band(int $score): string
    {
        foreach (self::BANDS as $b) if ($score >= $b['min']) return $b['key'];
        return 'low';
    }
}
