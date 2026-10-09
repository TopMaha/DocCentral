import { Router } from './router.js';
import { HttpError, json } from './lib/http.js';
import { loadUser } from './lib/auth.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import requestRoutes from './routes/requests.js';
import metaRoutes from './routes/meta.js';
import userRoutes from './routes/users.js';
import notificationRoutes from './routes/notifications.js';

const router = new Router();
for (const register of [authRoutes, documentRoutes, requestRoutes, metaRoutes, userRoutes, notificationRoutes]) register(router);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
};

function errorResponse(err) {
  if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
  console.error('[error]', err?.stack || err);
  return json({ error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่ หรือติดต่อ Admin' }, 500);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    // หน้าเว็บ (static) — ส่งให้ Workers Static Assets
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    const c = { req, env, ctx, url, params: {}, query: url.searchParams, user: null, cookies: [] };
    let res;
    try {
      // ทุก request ที่เปลี่ยนข้อมูลต้องมี header นี้ (บังคับ preflight ข้ามโดเมน กัน CSRF)
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.get('X-Requested-With') !== 'dcc') {
        throw new HttpError(403, 'Invalid request origin', 'CSRF');
      }
      const m = router.match(req.method, url.pathname);
      if (!m) throw new HttpError(404, 'ไม่พบ API');
      c.params = m.params;
      c.user = await loadUser(c);
      res = await m.handler(c);
    } catch (err) {
      res = errorResponse(err);
    }
    res = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    for (const ck of c.cookies) res.headers.append('Set-Cookie', ck);
    return res;
  },
};
