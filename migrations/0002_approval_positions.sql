-- ผู้อนุมัติตามตำแหน่ง: QA Manager / ENG Manager / Production Manager / Material Manager / General Manager
-- ผู้ขอเลือกว่าตำแหน่งไหนต้องอนุมัติ (ได้หลายตำแหน่ง) — คำขอจะ "อนุมัติแล้ว" เมื่อทุกคนที่เลือกอนุมัติครบ

-- ตำแหน่งที่ผู้ใช้ดำรงอยู่ (Admin กำหนดในหน้าจัดการผู้ใช้) เช่น 'QA_MGR,GM'
ALTER TABLE users ADD COLUMN positions TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS request_approvals (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  position TEXT NOT NULL,                         -- QA_MGR | ENG_MGR | PRD_MGR | MAT_MGR | GM ('' = คำขอเดิมก่อนมีตำแหน่ง)
  approver_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING',         -- PENDING | APPROVED | REJECTED
  comment TEXT NOT NULL DEFAULT '',
  decided_at TEXT,
  UNIQUE (request_id, position)
);
CREATE INDEX IF NOT EXISTS idx_approvals_user ON request_approvals(approver_id, status);

-- ย้ายคำขอเดิม (ผู้อนุมัติคนเดียวใน requests.approver_id) มาเป็นแถวในตารางใหม่ — requests.approver_id ไม่ถูกใช้อีกต่อไป
INSERT OR IGNORE INTO request_approvals (request_id, position, approver_id, status, comment, decided_at)
SELECT q.id, '', q.approver_id,
       CASE WHEN q.status IN ('APPROVED', 'PUBLISHED') THEN 'APPROVED'
            WHEN q.status = 'REJECTED' THEN 'REJECTED'
            ELSE 'PENDING' END,
       COALESCE((SELECT l.comment FROM request_logs l WHERE l.request_id = q.id AND l.action IN ('APPROVE', 'REJECT') ORDER BY l.id DESC LIMIT 1), ''),
       (SELECT l.created_at FROM request_logs l WHERE l.request_id = q.id AND l.action IN ('APPROVE', 'REJECT') ORDER BY l.id DESC LIMIT 1)
FROM requests q
WHERE q.approver_id IS NOT NULL;
