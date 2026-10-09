import { HttpError, cfg, cookie, parseCookies, one, run } from './http.js';
import { hashPassword, verifyPassword, randomToken, sha256Hex, PBKDF2_ITERATIONS } from './crypto.js';

export const COOKIE = 'dcc_sid';

export const iterationsFor = (env) => Math.min(PBKDF2_ITERATIONS, Number(env.PBKDF2_ITERATIONS || PBKDF2_ITERATIONS));
export const hashFor = (env, password) => hashPassword(password, iterationsFor(env));

export function rolesOf(user) {
  return String(user?.roles || '').split(',').map((r) => r.trim()).filter(Boolean);
}

/** admin ทำงานแทน DCC ได้; ผู้อนุมัติต้องมีสิทธิ์ approver โดยตรง */
export function can(user, role) {
  if (!user) return false;
  const r = rolesOf(user);
  if (role === 'dcc') return r.includes('dcc') || r.includes('admin');
  return r.includes(role);
}

export const isStaff = (u) => can(u, 'admin') || can(u, 'dcc') || can(u, 'approver');

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    empId: u.emp_id,
    name: u.name,
    department: u.department || '',
    email: u.email || '',
    roles: rolesOf(u),
    active: !!u.active,
    mustChangePw: !!u.must_change_pw,
    lastLogin: u.last_login || null,
    createdAt: u.created_at,
  };
}

const secureCookie = (c) => c.url.protocol === 'https:';

export async function createSession(c, userId, remember) {
  const { sessionHours, rememberDays } = cfg(c.env);
  const token = randomToken();
  const seconds = remember ? rememberDays * 86400 : sessionHours * 3600;
  const expires = new Date(Date.now() + seconds * 1000).toISOString();
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256Hex(token), userId, expires),
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
  ]);
  c.cookies.push(cookie(COOKIE, token, { maxAge: remember ? seconds : undefined, secure: secureCookie(c) }));
}

export async function destroySession(c) {
  const token = parseCookies(c.req.headers.get('Cookie'))[COOKIE];
  if (token) await run(c.env, 'DELETE FROM sessions WHERE token = ?', await sha256Hex(token));
  c.cookies.push(cookie(COOKIE, '', { maxAge: 0, secure: secureCookie(c) }));
}

export async function loadUser(c) {
  const token = parseCookies(c.req.headers.get('Cookie'))[COOKIE];
  if (!token) return null;
  return one(
    c.env,
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`,
    await sha256Hex(token), new Date().toISOString(),
  );
}

export function requireAuth(c) {
  if (!c.user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ', 'UNAUTHENTICATED');
  if (c.user.must_change_pw) throw new HttpError(403, 'กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน', 'MUST_CHANGE_PASSWORD');
}

export function requireRole(c, role) {
  requireAuth(c);
  if (!can(c.user, role)) throw new HttpError(403, 'คุณไม่มีสิทธิ์ทำรายการนี้', 'FORBIDDEN');
}

// ---------- ล็อกอิน + กันเดารหัสผ่าน (เก็บใน D1) ----------
const MAX_FAILS = 5;
const LOCK_MIN = 5;
const DUMMY_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';
const DUMMY_HASH = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export async function attemptLogin(c, empId, password) {
  const key = `${empId.toLowerCase()}|${c.req.headers.get('CF-Connecting-IP') || ''}`;
  const a = await one(c.env, 'SELECT * FROM login_attempts WHERE key = ?', key);
  if (a?.lock_until && a.lock_until > new Date().toISOString()) {
    const mins = Math.max(1, Math.ceil((new Date(a.lock_until) - Date.now()) / 60000));
    throw new HttpError(429, `ลองผิดหลายครั้งเกินไป กรุณารอ ${mins} นาทีแล้วลองใหม่`, 'LOCKED');
  }
  const user = await one(c.env, 'SELECT * FROM users WHERE emp_id = ?', empId);
  // ไม่มีผู้ใช้ก็ยัง hash เท่าเดิม เพื่อไม่ให้เดารหัสพนักงานจากเวลาตอบกลับได้
  const ok = await verifyPassword(password, user ? user.password_hash : `pbkdf2$${iterationsFor(c.env)}$${DUMMY_SALT}$${DUMMY_HASH}`) && !!user;
  if (!ok) {
    const fails = (a?.fails || 0) + 1;
    const lock = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000).toISOString() : null;
    await run(
      c.env,
      `INSERT INTO login_attempts (key, fails, lock_until) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, lock_until = excluded.lock_until`,
      key, lock ? 0 : fails, lock,
    );
    throw new HttpError(401, 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง', 'BAD_LOGIN');
  }
  if (a) await run(c.env, 'DELETE FROM login_attempts WHERE key = ?', key);
  // ปรับจำนวนรอบ hash ให้ตรงกับค่าที่ตั้งไว้ปัจจุบัน
  const iter = Number(String(user.password_hash).split('$')[1]);
  if (iter !== iterationsFor(c.env)) {
    await run(c.env, 'UPDATE users SET password_hash = ? WHERE id = ?', await hashFor(c.env, password), user.id);
  }
  return user;
}
