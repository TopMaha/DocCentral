import { HttpError, json, cfg, one, all } from '../lib/http.js';
import { can, requireAuth, requireRole } from '../lib/auth.js';
import { baseName, extOf, canInline, sendObject } from '../lib/files.js';
import { ACTIVE, importExisting } from '../lib/workflow.js';

const ACTIVE_SQL = ACTIVE.map((s) => `'${s}'`).join(',');

function libraryAccess(c) {
  if (!cfg(c.env).publicLibrary) requireAuth(c);
}

export function mapDocument(d) {
  const fileName = d.file_key ? baseName(d.file_key) : null;
  return {
    id: d.id,
    docNo: d.doc_no,
    category: d.category,
    categoryName: d.category_name,
    title: d.title,
    rev: d.current_rev,
    status: d.status,
    effectiveDate: d.effective_date,
    updatedAt: d.updated_at,
    file: fileName ? { name: fileName, size: d.size, ext: extOf(fileName).slice(1), inline: canInline(fileName) } : null,
    dcnNo: d.dcn_no || null,
    pendingRequest: d.pending_req ? { id: d.pending_req_id, reqNo: d.pending_req, type: d.pending_type } : null,
  };
}

const DOC_SELECT = `
  SELECT d.*, c.name AS category_name,
         v.id AS rev_id, v.file_key, v.size, v.dcn_no,
         q.id AS pending_req_id, q.req_no AS pending_req, q.type AS pending_type
  FROM documents d
  JOIN categories c ON c.code = d.category
  LEFT JOIN revisions v ON v.document_id = d.id AND v.rev = d.current_rev
  LEFT JOIN requests q ON q.document_id = d.id AND q.status IN (${ACTIVE_SQL})`;

export default function register(r) {
  r.get('/api/documents', async (c) => {
    libraryAccess(c);
    const q = c.query.get('q') || '';
    const category = c.query.get('category') || '';
    const status = c.query.get('status') || 'ACTIVE';
    const where = [];
    const params = [];
    if (status === 'OBSOLETE' || status === 'ALL') {
      if (!can(c.user, 'dcc')) throw new HttpError(403, 'ดูเอกสารที่ยกเลิกแล้วได้เฉพาะ DCC/Admin');
      if (status === 'OBSOLETE') where.push("d.status = 'OBSOLETE'");
    } else {
      where.push("d.status = 'ACTIVE'");
    }
    if (category) { where.push('d.category = ?'); params.push(category); }
    const term = q.trim();
    if (term) { where.push('(d.doc_no LIKE ? OR d.title LIKE ?)'); params.push(`%${term}%`, `%${term}%`); }
    const rows = await all(c.env, `${DOC_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.sort, d.seq`, ...params);
    return json({ documents: rows.map(mapDocument) });
  });

  r.get('/api/documents/:id', async (c) => {
    libraryAccess(c);
    const d = await one(c.env, `${DOC_SELECT} WHERE d.id = ?`, Number(c.params.id));
    if (!d || (d.status === 'OBSOLETE' && !can(c.user, 'dcc'))) throw new HttpError(404, 'ไม่พบเอกสาร');
    const isDcc = can(c.user, 'dcc');
    const revisions = (await all(c.env,
      `SELECT v.*, u.name AS publisher, q.req_no, q.reason
       FROM revisions v LEFT JOIN users u ON u.id = v.published_by LEFT JOIN requests q ON q.id = v.request_id
       WHERE v.document_id = ? ORDER BY v.rev DESC`, d.id))
      .map((v) => ({
        id: v.id,
        rev: v.rev,
        title: v.title,
        status: v.status,
        dcnNo: v.dcn_no,
        reqNo: c.user ? v.req_no : null,
        reason: c.user ? v.reason : null,
        effectiveDate: v.effective_date,
        publishedAt: v.published_at,
        publisher: v.publisher,
        obsoletedAt: v.obsoleted_at,
        fileName: baseName(v.file_key),
        size: v.size,
        canDownload: v.status === 'CURRENT' || isDcc,
      }));
    return json({ document: mapDocument(d), revisions });
  });

  r.get('/api/documents/:id/download', async (c) => {
    libraryAccess(c);
    const v = await one(c.env,
      `SELECT v.* FROM documents d JOIN revisions v ON v.document_id = d.id AND v.rev = d.current_rev
       WHERE d.id = ? AND d.status = 'ACTIVE'`, Number(c.params.id));
    if (!v) throw new HttpError(404, 'ไม่พบไฟล์เอกสาร');
    return sendObject(c.env, v.file_key, baseName(v.file_key), c.query.get('inline') === '1');
  });

  r.get('/api/revisions/:id/download', async (c) => {
    libraryAccess(c);
    const v = await one(c.env, 'SELECT * FROM revisions WHERE id = ?', Number(c.params.id));
    if (!v) throw new HttpError(404, 'ไม่พบไฟล์เอกสาร');
    if (v.status !== 'CURRENT' && !can(c.user, 'dcc')) throw new HttpError(403, 'ดาวน์โหลดฉบับเก่าได้เฉพาะ DCC/Admin');
    return sendObject(c.env, v.file_key, baseName(v.file_key), c.query.get('inline') === '1');
  });

  // DCC: นำเข้าเอกสารเดิมที่มีอยู่แล้ว (ไม่ผ่าน workflow)
  r.post('/api/documents/import', async (c) => {
    requireRole(c, 'dcc');
    const form = await c.req.formData();
    return json({ document: await importExisting(c, form) }, 201);
  });
}
