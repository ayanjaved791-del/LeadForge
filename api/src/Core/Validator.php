<?php
declare(strict_types=1);

namespace LeadForge\Core;

/**
 * Small declarative validator.
 * Rules: required, string, email, int, numeric, bool, uuid, date, max:N, min:N, in:a|b|c, url, array, nullable
 */
final class Validator
{
    /**
     * @param array<string,mixed> $data
     * @param array<string,string> $rules
     * @return array<string,mixed> only validated keys that were present
     */
    public static function validate(array $data, array $rules): array
    {
        $errors = [];
        $clean = [];
        foreach ($rules as $field => $ruleString) {
            $rulesList = explode('|', $ruleString);
            $present = array_key_exists($field, $data);
            $value = $data[$field] ?? null;
            if (is_string($value)) $value = trim($value);
            $nullable = in_array('nullable', $rulesList, true);

            if (!$present || $value === '' || $value === null) {
                if (in_array('required', $rulesList, true)) { $errors[$field] = 'This field is required.'; continue; }
                if ($present) $clean[$field] = $nullable || $value === null ? null : $value;
                continue;
            }

            foreach ($rulesList as $rule) {
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                $err = match ($name) {
                    'string'  => is_string($value) ? null : 'Must be text.',
                    'email'   => filter_var($value, FILTER_VALIDATE_EMAIL) ? null : 'Enter a valid email address.',
                    'int'     => filter_var($value, FILTER_VALIDATE_INT) !== false ? null : 'Must be a whole number.',
                    'numeric' => is_numeric($value) ? null : 'Must be a number.',
                    'bool'    => is_bool($value) || in_array($value, [0, 1, '0', '1'], true) ? null : 'Must be true or false.',
                    'uuid'    => Uuid::isValid($value) ? null : 'Invalid identifier.',
                    'date'    => is_string($value) && strtotime($value) !== false ? null : 'Enter a valid date.',
                    'url'     => self::isUrl($value) ? null : 'Enter a valid http(s) URL.',
                    'array'   => is_array($value) ? null : 'Must be a list.',
                    'max'     => self::len($value) > (float) $arg ? "Must be at most $arg" . (is_numeric($value) && !is_string($value) ? '.' : ' characters.') : null,
                    'min'     => self::len($value) < (float) $arg ? "Must be at least $arg" . (is_numeric($value) && !is_string($value) ? '.' : ' characters.') : null,
                    'in'      => in_array((string) $value, explode(',', (string) $arg), true) ? null : 'Invalid option selected.',
                    default   => null,
                };
                if ($err) { $errors[$field] = $err; break; }
            }
            if (!isset($errors[$field])) {
                if (in_array('int', $rulesList, true)) $value = (int) $value;
                elseif (in_array('numeric', $rulesList, true)) $value = (float) $value;
                elseif (in_array('bool', $rulesList, true)) $value = (bool) $value;
                elseif (in_array('date', $rulesList, true)) $value = gmdate('Y-m-d H:i:s', (int) strtotime($value));
                $clean[$field] = $value;
            }
        }
        if ($errors) throw HttpException::validation($errors);
        return $clean;
    }

    private static function len(mixed $v): float
    {
        if (is_string($v)) return (float) mb_strlen($v);
        if (is_array($v)) return (float) count($v);
        return (float) $v;
    }

    public static function isUrl(mixed $v): bool
    {
        if (!is_string($v) || !filter_var($v, FILTER_VALIDATE_URL)) return false;
        return in_array(strtolower((string) parse_url($v, PHP_URL_SCHEME)), ['http', 'https'], true);
    }
}
