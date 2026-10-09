import { HttpError, json, readJson, cfg, one, run } from '../lib/http.js';
import { verifyPassword } from '../lib/crypto.js';
import { emailEnabled } from '../lib/notify.js';
import {
  attemptLogin, createSession, destroySession, publicUser, hashFor,
} from '../lib/auth.js';

const fresh = async (c) => publicUser(await one(c.env, 'SELECT * FROM users WHERE id = ?', c.user.id));

export default function register(r) {
  r.get('/api/auth/me', (c) => {
    const s = cfg(c.env);
    return json({
      user: publicUser(c.user),
      settings: { publicLibrary: s.publicLibrary, emailEnabled: emailEnabled(c.env), maxUploadMb: s.maxUploadMb, folders: s.folders },
    });
  });

  r.post('/api/auth/login', async (c) => {
    const body = await readJson(c.req);
    const empId = String(body.empId || '').trim();
    const password = String(body.password || '');
    if (!empId || !password) throw new HttpError(400, 'กรุณากรอกรหัสพนักงานและรหัสผ่าน');
    const user = await attemptLogin(c, empId, password);
    if (!user.active) throw new HttpError(403, 'บัญชีนี้ถูกระงับ กรุณาติดต่อ Admin', 'INACTIVE');
    await run(c.env, "UPDATE users SET last_login = datetime('now') WHERE id = ?", user.id);
    await createSession(c, user.id, !!body.remember);
    return json({ user: publicUser(user) });
  });

  r.post('/api/auth/logout', async (c) => {
    await destroySession(c);
    return json({ ok: true });
  });

  r.post('/api/auth/change-password', async (c) => {
    if (!c.user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ', 'UNAUTHENTICATED');
    const body = await readJson(c.req);
    const current = String(body.current || '');
    const next = String(body.next || '');
    if (!(await verifyPassword(current, c.user.password_hash))) throw new HttpError(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง', 'BAD_CURRENT');
    if (next.length < 8) throw new HttpError(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', 'WEAK');
    if (next === current) throw new HttpError(400, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม', 'SAME');
    await run(c.env, 'UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?', await hashFor(c.env, next), c.user.id);
    return json({ user: await fresh(c) });
  });

  r.patch('/api/auth/profile', async (c) => {
    if (!c.user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ', 'UNAUTHENTICATED');
    const body = await readJson(c.req);
    const email = String(body.email ?? c.user.email ?? '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'รูปแบบอีเมลไม่ถูกต้อง');
    await run(c.env, 'UPDATE users SET email = ? WHERE id = ?', email, c.user.id);
    return json({ user: await fresh(c) });
  });
}
