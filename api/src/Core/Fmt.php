<?php
declare(strict_types=1);

namespace LeadForge\Core;

final class Fmt
{
    /** UTC DATETIME → ISO-8601 */
    public static function dt(?string $v): ?string
    {
        return $v ? str_replace(' ', 'T', $v) . 'Z' : null;
    }

    /** Converts listed datetime columns of a row to ISO-8601 and casts listed numeric columns. */
    public static function row(array $row, array $dates = [], array $ints = [], array $floats = [], array $bools = [], array $json = []): array
    {
        foreach ($dates as $c) if (array_key_exists($c, $row)) $row[$c] = self::dt($row[$c]);
        foreach ($ints as $c) if (isset($row[$c])) $row[$c] = (int) $row[$c];
        foreach ($floats as $c) if (isset($row[$c])) $row[$c] = (float) $row[$c];
        foreach ($bools as $c) if (array_key_exists($c, $row)) $row[$c] = (bool) $row[$c];
        foreach ($json as $c) if (array_key_exists($c, $row)) $row[$c] = $row[$c] ? json_decode($row[$c], true) : null;
        return $row;
    }

    public static function like(string $q): string
    {
        return '%' . addcslashes($q, '%_\\') . '%';
    }
}
