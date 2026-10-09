// ---------------------------------------------------------------------------
// Templating: html`` escape ค่าทุกตัวอัตโนมัติ ยกเว้นค่าที่มาจาก html`` / raw()
// ---------------------------------------------------------------------------
class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => new Safe(String(s));

function val(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += val(values[i]) + strings[i + 1];
  return new Safe(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function mount(el, tpl) {
  el.innerHTML = String(tpl);
  return el;
}

export const icon = (name, cls = '') =>
  raw(`<svg class="ic ${cls}" aria-hidden="true" focusable="false"><use href="/icons.svg#i-${name}"></use></svg>`);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const listeners = new Set();
export const store = {
  user: null,
  settings: { publicLibrary: true, emailEnabled: false, maxUploadMb: 50 },
  badge: { unread: 0, tasks: 0 },
  categories: [],
};
export const onStore = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function setStore(patch) {
  Object.assign(store, patch);
  for (const fn of listeners) fn(store);
}

export const hasRole = (role) => {
  const r = store.user?.roles || [];
  return role === 'dcc' ? r.includes('dcc') || r.includes('admin') : r.includes(role);
};
export const isStaff = () => hasRole('admin') || hasRole('approver') || hasRole('dcc');

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function handleAuthErrors(err) {
  if (err.code === 'UNAUTHENTICATED' && store.user) {
    setStore({ user: null });
    location.hash = `#/login?next=${encodeURIComponent(location.hash.slice(1))}`;
  } else if (err.code === 'MUST_CHANGE_PASSWORD') {
    location.hash = '#/change-password';
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: { 'X-Requested-With': 'dcc' }, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch {
    throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบเครือข่ายแล้วลองใหม่', 0, 'NETWORK');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(data.error || `เกิดข้อผิดพลาด (${res.status})`, res.status, data.code);
    handleAuthErrors(err);
    throw err;
  }
  return data;
}

/** อัปโหลดพร้อมแสดงความคืบหน้า */
export function apiUpload(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.setRequestHeader('X-Requested-With', 'dcc');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      const data = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        const err = new ApiError(data.error || `เกิดข้อผิดพลาด (${xhr.status})`, xhr.status, data.code);
        handleAuthErrors(err);
        reject(err);
      }
    };
    xhr.onerror = () => reject(new ApiError('อัปโหลดไม่สำเร็จ ตรวจสอบเครือข่ายแล้วลองใหม่', 0, 'NETWORK'));
    xhr.send(form);
  });
}

/** จำนวนแจ้งเตือนที่ยังไม่อ่าน + งานรอดำเนินการ (ใช้กับ badge) */
export async function updateBadges() {
  if (!store.user || store.user.mustChangePw) return;
  try {
    setStore({ badge: await api('/notifications/badge') });
  } catch { /* เงียบไว้ */ }
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
export function toast(message, type = 'ok') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = String(html`${icon(type === 'err' ? 'circle-alert' : 'circle-check')}<div>${message}</div>`);
  box.append(el);
  setTimeout(() => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }, type === 'err' ? 6000 : 4000);
}

// ---------------------------------------------------------------------------
// Modal (native <dialog>: มี focus trap + ปิดด้วย Esc)
// ---------------------------------------------------------------------------
export function openModal({ title, body, foot = '', wide = false, onClose } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal${wide ? ' wide' : ''}`;
  dlg.setAttribute('aria-labelledby', 'modal-title');
  dlg.innerHTML = String(html`
    <div class="modal-head">
      <h2 id="modal-title">${title}</h2>
      <button type="button" class="icon-btn" data-close aria-label="ปิดหน้าต่าง">${icon('x')}</button>
    </div>
    <div class="modal-body">${body}</div>
    ${foot ? html`<div class="modal-foot">${foot}</div>` : ''}
  `);
  document.body.append(dlg);
  const close = (result) => {
    if (!dlg.open) return;
    dlg.close();
    dlg.remove();
    onClose?.(result);
  };
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    else if (e.target === dlg) {
      // คลิกพื้นหลัง (นอกกล่อง) เพื่อปิด
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    }
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.showModal();
  return { el: dlg, close };
}

/** ยืนยันก่อนทำรายการ — คืนค่า false หรือ { value } */
export function confirmDialog({ title, message = '', confirmText = 'ยืนยัน', danger = false, input = null }) {
  return new Promise((resolve) => {
    let done = false;
    const { el, close } = openModal({
      title,
      body: html`
        <form id="cf-form" class="stack" novalidate>
          ${message ? html`<div class="muted" style="color:var(--ink-2)">${message}</div>` : ''}
          ${input ? html`
            <div class="field">
              <label class="label" for="cf-input">${input.label}${input.required ? html`<span class="req">*</span>` : ''}</label>
              <textarea class="textarea" id="cf-input" rows="3" placeholder="${input.placeholder || ''}" style="min-height:96px"></textarea>
              <div class="error-text" id="cf-err" role="alert" hidden></div>
            </div>` : ''}
        </form>`,
      foot: html`
        <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
        <button type="submit" form="cf-form" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}">${confirmText}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    const ta = $('#cf-input', el);
    (ta || $('.modal-foot .btn:last-child', el)).focus();
    $('#cf-form', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const value = ta ? ta.value.trim() : '';
      if (input?.required && !value) {
        const err = $('#cf-err', el);
        err.hidden = false;
        err.innerHTML = String(html`${icon('circle-alert', 'ic-sm')} กรุณากรอก${input.label}`);
        ta.setAttribute('aria-invalid', 'true');
        ta.focus();
        return;
      }
      done = true;
      resolve({ value });
      close();
    });
  });
}

/** ปุ่มแสดง spinner ระหว่างรอ */
export async function withBusy(btn, fn) {
  if (!btn || btn.disabled) return undefined;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${esc(btn.dataset.busy || 'กำลังดำเนินการ…')}</span>`;
  try {
    return await fn();
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.innerHTML = original;
    }
  }
}

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------
const toDate = (s) => {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
  return new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
};
const dFmt = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' });
const dtFmt = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const rtf = new Intl.RelativeTimeFormat('th', { numeric: 'auto' });

export const fmtDate = (s) => (s ? dFmt.format(toDate(s)) : '—');
export const fmtDateTime = (s) => (s ? dtFmt.format(toDate(s)) : '—');
export function fmtAgo(s) {
  const d = toDate(s);
  if (!d) return '';
  const sec = Math.round((d - Date.now()) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return 'เมื่อสักครู่';
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(sec / 86400), 'day');
  return fmtDate(s);
}
export function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export const revText = (n) => (n == null ? '—' : `Rev.${String(n).padStart(2, '0')}`);
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** อักษรย่อชื่อ: ข้ามสระนำหน้าภาษาไทย (เ แ โ ใ ไ) */
export function initials(name = '') {
  const pick = (w) => (w.match(/[ก-ฮA-Za-z]/) || [''])[0].toUpperCase();
  const parts = String(name).trim().split(/\s+/);
  return (pick(parts[0] || '') + pick(parts[1] || '')) || '?';
}

// ---------------------------------------------------------------------------
// Domain labels
// ---------------------------------------------------------------------------
export const TYPE = {
  NEW: { label: 'ลงทะเบียนใหม่', icon: 'file-plus', desc: 'ขอเลขเอกสารใหม่ ระบบจะ run เลขต่อจากเอกสารที่มีอยู่' },
  REVISE: { label: 'แก้ไขเอกสาร (Up Rev.)', icon: 'file-pen', desc: 'เลือกเอกสารเดิม แล้วขึ้น Revision ใหม่' },
  CANCEL: { label: 'ยกเลิกเอกสาร', icon: 'file-x', desc: 'ยกเลิกการใช้เอกสาร ย้ายไปเก็บที่ Obsolete' },
};

export const STATUS = {
  PENDING_REVIEW: { label: 'รอ Admin ตรวจสอบ', cls: 'pill-review', icon: 'clock' },
  PENDING_APPROVAL: { label: 'รออนุมัติ', cls: 'pill-approval', icon: 'stamp' },
  APPROVED: { label: 'อนุมัติแล้ว · รอประกาศใช้', cls: 'pill-approved', icon: 'badge-check' },
  PUBLISHED: { label: 'ประกาศใช้แล้ว', cls: 'pill-published', icon: 'circle-check' },
  REJECTED: { label: 'ไม่อนุมัติ', cls: 'pill-rejected', icon: 'circle-x' },
  WITHDRAWN: { label: 'ยกเลิกคำขอ', cls: 'pill-withdrawn', icon: 'undo-2' },
};

export const ROLE = {
  admin: { label: 'Admin', desc: 'จัดการผู้ใช้ ตรวจสอบคำขอและส่งต่อผู้อนุมัติ', cls: 'tag-amber' },
  approver: { label: 'ผู้อนุมัติ', desc: 'อนุมัติ / ไม่อนุมัติคำขอที่ได้รับมอบหมาย', cls: 'tag-blue' },
  dcc: { label: 'DCC', desc: 'Run DCN No. ประกาศใช้ และนำเข้าเอกสารเดิม', cls: 'tag-green' },
};

export const statusPill = (s) => {
  const m = STATUS[s] || { label: s, cls: 'pill-withdrawn', icon: 'info' };
  return html`<span class="pill ${m.cls}">${icon(m.icon)}${m.label}</span>`;
};
export const docNo = (no, extra = '') => html`<span class="docno ${extra}">${no}</span>`;
export const fileExt = (ext, sm = false) => html`<span class="file-ext ${sm ? 'sm' : ''}" data-ext="${ext}" aria-hidden="true">${ext}</span>`;
export const roleTags = (roles = [], extra = '') => roles.map((r) => html`<span class="tag ${ROLE[r]?.cls || ''} ${extra}">${ROLE[r]?.label || r}</span>`);

export function emptyState({ iconName = 'file-search', title, text = '', action = '' }) {
  return html`<div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h3>${title}</h3>
    ${text ? html`<p>${text}</p>` : ''}
    ${action}
  </div>`;
}

export const skeletonList = (n = 4) => html`<div class="card" aria-busy="true" aria-label="กำลังโหลด">
  ${Array.from({ length: n }, () => html`<div class="list-item" style="border-top:1px solid var(--line)">
    <div class="skeleton" style="width:42px;height:42px;border-radius:12px"></div>
    <div class="grow"><div class="skeleton sk-line" style="width:40%"></div><div class="skeleton sk-line" style="width:75%"></div></div>
  </div>`)}
</div>`;

export function errorState(err, retryLabel = 'ลองใหม่') {
  return html`<div class="card">${emptyState({
    iconName: 'triangle-alert',
    title: 'โหลดข้อมูลไม่สำเร็จ',
    text: err?.message || 'เกิดข้อผิดพลาด',
    action: html`<button class="btn btn-soft" data-retry>${icon('refresh-cw')}${retryLabel}</button>`,
  })}</div>`;
}

export function parseQuery(qs = '') {
  return Object.fromEntries(new URLSearchParams(qs));
}
