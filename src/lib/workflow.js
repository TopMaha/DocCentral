import { HttpError, cfg, one, all, localDate } from './http.js';
import { can } from './auth.js';
import { notify, usersWithRole } from './notify.js';
import {
  savePending, moveObject, publishedName, controlledKey, obsoleteKey, baseName, extOf, mimeFor,
} from './files.js';

export const TYPES = { NEW: 'ลงทะเบียนใหม่', REVISE: 'แก้ไข (Up Rev.)', CANCEL: 'ยกเลิกเอกสาร' };
export const STATUS = {
  PENDING_REVIEW: 'รอ Admin ตรวจสอบ',
  PENDING_APPROVAL: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว · รอประกาศใช้',
  PUBLISHED: 'ประกาศใช้แล้ว',
  REJECTED: 'ไม่อนุมัติ',
  WITHDRAWN: 'ผู้ขอยกเลิกคำขอ',
};
export const ACTIVE = ['PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED'];
const ACTIVE_SQL = ACTIVE.map((s) => `'${s}'`).join(',');

const link = (id) => `#/requests/${id}`;
const today = () => localDate();
const year = () => Number(localDate().slice(0, 4));
const label = (r) => `${r.req_no} · ${r.doc_no} ${r.title}`;

// ---------------------------------------------------------------- D1 batch helpers
const prep = (c, sql, ...p) => c.env.DB.prepare(sql).bind(...p.map((v) => (v === undefined ? null : v)));

/** คำสั่งที่ทำให้ batch ล้มทั้งชุด (rollback) ถ้าเงื่อนไขไม่เป็นจริง */
const guard = (c, cond, ...p) => prep(c, `INSERT INTO counters (key, value) SELECT '__guard__', NULL WHERE NOT (${cond})`, ...p);
const logStmt = (c, requestId, actorId, action, comment = '') =>
  prep(c, 'INSERT INTO request_logs (request_id, actor_id, action, comment) VALUES (?, ?, ?, ?)', requestId, actorId, action, comment);

async function batch(c, stmts) {
  try {
    return await c.env.DB.batch(stmts);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('counters.value')) throw new HttpError(409, 'สถานะคำขอเปลี่ยนไปแล้ว กรุณารีเฟรชหน้าแล้วลองใหม่', 'STALE');
    if (msg.includes('UNIQUE') && msg.includes('requests.document_id')) throw new HttpError(409, 'เอกสารนี้มีคำขออื่นกำลังดำเนินการอยู่', 'BUSY');
    if (msg.includes('UNIQUE') && msg.includes('requests.doc_no')) throw new HttpError(409, 'เลขเอกสารถูกจองพร้อมกัน กรุณากด Submit อีกครั้ง', 'BUSY');
    if (msg.includes('UNIQUE') && msg.includes('documents.doc_no')) throw new HttpError(409, 'เลขที่เอกสารนี้มีอยู่ในระบบแล้ว', 'DUP');
    throw err;
  }
}

async function getRequest(c, id) {
  const r = await one(c.env, 'SELECT * FROM requests WHERE id = ?', Number(id));
  if (!r) throw new HttpError(404, 'ไม่พบคำขอ');
  return r;
}

// ---------------------------------------------------------------- สิทธิ์
export function actionsFor(user, r) {
  if (!user) return [];
  const a = [];
  const admin = can(user, 'admin');
  if (r.status === 'PENDING_REVIEW' && admin) a.push('forward', 'reject');
  if (r.status === 'PENDING_APPROVAL') {
    if (r.approver_id === user.id) a.push('approve', 'reject');
    if (admin) a.push('reassign');
  }
  if (r.status === 'APPROVED' && can(user, 'dcc')) a.push(r.dcn_no ? 'publish' : 'dcn');
  if (['PENDING_REVIEW', 'PENDING_APPROVAL'].includes(r.status) && r.requester_id === user.id) a.push('withdraw');
  return a;
}

export function canView(user, r) {
  return r.requester_id === user.id || r.approver_id === user.id
    || can(user, 'admin') || can(user, 'dcc') || can(user, 'approver');
}

function need(user, r, action, msg) {
  if (!actionsFor(user, r).includes(action)) throw new HttpError(409, msg);
}

// ---------------------------------------------------------------- ส่งคำขอ
export async function createRequest(c, form) {
  const user = c.user;
  const type = String(form.get('type') || '');
  const reason = String(form.get('reason') || '').trim().slice(0, 1000);
  const title = String(form.get('title') || '').trim().slice(0, 200);
  if (!TYPES[type]) throw new HttpError(400, 'กรุณาเลือกประเภทคำขอ');
  if (reason.length < 5) throw new HttpError(400, 'กรุณาใส่เหตุผลในการเปลี่ยนแปลง (อย่างน้อย 5 ตัวอักษร)');

  let category = null;
  let doc = null;
  if (type === 'NEW') {
    category = String(form.get('category') || '');
    if (!(await one(c.env, 'SELECT code FROM categories WHERE code = ?', category))) throw new HttpError(400, 'กรุณาเลือกหมวดเอกสาร');
    if (!title) throw new HttpError(400, 'กรุณาใส่ชื่อเอกสาร');
  } else {
    doc = await one(c.env, 'SELECT * FROM documents WHERE id = ?', Number(form.get('documentId')));
    if (!doc || doc.status !== 'ACTIVE') throw new HttpError(400, 'กรุณาเลือกเอกสารที่ใช้งานอยู่');
    const busy = await one(c.env, `SELECT req_no FROM requests WHERE document_id = ? AND status IN (${ACTIVE_SQL})`, doc.id);
    if (busy) throw new HttpError(409, `เอกสารนี้มีคำขอ ${busy.req_no} กำลังดำเนินการอยู่ กรุณารอให้เสร็จก่อน`);
  }

  const file = form.get('file');
  if (type !== 'CANCEL' && (!file || typeof file === 'string' || !file.size)) throw new HttpError(400, 'กรุณาแนบไฟล์เอกสาร');
  const up = type !== 'CANCEL' ? await savePending(c.env, file) : null;

  const { docPrefix, seqDigits } = cfg(c.env);
  const y = year();
  const counterKey = `REQ-${y}`;
  const bump = prep(c, 'INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1', counterKey);
  const reqNo = `printf('REQ-%d-%04d', ${y}, (SELECT value FROM counters WHERE key = '${counterKey}'))`;
  const cols = `req_no, type, status, requester_id, category, document_id, doc_no, seq, title, from_rev, to_rev, reason,
                upload_key, upload_name, upload_size, upload_mime`;
  let insert;
  if (type === 'NEW') {
    // run เลขต่อจากเลขสูงสุดของเอกสารที่มีอยู่ + เลขที่จองไว้ (ทำใน statement เดียว กันเลขชน)
    insert = prep(c, `
      INSERT INTO requests (${cols})
      SELECT ${reqNo}, 'NEW', 'PENDING_REVIEW', ?1, ?2, NULL, printf('%s-%s-%0*d', ?3, ?2, ?4, n.seq), n.seq, ?5, NULL, 0, ?6, ?7, ?8, ?9, ?10
      FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM (
              SELECT seq FROM documents WHERE category = ?2
              UNION ALL
              SELECT seq FROM requests WHERE type = 'NEW' AND category = ?2 AND status IN (${ACTIVE_SQL}))) n
      RETURNING id, req_no, doc_no, title`,
    user.id, category, docPrefix, seqDigits, title, reason, up?.key, up?.name, up?.size, up?.mime);
  } else {
    insert = prep(c, `
      INSERT INTO requests (${cols})
      SELECT ${reqNo}, ?1, 'PENDING_REVIEW', ?2, d.category, d.id, d.doc_no, d.seq,
             CASE WHEN ?1 = 'REVISE' AND ?3 <> '' THEN ?3 ELSE d.title END,
             d.current_rev, CASE WHEN ?1 = 'REVISE' THEN d.current_rev + 1 ELSE d.current_rev END,
             ?4, ?5, ?6, ?7, ?8
      FROM documents d WHERE d.id = ?9 AND d.status = 'ACTIVE'
      RETURNING id, req_no, doc_no, title`,
    type, user.id, title, reason, up?.key, up?.name, up?.size, up?.mime, doc.id);
  }

  let created;
  try {
    const res = await batch(c, [bump, insert]);
    created = res[1].results?.[0];
    if (!created) throw new HttpError(409, 'เอกสารถูกเปลี่ยนสถานะระหว่างยื่นคำขอ กรุณาลองใหม่');
    await prep(c, 'INSERT INTO request_logs (request_id, actor_id, action, comment) VALUES (?, ?, ?, ?)', created.id, user.id, 'SUBMIT', reason).run();
  } catch (err) {
    if (up) await c.env.FILES.delete(up.key).catch(() => {});
    throw err;
  }

  await notify(c, await usersWithRole(c.env, 'admin'), {
    requestId: created.id,
    kind: 'review',
    title: `คำขอใหม่รอตรวจสอบ: ${TYPES[type]}`,
    body: `${user.name} ส่งคำขอ ${label(created)}`,
    link: link(created.id),
  }, user.id);
  return created;
}

// ---------------------------------------------------------------- Admin → ผู้อนุมัติ
export async function forward(c, id, approverId, comment = '') {
  const r = await getRequest(c, id);
  const reassign = r.status === 'PENDING_APPROVAL';
  need(c.user, r, reassign ? 'reassign' : 'forward', 'คำขอนี้ไม่อยู่ในขั้นตอนที่ส่งต่อได้');
  const approver = await one(c.env,
    "SELECT * FROM users WHERE id = ? AND active = 1 AND (',' || roles || ',') LIKE '%,approver,%'", Number(approverId));
  if (!approver) throw new HttpError(400, 'กรุณาเลือกผู้อนุมัติ');
  if (approver.id === r.requester_id) throw new HttpError(400, 'ผู้อนุมัติต้องไม่ใช่ผู้ขอ (แยกหน้าที่ตามระบบควบคุมเอกสาร)');

  await batch(c, [
    guard(c, 'EXISTS (SELECT 1 FROM requests WHERE id = ? AND status = ?)', r.id, r.status),
    prep(c, "UPDATE requests SET status = 'PENDING_APPROVAL', approver_id = ?, updated_at = datetime('now') WHERE id = ?", approver.id, r.id),
    logStmt(c, r.id, c.user.id, reassign ? 'REASSIGN' : 'FORWARD', `ผู้อนุมัติ: ${approver.name}${comment ? ` — ${comment}` : ''}`),
  ]);
  await notify(c, [approver], {
    requestId: r.id, kind: 'approval',
    title: `รออนุมัติ: ${TYPES[r.type]} ${r.doc_no}`,
    body: `${label(r)} — กรุณาพิจารณาอนุมัติหรือไม่อนุมัติ`,
    link: link(r.id),
  });
  if (!reassign) {
    await notify(c, [r.requester_id], {
      requestId: r.id, title: `คำขอ ${r.req_no} ผ่านการตรวจสอบ`, body: `ส่งต่อให้ ${approver.name} พิจารณาอนุมัติแล้ว`, link: link(r.id),
    }, c.user.id);
  }
}

export async function approve(c, id, comment = '') {
  const r = await getRequest(c, id);
  need(c.user, r, 'approve', 'คุณไม่ใช่ผู้อนุมัติของคำขอนี้ หรือคำขอไม่อยู่ในขั้นตอนอนุมัติ');
  await batch(c, [
    guard(c, "EXISTS (SELECT 1 FROM requests WHERE id = ? AND status = 'PENDING_APPROVAL' AND approver_id = ?)", r.id, c.user.id),
    prep(c, "UPDATE requests SET status = 'APPROVED', updated_at = datetime('now') WHERE id = ?", r.id),
    logStmt(c, r.id, c.user.id, 'APPROVE', comment),
  ]);
  await notify(c, await usersWithRole(c.env, 'dcc'), {
    requestId: r.id, kind: 'publish',
    title: `อนุมัติแล้ว รอ Run DCN No.: ${r.doc_no}`,
    body: `${label(r)} — กรุณา Run DCN No. และประกาศใช้เอกสาร`,
    link: link(r.id),
  }, c.user.id);
  await notify(c, [r.requester_id], {
    requestId: r.id, kind: 'success', title: `คำขอ ${r.req_no} ได้รับการอนุมัติ`, body: `${c.user.name} อนุมัติแล้ว รอ DCC ประกาศใช้`, link: link(r.id),
  }, c.user.id);
}

export async function reject(c, id, comment) {
  const r = await getRequest(c, id);
  need(c.user, r, 'reject', 'คุณไม่มีสิทธิ์ไม่อนุมัติคำขอนี้');
  comment = String(comment || '').trim();
  if (!comment) throw new HttpError(400, 'กรุณาระบุเหตุผลที่ไม่อนุมัติ');
  await batch(c, [
    guard(c, 'EXISTS (SELECT 1 FROM requests WHERE id = ? AND status = ?)', r.id, r.status),
    prep(c, "UPDATE requests SET status = 'REJECTED', updated_at = datetime('now') WHERE id = ?", r.id),
    logStmt(c, r.id, c.user.id, 'REJECT', comment),
  ]);
  await notify(c, [r.requester_id], {
    requestId: r.id, kind: 'danger', title: `คำขอ ${r.req_no} ไม่ได้รับการอนุมัติ`, body: `${c.user.name}: ${comment}`, link: link(r.id),
  }, c.user.id);
}

export async function withdraw(c, id, comment = '') {
  const r = await getRequest(c, id);
  need(c.user, r, 'withdraw', 'ยกเลิกคำขอได้เฉพาะผู้ขอ และก่อนได้รับการอนุมัติ');
  await batch(c, [
    guard(c, 'EXISTS (SELECT 1 FROM requests WHERE id = ? AND status = ?)', r.id, r.status),
    prep(c, "UPDATE requests SET status = 'WITHDRAWN', updated_at = datetime('now') WHERE id = ?", r.id),
    logStmt(c, r.id, c.user.id, 'WITHDRAW', comment),
  ]);
  if (r.approver_id) {
    await notify(c, [r.approver_id], { requestId: r.id, title: `ผู้ขอยกเลิกคำขอ ${r.req_no}`, body: label(r), link: link(r.id) }, c.user.id);
  }
}

// ---------------------------------------------------------------- DCC
export async function runDcn(c, id) {
  const r = await getRequest(c, id);
  need(c.user, r, 'dcn', 'คำขอนี้ไม่อยู่ในขั้นตอน Run DCN No.');
  const key = `DCN-${year()}`;
  await batch(c, [
    guard(c, "EXISTS (SELECT 1 FROM requests WHERE id = ? AND status = 'APPROVED' AND dcn_no IS NULL)", r.id),
    prep(c, 'INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1', key),
    prep(c, `UPDATE requests SET dcn_no = printf('DCN-%d-%03d', ?, (SELECT value FROM counters WHERE key = ?)), updated_at = datetime('now') WHERE id = ?`, year(), key, r.id),
    prep(c, "INSERT INTO request_logs (request_id, actor_id, action, comment) SELECT id, ?, 'DCN', dcn_no FROM requests WHERE id = ?", c.user.id, r.id),
  ]);
}

export async function publish(c, id, effectiveDate) {
  const r = await getRequest(c, id);
  need(c.user, r, 'publish', 'กรุณา Run DCN No. ก่อนประกาศใช้');
  const eff = /^\d{4}-\d{2}-\d{2}$/.test(String(effectiveDate || '')) ? effectiveDate : today();
  const doc = r.document_id ? await one(c.env, 'SELECT * FROM documents WHERE id = ?', r.document_id) : null;
  if (doc && doc.status !== 'ACTIVE') throw new HttpError(409, 'เอกสารนี้ถูกยกเลิกไปแล้ว');
  const oldRev = doc ? await one(c.env, 'SELECT * FROM revisions WHERE document_id = ? AND rev = ?', doc.id, doc.current_rev) : null;
  const toRev = r.type === 'REVISE' ? doc.current_rev + 1 : r.to_rev;

  // ย้ายไฟล์ใน R2 ก่อน แล้วค่อยบันทึก DB — ถ้า DB ล้มเหลวจะย้ายไฟล์กลับ
  const moves = [];
  const mv = async (from, to) => {
    const final = await moveObject(c.env, from, to);
    moves.push([final, from]);
    return final;
  };
  try {
    let oldNewKey = null;
    if (oldRev && (await c.env.FILES.head(oldRev.file_key))) {
      oldNewKey = await mv(oldRev.file_key, obsoleteKey(c.env, r.category, baseName(oldRev.file_key)));
    }
    let newKey = null;
    if (r.type !== 'CANCEL') {
      newKey = await mv(r.upload_key, controlledKey(c.env, r.category, publishedName(c.env, r.doc_no, toRev, r.title, extOf(r.upload_name))));
    }

    const docIdExpr = '(SELECT id FROM documents WHERE doc_no = ?)';
    const stmts = [guard(c, "EXISTS (SELECT 1 FROM requests WHERE id = ? AND status = 'APPROVED' AND dcn_no IS NOT NULL)", r.id)];
    if (oldRev) {
      stmts.push(prep(c, "UPDATE revisions SET status = ?, obsoleted_at = datetime('now'), file_key = COALESCE(?, file_key) WHERE id = ?",
        r.type === 'CANCEL' ? 'CANCELLED' : 'SUPERSEDED', oldNewKey, oldRev.id));
    }
    if (r.type === 'NEW') {
      stmts.push(prep(c, `INSERT INTO documents (doc_no, category, seq, title, current_rev, status, owner_dept, effective_date)
        VALUES (?, ?, ?, ?, ?, 'ACTIVE', (SELECT department FROM users WHERE id = ?), ?)`,
      r.doc_no, r.category, r.seq, r.title, toRev, r.requester_id, eff));
    } else if (r.type === 'REVISE') {
      stmts.push(prep(c, "UPDATE documents SET title = ?, current_rev = ?, effective_date = ?, updated_at = datetime('now') WHERE id = ?", r.title, toRev, eff, doc.id));
    } else {
      stmts.push(prep(c, "UPDATE documents SET status = 'OBSOLETE', updated_at = datetime('now') WHERE id = ?", doc.id));
    }
    if (newKey) {
      stmts.push(prep(c, `INSERT INTO revisions (document_id, rev, title, file_key, original_name, size, mime, status, dcn_no, request_id, effective_date, published_by)
        VALUES (${docIdExpr}, ?, ?, ?, ?, ?, ?, 'CURRENT', ?, ?, ?, ?)`,
      r.doc_no, toRev, r.title, newKey, r.upload_name, r.upload_size || 0, r.upload_mime || '', r.dcn_no, r.id, eff, c.user.id));
    }
    stmts.push(prep(c, `UPDATE requests SET status = 'PUBLISHED', document_id = ${docIdExpr}, to_rev = ?, effective_date = ?, updated_at = datetime('now') WHERE id = ?`,
      r.doc_no, toRev, eff, r.id));
    stmts.push(logStmt(c, r.id, c.user.id, 'PUBLISH', `${r.dcn_no} · มีผล ${eff}`));
    await batch(c, stmts);
  } catch (err) {
    for (const [now, back] of moves.reverse()) {
      try { await moveObject(c.env, now, back); } catch { /* ย้ายกลับไม่ได้ ให้ DCC ตรวจสอบ */ }
    }
    throw err;
  }

  const verb = r.type === 'CANCEL' ? 'ยกเลิกการใช้' : 'ประกาศใช้';
  await notify(c, [r.requester_id, ...(await usersWithRole(c.env, 'admin'))], {
    requestId: r.id, kind: 'success',
    title: `${verb}แล้ว: ${r.doc_no} Rev.${String(toRev).padStart(cfg(c.env).revDigits, '0')}`,
    body: `${r.title} · ${r.dcn_no} · มีผล ${eff}`,
    link: link(r.id),
  }, c.user.id);
}

// ---------------------------------------------------------------- นำเข้าเอกสารเดิม
export async function importExisting(c, form) {
  const { docPrefix, seqDigits } = cfg(c.env);
  let docNo = String(form.get('docNo') || '').trim().toUpperCase();
  const title = String(form.get('title') || '').trim().slice(0, 200);
  const m = docNo.match(new RegExp(`^${docPrefix}-([A-Z]+)-(\\d{1,6})$`));
  if (!m) throw new HttpError(400, `รูปแบบเลขเอกสารไม่ถูกต้อง (ตัวอย่าง ${docPrefix}-QA-001)`);
  const category = m[1];
  if (!(await one(c.env, 'SELECT code FROM categories WHERE code = ?', category))) throw new HttpError(400, `ไม่มีหมวด ${category} ในระบบ`);
  const seq = Number(m[2]);
  docNo = `${docPrefix}-${category}-${String(seq).padStart(seqDigits, '0')}`;
  const rev = Number.parseInt(form.get('rev') ?? '0', 10);
  if (!Number.isInteger(rev) || rev < 0 || rev > 99) throw new HttpError(400, 'Rev. ต้องเป็นตัวเลข 0–99');
  if (!title) throw new HttpError(400, 'กรุณาใส่ชื่อเอกสาร');
  const eff = /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('effectiveDate') || '')) ? form.get('effectiveDate') : today();
  if (await one(c.env, 'SELECT id FROM documents WHERE doc_no = ?', docNo)) throw new HttpError(409, `${docNo} มีอยู่ในระบบแล้ว`);
  const reserved = await one(c.env, `SELECT req_no FROM requests WHERE doc_no = ? AND type = 'NEW' AND status IN (${ACTIVE_SQL})`, docNo);
  if (reserved) throw new HttpError(409, `${docNo} ถูกจองโดยคำขอ ${reserved.req_no}`);

  const file = form.get('file');
  const up = await savePending(c.env, file);
  if (!up) throw new HttpError(400, 'กรุณาแนบไฟล์เอกสาร');
  let key = null;
  try {
    key = await moveObject(c.env, up.key, controlledKey(c.env, category, publishedName(c.env, docNo, rev, title, extOf(up.name))));
    await batch(c, [
      prep(c, `INSERT INTO documents (doc_no, category, seq, title, current_rev, status, effective_date) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
        docNo, category, seq, title, rev, eff),
      prep(c, `INSERT INTO revisions (document_id, rev, title, file_key, original_name, size, mime, status, dcn_no, effective_date, published_by)
        VALUES ((SELECT id FROM documents WHERE doc_no = ?), ?, ?, ?, ?, ?, ?, 'CURRENT', 'IMPORT', ?, ?)`,
      docNo, rev, title, key, up.name, up.size, mimeFor(up.name), eff, c.user.id),
    ]);
  } catch (err) {
    await c.env.FILES.delete(key || up.key).catch(() => {});
    throw err;
  }
  const d = await one(c.env, 'SELECT id FROM documents WHERE doc_no = ?', docNo);
  return { id: d.id, docNo, title, rev };
}

// ---------------------------------------------------------------- แปลงข้อมูลส่งให้หน้าเว็บ
export const REQUEST_SELECT = `
  SELECT q.*, u.name AS requester_name, u.emp_id AS requester_emp, u.department AS requester_dept,
         a.name AS approver_name, c.name AS category_name
  FROM requests q
  JOIN users u ON u.id = q.requester_id
  LEFT JOIN users a ON a.id = q.approver_id
  LEFT JOIN categories c ON c.code = q.category`;

export function mapRequest(q, user) {
  return {
    id: q.id,
    reqNo: q.req_no,
    type: q.type,
    typeLabel: TYPES[q.type],
    status: q.status,
    statusLabel: STATUS[q.status],
    category: q.category,
    categoryName: q.category_name,
    documentId: q.document_id,
    docNo: q.doc_no,
    title: q.title,
    fromRev: q.from_rev,
    toRev: q.to_rev,
    reason: q.reason,
    file: q.upload_name ? { name: q.upload_name, size: q.upload_size, ext: extOf(q.upload_name).slice(1) } : null,
    requester: { id: q.requester_id, name: q.requester_name, empId: q.requester_emp, department: q.requester_dept },
    approver: q.approver_id ? { id: q.approver_id, name: q.approver_name } : null,
    dcnNo: q.dcn_no,
    effectiveDate: q.effective_date,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    actions: actionsFor(user, q),
  };
}

export async function logsFor(env, id) {
  return (await all(env,
    `SELECT l.*, u.name AS actor_name FROM request_logs l LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.request_id = ? ORDER BY l.id`, id))
    .map((l) => ({ id: l.id, action: l.action, comment: l.comment, actor: l.actor_name, at: l.created_at }));
}

/** เงื่อนไข SQL ของ "งานรอฉันดำเนินการ" */
export function taskFilter(user) {
  const ors = ["(q.status = 'PENDING_APPROVAL' AND q.approver_id = ?)"];
  if (can(user, 'admin')) ors.push("q.status = 'PENDING_REVIEW'");
  if (can(user, 'dcc')) ors.push("q.status = 'APPROVED'");
  return { sql: `(${ors.join(' OR ')})`, params: [user.id] };
}
