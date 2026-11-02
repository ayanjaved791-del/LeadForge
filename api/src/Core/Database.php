<?php
declare(strict_types=1);

namespace LeadForge\Core;

use PDO;

/** Thin PDO wrapper — every query goes through prepared statements. */
final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                Config::get('db.host'), (int) Config::get('db.port', 3306), Config::get('db.database'));
            self::$pdo = new PDO($dsn, (string) Config::get('db.username'), (string) Config::get('db.password'), [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_STRINGIFY_FETCHES  => false,
            ]);
            self::$pdo->exec("SET time_zone = '+00:00'");
        }
        return self::$pdo;
    }

    /** @param array<string|int,mixed> $params */
    public static function run(string $sql, array $params = []): \PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        foreach ($params as $k => $v) {
            $key = is_int($k) ? $k + 1 : (str_starts_with($k, ':') ? $k : ":$k");
            $type = match (true) {
                is_int($v)  => PDO::PARAM_INT,
                is_bool($v) => PDO::PARAM_BOOL,
                $v === null => PDO::PARAM_NULL,
                default     => PDO::PARAM_STR,
            };
            $stmt->bindValue($key, $v, $type);
        }
        $stmt->execute();
        return $stmt;
    }

    /** @return array<string,mixed>|null */
    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array<string,mixed>> */
    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function scalar(string $sql, array $params = []): mixed
    {
        $v = self::run($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    /** Insert a row; column names come from code, never from user input. @param array<string,mixed> $row */
    public static function insert(string $table, array $row): void
    {
        $cols = array_keys($row);
        $sql = sprintf('INSERT INTO `%s` (`%s`) VALUES (%s)', $table, implode('`,`', $cols),
            implode(',', array_map(fn ($c) => ":$c", $cols)));
        self::run($sql, $row);
    }

    /**
     * Update rows. Callers must pass a whitelisted $row. @param array<string,mixed> $row @param array<string,mixed> $where
     */
    public static function update(string $table, array $row, array $where): int
    {
        if (!$row) return 0;
        $set = implode(',', array_map(fn ($c) => "`$c` = :s_$c", array_keys($row)));
        $cond = implode(' AND ', array_map(fn ($c) => "`$c` = :w_$c", array_keys($where)));
        $params = [];
        foreach ($row as $k => $v) $params["s_$k"] = $v;
        foreach ($where as $k => $v) $params["w_$k"] = $v;
        return self::run("UPDATE `$table` SET $set WHERE $cond", $params)->rowCount();
    }

    public static function transaction(callable $fn): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $fn();
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}
