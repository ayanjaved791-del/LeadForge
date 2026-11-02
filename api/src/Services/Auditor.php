<?php
declare(strict_types=1);

namespace LeadForge\Services;

/**
 * Basic website audit. The HTML is parsed with libxml as inert text — scripts are never executed
 * and external resources are never loaded (except a capped request for /favicon.ico).
 */
final class Auditor
{
    /** @return array<string,mixed> */
    public static function run(string $inputUrl): array
    {
        $url = SafeHttp::normalizeUrl($inputUrl);
        if (!$url) throw new \InvalidArgumentException('Enter a valid website URL.');

        $res = SafeHttp::get($url, 1_500_000, 15);
        if (!$res['ok'] && $res['error_code'] === 'connect' && str_starts_with($url, 'http://')) {
            $res2 = SafeHttp::get('https://' . substr($url, 7), 1_500_000, 15);
            if ($res2['ok']) $res = $res2;
        }

        $audit = [
            'url' => $url, 'final_url' => $res['final_url'], 'status_code' => $res['status'],
            'is_reachable' => $res['ok'] && $res['status'] >= 200 && $res['status'] < 400,
            'uses_https' => str_starts_with(strtolower($res['final_url']), 'https://'),
            'response_time_ms' => $res['time_ms'], 'page_title' => null, 'meta_description' => null,
            'has_viewport' => false, 'has_favicon' => false, 'has_canonical' => false, 'h1_count' => 0,
            'html_lang' => null, 'page_bytes' => strlen($res['body']), 'error' => $res['error'],
            'extra' => [],
        ];
        if (!$audit['is_reachable'] && !$audit['error']) $audit['error'] = 'Website returned HTTP ' . $res['status'];

        if ($audit['is_reachable'] && $res['body'] !== '') {
            $prev = libxml_use_internal_errors(true);
            $doc = new \DOMDocument();
            $html = $res['body'];
            if (!preg_match('/<meta[^>]+charset/i', substr($html, 0, 4096))) $html = '<?xml encoding="UTF-8">' . $html;
            $doc->loadHTML($html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_COMPACT);
            libxml_clear_errors();
            libxml_use_internal_errors($prev);
            $xp = new \DOMXPath($doc);

            $title = trim((string) ($xp->query('//title')->item(0)?->textContent ?? ''));
            $audit['page_title'] = $title !== '' ? mb_substr(preg_replace('/\s+/', ' ', $title), 0, 490) : null;
            $desc = '';
            foreach ($xp->query('//meta[@name or @property]') as $m) {
                /** @var \DOMElement $m */
                $n = strtolower($m->getAttribute('name') ?: $m->getAttribute('property'));
                if ($n === 'description') $desc = trim($m->getAttribute('content'));
                if ($n === 'viewport' && str_contains(strtolower($m->getAttribute('content')), 'width')) $audit['has_viewport'] = true;
                if ($n === 'og:title') $audit['extra']['og_title'] = true;
                if ($n === 'robots' && str_contains(strtolower($m->getAttribute('content')), 'noindex')) $audit['extra']['noindex'] = true;
            }
            $audit['meta_description'] = $desc !== '' ? mb_substr($desc, 0, 990) : null;
            foreach ($xp->query('//link[@rel]') as $l) {
                /** @var \DOMElement $l */
                $rel = strtolower($l->getAttribute('rel'));
                if (str_contains($rel, 'icon')) $audit['has_favicon'] = true;
                if ($rel === 'canonical') $audit['has_canonical'] = true;
            }
            $audit['h1_count'] = $xp->query('//h1')->length;
            $lang = $doc->documentElement?->getAttribute('lang');
            $audit['html_lang'] = $lang ? mb_substr($lang, 0, 20) : null;
            $imgs = $xp->query('//img');
            $noAlt = 0;
            foreach ($imgs as $img) if (!$img instanceof \DOMElement || trim($img->getAttribute('alt')) === '') $noAlt++;
            $audit['extra']['images'] = $imgs->length;
            $audit['extra']['images_without_alt'] = $noAlt;

            if (!$audit['has_favicon']) {
                $p = parse_url($res['final_url']);
                $fav = SafeHttp::get($p['scheme'] . '://' . $p['host'] . '/favicon.ico', 4096, 6, 2);
                $ct = $fav['headers']['content-type'] ?? '';
                $audit['has_favicon'] = $fav['ok'] && $fav['status'] === 200 && !str_contains($ct, 'text/html');
            }
        }

        $checks = [
            ['key' => 'reachable', 'label' => 'Website is reachable', 'passed' => $audit['is_reachable'], 'weight' => 25,
                'detail' => $audit['is_reachable'] ? 'HTTP ' . $audit['status_code'] : ($audit['error'] ?? 'Unreachable')],
            ['key' => 'https', 'label' => 'Uses HTTPS', 'passed' => $audit['is_reachable'] && $audit['uses_https'], 'weight' => 15,
                'detail' => $audit['uses_https'] ? 'Secure connection' : 'Served over plain HTTP'],
            ['key' => 'title', 'label' => 'Page title', 'passed' => (bool) $audit['page_title'], 'weight' => 10,
                'detail' => $audit['page_title'] ? mb_strlen($audit['page_title']) . ' characters' : 'Missing <title>'],
            ['key' => 'meta', 'label' => 'Meta description', 'passed' => (bool) $audit['meta_description'], 'weight' => 10,
                'detail' => $audit['meta_description'] ? mb_strlen($audit['meta_description']) . ' characters' : 'Missing meta description'],
            ['key' => 'viewport', 'label' => 'Mobile viewport', 'passed' => $audit['has_viewport'], 'weight' => 15,
                'detail' => $audit['has_viewport'] ? 'Responsive viewport tag present' : 'No viewport meta tag'],
            ['key' => 'favicon', 'label' => 'Favicon', 'passed' => $audit['has_favicon'], 'weight' => 5,
                'detail' => $audit['has_favicon'] ? 'Favicon found' : 'No favicon found'],
            ['key' => 'h1', 'label' => 'Single H1 heading', 'passed' => $audit['h1_count'] === 1, 'weight' => 5,
                'detail' => $audit['h1_count'] . ' H1 heading(s)'],
            ['key' => 'canonical', 'label' => 'Canonical URL', 'passed' => $audit['has_canonical'], 'weight' => 5,
                'detail' => $audit['has_canonical'] ? 'Canonical link present' : 'No canonical link'],
            ['key' => 'lang', 'label' => 'Language declared', 'passed' => (bool) $audit['html_lang'], 'weight' => 5,
                'detail' => $audit['html_lang'] ? 'lang="' . $audit['html_lang'] . '"' : 'No lang attribute'],
            ['key' => 'speed', 'label' => 'Response time under 2s', 'passed' => $audit['is_reachable'] && $audit['response_time_ms'] < 2000, 'weight' => 5,
                'detail' => $audit['response_time_ms'] . ' ms'],
        ];
        if (isset($audit['extra']['images'])) {
            $checks[] = ['key' => 'alt', 'label' => 'Images have alt text', 'passed' => $audit['extra']['images_without_alt'] === 0, 'weight' => 0,
                'detail' => $audit['extra']['images_without_alt'] . ' of ' . $audit['extra']['images'] . ' images missing alt'];
        }
        if (!empty($audit['extra']['noindex'])) {
            $checks[] = ['key' => 'noindex', 'label' => 'Indexable by search engines', 'passed' => false, 'weight' => 0, 'detail' => 'robots meta contains noindex'];
        }
        $audit['score'] = array_sum(array_map(fn ($c) => $c['passed'] ? $c['weight'] : 0, $checks));
        $audit['checks'] = $checks;
        unset($audit['extra']);
        return $audit;
    }
}
