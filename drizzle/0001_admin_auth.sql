CREATE TABLE admin_credentials (
 id TEXT PRIMARY KEY NOT NULL,
 username TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 salt TEXT NOT NULL,
 iterations INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE admin_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 expires_at INTEGER NOT NULL,
 scope TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE admin_limits (
 bucket_key TEXT PRIMARY KEY NOT NULL,
 attempts INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE admin_cooldowns (
 id TEXT PRIMARY KEY NOT NULL,
 sent_at INTEGER NOT NULL
);
