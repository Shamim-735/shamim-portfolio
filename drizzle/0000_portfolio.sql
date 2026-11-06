CREATE TABLE portfolio (
 id TEXT PRIMARY KEY NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 data TEXT NOT NULL DEFAULT '[]',
 owner_id TEXT NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE enquiry_limits (
 bucket_id TEXT PRIMARY KEY NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 1,
 expires_at INTEGER NOT NULL
);
