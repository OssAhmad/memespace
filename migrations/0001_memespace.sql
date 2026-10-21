PRAGMA foreign_keys = ON;
CREATE TABLE minds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('human','ai','collective')),
  bio TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX minds_created ON minds(created_at, id);
INSERT INTO minds VALUES ('mind-ossa','Oss Ahmad','oss ahmad','human','',0), ('mind-rayray','RayRay','rayray','human','',0);
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  mind_id TEXT NOT NULL UNIQUE REFERENCES minds(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','owner')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','banned')),
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  verifier_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  consumed_by TEXT
);
CREATE INDEX challenges_expiry ON challenges(expires_at);
CREATE TABLE mail_budget (id TEXT PRIMARY KEY, ip_hash TEXT NOT NULL, email_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX mail_time ON mail_budget(created_at);
CREATE INDEX mail_ip ON mail_budget(ip_hash,created_at);
CREATE INDEX mail_email ON mail_budget(email_hash,created_at);
CREATE TABLE write_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX write_limits_expiry ON write_limits(expires_at);
CREATE TABLE reactions (
  mind_id TEXT NOT NULL REFERENCES minds(id),
  node_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  liked INTEGER NOT NULL DEFAULT 0 CHECK(liked IN (0,1)),
  belief INTEGER NOT NULL DEFAULT 0 CHECK(belief IN (-1,0,1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(mind_id,node_id,revision)
);
CREATE INDEX reactions_target ON reactions(node_id,revision,mind_id);
CREATE INDEX reactions_belief ON reactions(node_id,revision,belief,mind_id);
CREATE TABLE reaction_counts (
  node_id TEXT NOT NULL, revision TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0, believes INTEGER NOT NULL DEFAULT 0, disbelieves INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(node_id,revision)
);
CREATE TRIGGER reaction_insert AFTER INSERT ON reactions BEGIN
  INSERT INTO reaction_counts VALUES(new.node_id,new.revision,new.liked,new.belief=1,new.belief=-1)
  ON CONFLICT(node_id,revision) DO UPDATE SET likes=likes+new.liked,believes=believes+(new.belief=1),disbelieves=disbelieves+(new.belief=-1);
END;
CREATE TRIGGER reaction_update AFTER UPDATE ON reactions BEGIN
  UPDATE reaction_counts SET likes=likes+new.liked-old.liked,believes=believes+(new.belief=1)-(old.belief=1),disbelieves=disbelieves+(new.belief=-1)-(old.belief=-1)
  WHERE node_id=new.node_id AND revision=new.revision;
END;
CREATE TRIGGER reaction_delete AFTER DELETE ON reactions BEGIN
  UPDATE reaction_counts SET likes=likes-old.liked,believes=believes-(old.belief=1),disbelieves=disbelieves-(old.belief=-1)
  WHERE node_id=old.node_id AND revision=old.revision;
END;
CREATE TABLE comments (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  node_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  mind_id TEXT NOT NULL REFERENCES minds(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','hidden')),
  created_at INTEGER NOT NULL
);
CREATE INDEX comments_page ON comments(node_id,revision,status,seq);
CREATE INDEX comments_author ON comments(mind_id,node_id,revision,seq);
CREATE INDEX comments_queue ON comments(status,seq);
