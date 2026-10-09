import { HttpError, json, cfg, one, all, localDate, TZ_SQL } from '../lib/http.js';
import { requireAuth, requireRole, isStaff } from '../lib/auth.js';
import { usersWithRole } from '../lib/notify.js';
import { ACTIVE, mapRequest, taskFilter, REQUEST_SELECT } from '../lib/workflow.js';

const ACTIVE_SQL = ACTIVE.map((s) => `'${s}'`).join(',');

export default function register(r) {
  r.get('/api/meta/categories', async (c) => {
    const { publicLibrary, docPrefix } = cfg(c.env);
    if (!publicLibrary) requireAuth(c);
    const rows = await all(c.env,
      `SELECT c.*, (SELECT COUNT(*) FROM documents d WHERE d.category = c.code AND d.status = 'ACTIVE') AS count
       FROM categories c ORDER BY c.sort`);
    return json({
      prefix: docPrefix,
      categories: rows.map((x) => ({ code: x.code, name: x.name, description: x.description, count: x.count, pattern: `${docPrefix}-${x.code}-XXX` })),
    });
  });

  r.get('/api/meta/next-number', async (c) => {
    requireAuth(c);
    const { docPrefix, seqDigits, revDigits } = cfg(c.env);
    const category = c.query.get('category') || '';
    if (!(await one(c.env, 'SELECT code FROM categories WHERE code = ?', category))) throw new HttpError(400, 'ไม่พบหมวดเอกสาร');
    const row = await one(c.env,
      `SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM (
         SELECT seq FROM documents WHERE category = ?1
         UNION ALL SELECT seq FROM requests WHERE type = 'NEW' AND category = ?1 AND status IN (${ACTIVE_SQL}))`, category);
    return json({ docNo: `${docPrefix}-${category}-${String(row.n).padStart(seqDigits, '0')}`, rev: '0'.repeat(revDigits) });
  });

  r.get('/api/meta/approvers', async (c) => {
    requireRole(c, 'admin');
    return json({ approvers: (await usersWithRole(c.env, 'approver')).map((u) => ({ id: u.id, name: u.name })) });
  });

  r.get('/api/meta/stats', async (c) => {
    requireAuth(c);
    const u = c.user;
    const t = taskFilter(u);
    const ym = localDate().slice(0, 7);
    const [activeDocs, tasks, myActive, publishedThisMonth, byCategory, published, cancelled, myRecent, taskList] = await Promise.all([
      one(c.env, "SELECT COUNT(*) AS n FROM documents WHERE status = 'ACTIVE'"),
      one(c.env, `SELECT COUNT(*) AS n FROM requests q WHERE ${t.sql}`, ...t.params),
      one(c.env, `SELECT COUNT(*) AS n FROM requests WHERE requester_id = ? AND status IN (${ACTIVE_SQL})`, u.id),
      one(c.env, "SELECT COUNT(*) AS n FROM requests WHERE status = 'PUBLISHED' AND substr(datetime(updated_at, ?), 1, 7) = ?", TZ_SQL, ym),
      all(c.env, `SELECT c.code, c.name, (SELECT COUNT(*) FROM documents d WHERE d.category = c.code AND d.status = 'ACTIVE') AS count
                  FROM categories c ORDER BY c.sort`),
      all(c.env, `SELECT v.rev, v.title, v.dcn_no, v.effective_date, v.published_at, d.id AS document_id, d.doc_no, q.type AS req_type
                  FROM revisions v JOIN documents d ON d.id = v.document_id JOIN requests q ON q.id = v.request_id
                  ORDER BY v.published_at DESC, v.id DESC LIMIT 6`),
      all(c.env, `SELECT q.doc_no, q.title, q.dcn_no, q.effective_date, q.updated_at, q.document_id, q.to_rev
                  FROM requests q WHERE q.type = 'CANCEL' AND q.status = 'PUBLISHED' ORDER BY q.updated_at DESC LIMIT 6`),
      all(c.env, `${REQUEST_SELECT} WHERE q.requester_id = ? ORDER BY q.updated_at DESC, q.id DESC LIMIT 5`, u.id),
      all(c.env, `${REQUEST_SELECT} WHERE ${t.sql} ORDER BY q.updated_at ASC LIMIT 5`, ...t.params),
    ]);
    const feed = [
      ...published.map((v) => ({
        kind: v.req_type === 'REVISE' ? 'REVISE' : 'NEW',
        documentId: v.document_id, docNo: v.doc_no, title: v.title, rev: v.rev, dcnNo: v.dcn_no, at: v.published_at, effectiveDate: v.effective_date,
      })),
      ...cancelled.map((q) => ({
        kind: 'CANCEL', documentId: q.document_id, docNo: q.doc_no, title: q.title, rev: q.to_rev, dcnNo: q.dcn_no, at: q.updated_at, effectiveDate: q.effective_date,
      })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 6);

    return json({
      activeDocs: activeDocs.n,
      tasks: tasks.n,
      myActive: myActive.n,
      publishedThisMonth: publishedThisMonth.n,
      byCategory,
      feed,
      myRecent: myRecent.map((q) => mapRequest(q, u)),
      taskList: taskList.map((q) => mapRequest(q, u)),
      isStaff: isStaff(u),
    });
  });
}
