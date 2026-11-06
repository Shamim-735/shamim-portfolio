CREATE TABLE portfolio (
 id TEXT PRIMARY KEY NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 data TEXT NOT NULL DEFAULT '[]',
 owner_id TEXT NOT NULL
);

CREATE TABLE enquiries (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL,
 email TEXT NOT NULL,
 brand TEXT NOT NULL,
 project_type TEXT NOT NULL,
 message TEXT NOT NULL,
 created_at TEXT NOT NULL,
 email_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE enquiry_limits (
 bucket_id TEXT PRIMARY KEY NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 1,
 expires_at BIGINT NOT NULL
);

CREATE TABLE admin_credentials (
 id TEXT PRIMARY KEY NOT NULL,
 username TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 salt TEXT NOT NULL,
 iterations INTEGER NOT NULL,
 created_at BIGINT NOT NULL
);

CREATE TABLE admin_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 expires_at BIGINT NOT NULL,
 scope TEXT NOT NULL
);

CREATE TABLE admin_limits (
 bucket_key TEXT PRIMARY KEY NOT NULL,
 attempts INTEGER NOT NULL,
 expires_at BIGINT NOT NULL
);

CREATE TABLE admin_cooldowns (
 id TEXT PRIMARY KEY NOT NULL,
 sent_at BIGINT NOT NULL
);
