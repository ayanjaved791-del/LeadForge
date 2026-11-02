-- Database-backed PHP sessions (used when SESSION_DRIVER=database, e.g. on Vercel).
CREATE TABLE IF NOT EXISTS sessions (
  id          VARCHAR(128)    NOT NULL,
  data        MEDIUMBLOB      NOT NULL,
  expires_at  INT UNSIGNED    NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
