import { HttpError, json, readJson, one, all, run } from '../lib/http.js';
import { tempPassword } from '../lib/crypto.js';
import { publicUser, requireRole, hashFor } from '../lib/auth.js';
import { cleanPositions, splitList } from '../lib/positions.js';

// 'approver' ไม่เลือกเอง — ระบบใส่ให้อัตโนมัติเมื่อผู้ใช้ดำรงตำแหน่งผู้อนุมัติอย่างน้อย 1 ตำแหน่ง
const VALID_ROLES = ['admin', 'dcc'];

function cleanRoles(roles) {
  const list = Array.isArray(roles) ? roles : String(roles || '').split(',');
  return [...new Set(list.map((x) => String(x).trim()).filter((x) => VALID_ROLES.includes(x)))];
}

/** roles ที่บันทึกจริง = admin/dcc ที่เลือก + approver ถ้ามีตำแหน่ง */
const withApproverRole = (roles, positions) =>
  [...splitList(roles).filter((r) => r !== 'approver'), ...(positions ? ['approver'] : [])].join(',');

function validate(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    out.name = String(body.name || '').trim().slice(0, 120);
    if (!out.name) throw new HttpError(400, 'กรุณาใส่ชื่อ-นามสกุล');
  }
  if (body.department !== undefined) out.department = String(body.department || '').trim().slice(0, 60);
  if (body.email !== undefined) {
    out.email = String(body.email || '').trim();
    if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new HttpError(400, 'รูปแบบอีเมลไม่ถูกต้อง');
  }
  if (body.roles !== undefined) out.roles = cleanRoles(body.roles).join(',');
  if (body.positions !== undefined) out.positions = cleanPositions(body.positions).join(',');
  if (body.active !== undefined) out.active = body.active ? 1 : 0;
  return out;
}

export default function register(r) {
  r.get('/api/users', async (c) => {
    requireRole(c, 'admin');
    return json({ users: (await all(c.env, 'SELECT * FROM users ORDER BY active DESC, emp_id')).map(publicUser) });
  });

  r.post('/api/users', async (c) => {
    requireRole(c, 'admin');
    const body = await readJson(c.req);
    const empId = String(body.empId || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(empId)) throw new HttpError(400, 'รหัสพนักงานใช้ได้เฉพาะ A-Z, 0-9 และ - (เช่น T-815)');
    if (await one(c.env, 'SELECT id FROM users WHERE emp_id = ?', empId)) throw new HttpError(409, `มีรหัสพนักงาน ${empId} อยู่แล้ว`);
    const v = validate(body);
    const password = tempPassword();
    const positions = v.positions || '';
    const res = await run(c.env,
      `INSERT INTO users (emp_id, name, department, email, password_hash, roles, positions, must_change_pw) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      empId, v.name, v.department || '', v.email || '', await hashFor(c.env, password), withApproverRole(v.roles, positions), positions);
    const user = await one(c.env, 'SELECT * FROM users WHERE id = ?', res.meta.last_row_id);
    return json({ user: publicUser(user), tempPassword: password }, 201);
  });

  r.patch('/api/users/:id', async (c) => {
    requireRole(c, 'admin');
    const id = Number(c.params.id);
    const cur = await one(c.env, 'SELECT id, roles, positions FROM users WHERE id = ?', id);
    if (!cur) throw new HttpError(404, 'ไม่พบผู้ใช้');
    const v = validate(await readJson(c.req), { partial: true });
    if (id === c.user.id) {
      if (v.active === 0) throw new HttpError(400, 'ระงับบัญชีตัวเองไม่ได้');
      if (v.roles !== undefined && !v.roles.split(',').includes('admin')) throw new HttpError(400, 'ถอดสิทธิ์ Admin ของตัวเองไม่ได้');
    }
    if (v.roles !== undefined || v.positions !== undefined) {
      v.roles = withApproverRole(v.roles ?? cur.roles, v.positions ?? cur.positions);
    }
    const keys = Object.keys(v);
    const stmts = [];
    if (keys.length) stmts.push(c.env.DB.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map((k) => v[k]), id));
    if (v.active === 0) stmts.push(c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
    if (stmts.length) await c.env.DB.batch(stmts);
    return json({ user: publicUser(await one(c.env, 'SELECT * FROM users WHERE id = ?', id)) });
  });

  r.post('/api/users/:id/reset-password', async (c) => {
    requireRole(c, 'admin');
    const id = Number(c.params.id);
    if (!(await one(c.env, 'SELECT id FROM users WHERE id = ?', id))) throw new HttpError(404, 'ไม่พบผู้ใช้');
    const password = tempPassword();
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?').bind(await hashFor(c.env, password), id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    ]);
    return json({ tempPassword: password });
  });
}
