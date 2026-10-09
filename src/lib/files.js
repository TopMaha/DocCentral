import { HttpError, cfg, ALLOWED_EXT } from './http.js';

// R2 ไม่มีโฟลเดอร์จริง — ใช้ prefix แทน "share folder"
//   00_Pending/2026/10/<random>.pdf              ไฟล์แนบของคำขอที่ยังไม่ประกาศใช้
//   01_Controlled/TH-QA/TH-QA-001_Rev01_xxx.pdf  ฉบับที่ใช้งาน
//   02_Obsolete/TH-QA/TH-QA-001_Rev00_xxx.pdf    ฉบับที่ถูกแทนที่/ยกเลิก

export const extOf = (name) => {
  const m = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
};
export const baseName = (key) => String(key).split('/').pop();

const MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
};
export const mimeFor = (name) => MIME[extOf(name)] || 'application/octet-stream';
/** เปิดดูในเบราว์เซอร์ได้เฉพาะ PDF/รูปภาพ ที่เหลือบังคับดาวน์โหลด */
export const canInline = (name) => ['.pdf', '.png', '.jpg', '.jpeg'].includes(extOf(name));

/** ตัดอักขระที่ Windows/Share folder ไม่รับ แต่เก็บภาษาไทยไว้ */
export function safeName(str, max = 80) {
  return String(str || '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, max)
    .trim();
}

export const revLabel = (env, rev) => String(rev).padStart(cfg(env).revDigits, '0');

export function publishedName(env, docNo, rev, title, ext) {
  const t = safeName(title, 60);
  return `${docNo}_Rev${revLabel(env, rev)}${t ? `_${t}` : ''}${ext.toLowerCase()}`;
}

export const controlledKey = (env, category, name) => `${cfg(env).folders.controlled}/${cfg(env).docPrefix}-${category}/${name}`;
export const obsoleteKey = (env, category, name) => `${cfg(env).folders.obsolete}/${cfg(env).docPrefix}-${category}/${name}`;

/** ตรวจไฟล์จาก multipart แล้วเก็บไว้ที่ 00_Pending */
export async function savePending(env, file) {
  if (!file || typeof file === 'string' || !file.size) return null;
  const { maxUploadMb, folders } = cfg(env);
  const ext = extOf(file.name);
  if (!ALLOWED_EXT.includes(ext)) {
    throw new HttpError(400, `ไม่รองรับไฟล์ชนิด ${ext || '(ไม่มีนามสกุล)'} — รองรับ: ${ALLOWED_EXT.join(' ')}`, 'BAD_FILE');
  }
  if (file.size > maxUploadMb * 1024 * 1024) throw new HttpError(400, `ไฟล์ใหญ่เกิน ${maxUploadMb} MB`, 'TOO_LARGE');
  const d = new Date();
  const rand = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = `${folders.pending}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${rand}${ext}`;
  const name = safeName(file.name, 150) || `file${ext}`;
  await env.FILES.put(key, file, {
    httpMetadata: { contentType: mimeFor(name) },
    customMetadata: { originalName: encodeURIComponent(name) },
  });
  return { key, name, size: file.size, mime: mimeFor(name) };
}

/** ย้ายไฟล์ใน R2 (copy + delete) ถ้าชื่อซ้ำจะต่อท้าย (2), (3) */
export async function moveObject(env, fromKey, toKey) {
  const obj = await env.FILES.get(fromKey);
  if (!obj) throw new HttpError(409, `ไม่พบไฟล์ ${baseName(fromKey)} ในที่จัดเก็บ`);
  let target = toKey;
  const ext = extOf(toKey);
  const stem = ext ? toKey.slice(0, -ext.length) : toKey;
  for (let i = 2; await env.FILES.head(target); i++) target = `${stem} (${i})${ext}`;
  await env.FILES.put(target, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata, customMetadata: obj.customMetadata });
  await env.FILES.delete(fromKey);
  return target;
}

/** Content-Disposition ที่รองรับชื่อไฟล์ภาษาไทย */
export function contentDisposition(fileName, inline = false) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function sendObject(env, key, downloadName, inline) {
  const obj = await env.FILES.get(key);
  if (!obj) throw new HttpError(404, 'ไม่พบไฟล์ในที่จัดเก็บ (อาจถูกย้ายหรือลบ)');
  const showInline = inline && canInline(downloadName);
  const headers = {
    'Content-Type': mimeFor(downloadName),
    'Content-Disposition': contentDisposition(downloadName, showInline),
    'Content-Length': String(obj.size),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    ETag: obj.httpEtag,
  };
  if (showInline) headers['Content-Security-Policy'] = 'sandbox';
  return new Response(obj.body, { headers });
}
