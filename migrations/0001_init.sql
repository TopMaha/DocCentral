-- Wesco DCC — โครงสร้างฐานข้อมูล (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  emp_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  roles TEXT NOT NULL DEFAULT '',                 -- admin,approver,dcc
  active INTEGER NOT NULL DEFAULT 1,
  must_change_pw INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,                         -- SHA-256 ของ token ใน cookie
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  lock_until TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  doc_no TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL REFERENCES categories(code),
  seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  current_rev INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',          -- ACTIVE | OBSOLETE
  owner_dept TEXT NOT NULL DEFAULT '',
  effective_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_cat ON documents(category, seq);

CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  rev INTEGER NOT NULL,
  title TEXT NOT NULL,
  file_key TEXT NOT NULL,                         -- key ใน R2 เช่น 01_Controlled/TH-QA/TH-QA-001_Rev00_xxx.pdf
  original_name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'CURRENT',         -- CURRENT | SUPERSEDED | CANCELLED
  dcn_no TEXT,
  request_id INTEGER,
  effective_date TEXT,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_by INTEGER REFERENCES users(id),
  obsoleted_at TEXT,
  UNIQUE (document_id, rev)
);
CREATE INDEX IF NOT EXISTS idx_revisions_req ON revisions(request_id);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  req_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,                             -- NEW | REVISE | CANCEL
  status TEXT NOT NULL,                           -- PENDING_REVIEW | PENDING_APPROVAL | APPROVED | PUBLISHED | REJECTED | WITHDRAWN
  requester_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  document_id INTEGER REFERENCES documents(id),
  doc_no TEXT NOT NULL,
  seq INTEGER,
  title TEXT NOT NULL,
  from_rev INTEGER,
  to_rev INTEGER,
  reason TEXT NOT NULL,
  upload_key TEXT,
  upload_name TEXT,
  upload_size INTEGER,
  upload_mime TEXT,
  approver_id INTEGER REFERENCES users(id),
  dcn_no TEXT UNIQUE,
  effective_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester_id);
-- กันจองเลขเอกสารใหม่ซ้ำ และกันคำขอซ้อนบนเอกสารเดียวกัน
CREATE UNIQUE INDEX IF NOT EXISTS ux_requests_new_docno ON requests(doc_no)
  WHERE type = 'NEW' AND status IN ('PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED');
CREATE UNIQUE INDEX IF NOT EXISTS ux_requests_doc_active ON requests(document_id)
  WHERE document_id IS NOT NULL AND status IN ('PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED');

CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_request ON request_logs(request_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  request_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT OR IGNORE INTO categories (code, name, description, sort) VALUES
  ('BP',  'Procedure',        'เอกสารที่เป็น procedure',      1),
  ('ADM', 'แบบฟอร์มทั่วไป',    'แบบฟอร์มที่เป็นเอกสารทั่วไป',  2),
  ('QA',  'แบบฟอร์ม QA',      'แบบฟอร์มของ QA',              3),
  ('ENG', 'แบบฟอร์ม ENG',     'แบบฟอร์มของ ENG',             4),
  ('PRD', 'แบบฟอร์ม PRD',     'แบบฟอร์มของ PRD',             5);
