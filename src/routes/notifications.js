import { json, one, all, run } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { taskFilter } from '../lib/workflow.js';

export default function register(r) {
  r.get('/api/notifications', async (c) => {
    requireAuth(c);
    const rows = await all(c.env, 'SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40', c.user.id);
    return json({
      notifications: rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read: !!n.read_at, at: n.created_at })),
    });
  });

  /** ใช้ poll ทุก 30 วินาที: จำนวนแจ้งเตือนที่ยังไม่อ่าน + งานรอดำเนินการ */
  r.get('/api/notifications/badge', async (c) => {
    requireAuth(c);
    const t = taskFilter(c.user);
    const [unread, tasks] = await Promise.all([
      one(c.env, 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', c.user.id),
      one(c.env, `SELECT COUNT(*) AS n FROM requests q WHERE ${t.sql}`, ...t.params),
    ]);
    return json({ unread: unread.n, tasks: tasks.n });
  });

  r.post('/api/notifications/read-all', async (c) => {
    requireAuth(c);
    await run(c.env, "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", c.user.id);
    return json({ ok: true });
  });

  r.post('/api/notifications/:id/read', async (c) => {
    requireAuth(c);
    await run(c.env, "UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL", Number(c.params.id), c.user.id);
    return json({ ok: true });
  });
}
