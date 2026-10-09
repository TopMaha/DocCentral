export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export async function readJson(req) {
  if (!(req.headers.get('Content-Type') || '').includes('application/json')) return {};
  try {
    return (await req.json()) || {};
  } catch {
    throw new HttpError(400, 'ข้อมูลที่ส่งมาไม่ถูกต้อง');
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAge, secure = true } = {}) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    maxAge != null ? `Max-Age=${maxAge}` : '',
  ].filter(Boolean).join('; ');
}

/** ค่า config จาก wrangler vars */
export function cfg(env) {
  const bool = (v, d) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
  return {
    publicLibrary: bool(env.PUBLIC_LIBRARY, true),
    docPrefix: env.DOC_PREFIX || 'TH',
    seqDigits: Number(env.SEQ_DIGITS || 3),
    revDigits: Number(env.REV_DIGITS || 2),
    maxUploadMb: Number(env.MAX_UPLOAD_MB || 50),
    sessionHours: Number(env.SESSION_HOURS || 12),
    rememberDays: Number(env.REMEMBER_DAYS || 30),
    appUrl: (env.APP_URL || '').replace(/\/$/, ''),
    mailFrom: env.MAIL_FROM || '',
    folders: {
      pending: env.FOLDER_PENDING || '00_Pending',
      controlled: env.FOLDER_CONTROLLED || '01_Controlled',
      obsolete: env.FOLDER_OBSOLETE || '02_Obsolete',
    },
  };
}

export const ALLOWED_EXT = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.xlsm', '.ppt', '.pptx',
  '.vsd', '.vsdx', '.txt', '.csv', '.jpg', '.jpeg', '.png', '.zip', '.dwg', '.dxf',
];

// ---------- D1 helpers ----------
const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
export const stmt = (env, sql, ...p) => env.DB.prepare(sql).bind(...clean(p));
export const one = (env, sql, ...p) => stmt(env, sql, ...p).first();
export const all = async (env, sql, ...p) => (await stmt(env, sql, ...p).all()).results;
export const run = (env, sql, ...p) => stmt(env, sql, ...p).run();

// ---------- เวลาไทย (Asia/Bangkok ไม่มี DST) ----------
export const TZ = 'Asia/Bangkok';
export const TZ_SQL = '+7 hours';
/** วันที่ปัจจุบันตามเวลาไทย รูปแบบ YYYY-MM-DD */
export const localDate = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
