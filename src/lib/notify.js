import { all, cfg } from './http.js';

export const emailEnabled = (env) => !!(env.RESEND_API_KEY && cfg(env).mailFrom);

export function usersWithRole(env, role) {
  return all(env, `SELECT id, name, email FROM users WHERE active = 1 AND (',' || roles || ',') LIKE ?`, `%,${role},%`);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

function emailHtml(base, { title, body, link }) {
  const url = `${base}/${link || ''}`;
  return `<div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:560px;margin:auto;border:1px solid #e3e9e5;border-radius:12px;overflow:hidden">
  <div style="background:#087a20;color:#fff;padding:16px 20px;font-weight:600">Wesco · Document Control Center</div>
  <div style="padding:20px;color:#1d262d">
    <h2 style="margin:0 0 8px;font-size:18px">${esc(title)}</h2>
    <p style="margin:0 0 20px;line-height:1.6;color:#44525c">${esc(body)}</p>
    <a href="${esc(url)}" style="display:inline-block;background:#087a20;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">เปิดในระบบ DCC</a>
  </div></div>`;
}

/**
 * แจ้งเตือนในระบบ (กระดิ่ง) + อีเมลผ่าน Resend ถ้าตั้งค่า RESEND_API_KEY + MAIL_FROM ไว้
 * @param c context { env, ctx, url }
 * @param recipients Array<number | {id}>
 */
export async function notify(c, recipients, { requestId = null, kind = 'info', title, body = '', link = '' }, exceptUserId = null) {
  const ids = [...new Set(recipients.map((r) => (typeof r === 'number' ? r : r?.id)).filter((id) => id && id !== exceptUserId))];
  if (!ids.length) return;
  const ins = c.env.DB.prepare('INSERT INTO notifications (user_id, request_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?, ?)');
  await c.env.DB.batch(ids.map((id) => ins.bind(id, requestId, kind, title, body, link)));

  if (!emailEnabled(c.env)) return;
  const emails = (await all(c.env, `SELECT email FROM users WHERE id IN (${ids.map(() => '?').join(',')}) AND email <> ''`, ...ids)).map((u) => u.email);
  if (!emails.length) return;
  const base = cfg(c.env).appUrl || c.url.origin;
  const send = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg(c.env).mailFrom, to: emails, subject: `[DCC] ${title}`, html: emailHtml(base, { title, body, link }) }),
  }).then((r) => { if (!r.ok) console.error('[mail] ส่งอีเมลไม่สำเร็จ', r.status); }).catch((e) => console.error('[mail]', e.message));
  c.ctx.waitUntil(send);
}
