import { HttpError, json, readJson, one, all } from '../lib/http.js';
import { requireAuth, isStaff } from '../lib/auth.js';
import { sendObject } from '../lib/files.js';
import {
  createRequest, forward, approve, reject, withdraw, runDcn, publish,
  mapRequest, logsFor, canView, taskFilter, REQUEST_SELECT,
} from '../lib/workflow.js';

async function detail(c, id) {
  const q = await one(c.env, `${REQUEST_SELECT} WHERE q.id = ?`, Number(id));
  if (!q || !canView(c.user, q)) throw new HttpError(404, 'ไม่พบคำขอ');
  return json({ request: mapRequest(q, c.user), logs: await logsFor(c.env, q.id) });
}

const action = (fn) => async (c) => {
  requireAuth(c);
  const body = await readJson(c.req);
  await fn(c, body);
  return detail(c, c.params.id);
};

export default function register(r) {
  r.get('/api/requests', async (c) => {
    requireAuth(c);
    const scope = c.query.get('scope') || 'mine';
    const status = c.query.get('status') || '';
    const type = c.query.get('type') || '';
    const term = (c.query.get('q') || '').trim();
    const where = [];
    const params = [];
    if (scope === 'tasks') {
      const t = taskFilter(c.user);
      where.push(t.sql);
      params.push(...t.params);
    } else if (scope === 'all') {
      if (!isStaff(c.user)) throw new HttpError(403, 'ดูคำขอทั้งหมดได้เฉพาะ Admin / ผู้อนุมัติ / DCC');
    } else {
      where.push('q.requester_id = ?');
      params.push(c.user.id);
    }
    if (status === 'ACTIVE') where.push("q.status IN ('PENDING_REVIEW','PENDING_APPROVAL','APPROVED')");
    else if (status === 'CLOSED') where.push("q.status IN ('PUBLISHED','REJECTED','WITHDRAWN')");
    else if (status) { where.push('q.status = ?'); params.push(status); }
    if (type) { where.push('q.type = ?'); params.push(type); }
    if (term) {
      where.push('(q.req_no LIKE ? OR q.doc_no LIKE ? OR q.title LIKE ? OR q.dcn_no LIKE ?)');
      params.push(...Array(4).fill(`%${term}%`));
    }
    const rows = await all(c.env,
      `${REQUEST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY q.updated_at DESC, q.id DESC LIMIT 300`, ...params);
    return json({ requests: rows.map((x) => mapRequest(x, c.user)) });
  });

  r.get('/api/requests/:id', (c) => {
    requireAuth(c);
    return detail(c, c.params.id);
  });

  r.get('/api/requests/:id/file', async (c) => {
    requireAuth(c);
    const q = await one(c.env, 'SELECT * FROM requests WHERE id = ?', Number(c.params.id));
    if (!q || !canView(c.user, q)) throw new HttpError(404, 'ไม่พบคำขอ');
    if (!q.upload_key) throw new HttpError(404, 'คำขอนี้ไม่มีไฟล์แนบ');
    let key = q.upload_key;
    if (q.status === 'PUBLISHED') {
      // ไฟล์ถูกย้ายไปโฟลเดอร์ Controlled/Obsolete แล้ว
      const v = await one(c.env, 'SELECT file_key FROM revisions WHERE request_id = ?', q.id);
      if (!v) throw new HttpError(404, 'ไม่พบไฟล์');
      key = v.file_key;
    }
    return sendObject(c.env, key, q.upload_name, c.query.get('inline') === '1');
  });

  r.post('/api/requests', async (c) => {
    requireAuth(c);
    const form = await c.req.formData();
    const created = await createRequest(c, form);
    return json({ request: { id: created.id, reqNo: created.req_no, docNo: created.doc_no } }, 201);
  });

  r.post('/api/requests/:id/forward', action((c, b) => forward(c, c.params.id, b.approverId, String(b.comment || '').trim())));
  r.post('/api/requests/:id/approve', action((c, b) => approve(c, c.params.id, String(b.comment || '').trim())));
  r.post('/api/requests/:id/reject', action((c, b) => reject(c, c.params.id, b.comment)));
  r.post('/api/requests/:id/withdraw', action((c, b) => withdraw(c, c.params.id, String(b.comment || '').trim())));
  r.post('/api/requests/:id/dcn', action((c) => runDcn(c, c.params.id)));
  r.post('/api/requests/:id/publish', action((c, b) => publish(c, c.params.id, b.effectiveDate)));
}
