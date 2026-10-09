import {
  html, icon, $, $$, mount, store, setStore, onStore, api, hasRole, isStaff,
  initials, roleTags, emptyState, parseQuery, toast, updateBadges,
} from './core.js';
import loginView from './views/login.js';
import changePasswordView from './views/change-password.js';
import libraryView from './views/library.js';
import dashboardView from './views/dashboard.js';
import requestNewView from './views/request-new.js';
import requestsView from './views/requests.js';
import requestDetailView from './views/request-detail.js';
import usersView from './views/users.js';
import importView from './views/import.js';
import profileView from './views/profile.js';
import notificationsView, { notifItem } from './views/notifications.js';

const routes = [
  { path: '/login', view: loginView, shell: 'bare', guestOnly: true, title: 'เข้าสู่ระบบ' },
  { path: '/change-password', view: changePasswordView, shell: 'bare', partial: true, title: 'ตั้งรหัสผ่านใหม่' },
  { path: '/library', view: libraryView, public: true, title: 'คลังเอกสาร', nav: 'library' },
  { path: '/dashboard', view: dashboardView, title: 'หน้าหลัก', nav: 'dashboard' },
  { path: '/requests/new', view: requestNewView, title: 'ยื่นคำขอเอกสาร', nav: 'new' },
  { path: '/requests/:id', view: requestDetailView, title: 'รายละเอียดคำขอ', nav: 'requests' },
  { path: '/requests', view: requestsView, title: 'คำขอเอกสาร', nav: 'requests' },
  { path: '/tasks', view: (ctx) => requestsView({ ...ctx, query: { scope: 'tasks', ...ctx.query } }), title: 'งานรอดำเนินการ', nav: 'tasks' },
  { path: '/admin/users', view: usersView, role: 'admin', title: 'จัดการผู้ใช้', nav: 'users' },
  { path: '/admin/import', view: importView, role: 'dcc', title: 'นำเข้าเอกสารเดิม', nav: 'import' },
  { path: '/profile', view: profileView, title: 'โปรไฟล์ของฉัน', nav: 'profile' },
  { path: '/notifications', view: notificationsView, title: 'การแจ้งเตือน', nav: 'notifications' },
];

function match(path) {
  for (const r of routes) {
    const keys = [];
    const re = new RegExp(`^${r.path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    const m = path.match(re);
    if (m) return { route: r, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export const navigate = (hash) => { location.hash = hash; };
const homeHash = () => (store.user ? '#/dashboard' : store.settings.publicLibrary ? '#/library' : '#/login');

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
const app = $('#app');
let shellKind = null;
let cleanup = null;

function navLinks() {
  const items = [
    { key: 'dashboard', href: '#/dashboard', icon: 'layout-dashboard', label: 'หน้าหลัก' },
    { key: 'library', href: '#/library', icon: 'book-open', label: 'คลังเอกสาร' },
    { key: 'requests', href: '#/requests', icon: 'clipboard-list', label: 'คำขอของฉัน' },
  ];
  if (isStaff()) items.push({ key: 'tasks', href: '#/tasks', icon: 'inbox', label: 'งานรอดำเนินการ', badge: 'tasks' });
  return items;
}

function adminLinks() {
  const items = [];
  if (hasRole('admin')) items.push({ key: 'users', href: '#/admin/users', icon: 'users', label: 'จัดการผู้ใช้' });
  if (hasRole('dcc')) items.push({ key: 'import', href: '#/admin/import', icon: 'folder-input', label: 'นำเข้าเอกสารเดิม' });
  return items;
}

const navItem = (i) => html`<a class="nav-item" href="${i.href}" data-nav="${i.key}">
  ${icon(i.icon)}<span>${i.label}</span>${i.badge ? html`<span class="badge" data-badge="${i.badge}" hidden></span>` : ''}
</a>`;

function appShell() {
  const u = store.user;
  const admin = adminLinks();
  return html`
  <div class="shell">
    <aside class="sidebar" aria-label="เมนูหลัก">
      <a class="sidebar-logo" href="#/dashboard" aria-label="Wesco DCC หน้าหลัก">
        <img src="/assets/wesco-logo.png" alt="Wesco" width="60" height="46">
        <span class="brand-text"><b>Document Control</b><span>ระบบควบคุมเอกสาร</span></span>
      </a>
      <div class="sidebar-cta">
        <a class="btn btn-primary btn-block" href="#/requests/new">${icon('plus')}ยื่นคำขอเอกสาร</a>
      </div>
      <nav>
        ${navLinks().map(navItem)}
        ${admin.length ? html`<div class="nav-group"><div class="nav-group-title">ผู้ดูแลระบบ</div>${admin.map(navItem)}</div>` : ''}
      </nav>
      <div class="sidebar-user">
        <span class="avatar sm" aria-hidden="true">${initials(u.name)}</span>
        <a class="who" href="#/profile" style="text-decoration:none;color:inherit">
          <b>${u.name}</b><span class="mono">${u.empId}</span>
        </a>
        <button class="icon-btn" data-logout aria-label="ออกจากระบบ" title="ออกจากระบบ">${icon('log-out')}</button>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <a class="topbar-mark" href="#/dashboard" aria-label="หน้าหลัก"><img src="/assets/wesco-mark.png" alt="Wesco" width="45" height="26"></a>
        <div class="topbar-title" id="page-title"></div>
        <div class="topbar-actions">
          <button class="icon-btn" id="bell" aria-label="การแจ้งเตือน" aria-haspopup="dialog" aria-expanded="false">
            ${icon('bell')}<span class="badge" data-badge="unread" hidden></span>
          </button>
          <button class="icon-btn" id="me-btn" aria-label="เมนูผู้ใช้" aria-haspopup="menu" aria-expanded="false">
            <span class="avatar" aria-hidden="true">${initials(u.name)}</span>
          </button>
        </div>
      </header>
      <main id="view" class="content" tabindex="-1"></main>
    </div>

    <nav class="bottomnav" aria-label="เมนูหลัก">
      <a class="bn-item" href="#/dashboard" data-nav="dashboard">${icon('layout-dashboard')}<span>หน้าหลัก</span></a>
      <a class="bn-item" href="#/library" data-nav="library">${icon('book-open')}<span>เอกสาร</span></a>
      <div class="bn-fab"><a href="#/requests/new" aria-label="ยื่นคำขอเอกสาร" data-nav="new">${icon('plus')}</a></div>
      <a class="bn-item" href="#/requests" data-nav="requests">${icon('clipboard-list')}<span>คำขอ</span></a>
      ${isStaff()
        ? html`<a class="bn-item" href="#/tasks" data-nav="tasks">${icon('inbox')}<span>งานรอ</span><span class="badge" data-badge="tasks" hidden></span></a>`
        : html`<a class="bn-item" href="#/profile" data-nav="profile">${icon('circle-user')}<span>ฉัน</span></a>`}
    </nav>
  </div>`;
}

function guestShell() {
  return html`
  <header class="guest-header">
    <a class="brand" href="#/library" aria-label="Wesco DCC">
      <img src="/assets/wesco-logo.png" alt="Wesco" width="52" height="40">
      <span class="brand-text"><b>Document Control</b><span>ระบบควบคุมเอกสาร</span></span>
    </a>
    <a class="btn btn-primary" href="#/login">${icon('log-in')}เข้าสู่ระบบ</a>
  </header>
  <main id="view" class="content" tabindex="-1"></main>`;
}

function ensureShell(kind) {
  if (shellKind === kind && (kind !== 'app' || $('.sidebar'))) return;
  shellKind = kind;
  closePopover();
  if (kind === 'bare') mount(app, html`<main id="view" tabindex="-1"></main>`);
  else if (kind === 'guest') mount(app, guestShell());
  else {
    mount(app, appShell());
    wireAppShell();
    updateBadges();
  }
}

function setActiveNav(key, title) {
  for (const a of $$('[data-nav]')) {
    const on = a.dataset.nav === key;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const t = $('#page-title');
  if (t) t.textContent = title || '';
  document.title = `${title ? `${title} · ` : ''}Wesco DCC`;
}

// ---------------------------------------------------------------------------
// Popovers: การแจ้งเตือน + เมนูผู้ใช้
// ---------------------------------------------------------------------------
let popover = null;
function closePopover() {
  if (!popover) return;
  popover.el.remove();
  popover.trigger?.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', popover.outside, true);
  document.removeEventListener('keydown', popover.esc);
  popover = null;
}

function openPopover(trigger, content, label) {
  closePopover();
  const el = document.createElement('div');
  el.className = 'popover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', label);
  el.innerHTML = String(content);
  document.body.append(el);
  trigger.setAttribute('aria-expanded', 'true');
  const outside = (e) => { if (!el.contains(e.target) && !trigger.contains(e.target)) closePopover(); };
  const esc = (e) => { if (e.key === 'Escape') { closePopover(); trigger.focus(); } };
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', esc);
  popover = { el, trigger, outside, esc };
  return el;
}

async function showNotifications(trigger) {
  if (popover?.trigger === trigger) { closePopover(); return; }
  if (window.matchMedia('(max-width: 639px)').matches) { navigate('#/notifications'); return; }
  const el = openPopover(trigger, html`
    <div class="popover-head"><h3>การแจ้งเตือน</h3>
      <button class="btn btn-ghost btn-sm" data-read-all>${icon('check-check', 'ic-sm')}อ่านทั้งหมด</button></div>
    <div class="popover-body" id="notif-body"><div class="empty"><span class="spinner" style="width:24px;height:24px;color:var(--green-700)"></span></div></div>
    <div style="padding:8px;border-top:1px solid var(--line)"><a class="btn btn-ghost btn-block btn-sm" href="#/notifications">ดูทั้งหมด</a></div>`, 'การแจ้งเตือน');
  try {
    const { notifications } = await api('/notifications');
    const body = $('#notif-body', el);
    if (!body) return;
    mount(body, notifications.length
      ? html`${notifications.slice(0, 12).map(notifItem)}`
      : emptyState({ iconName: 'bell', title: 'ยังไม่มีการแจ้งเตือน', text: 'เมื่อมีคำขอที่เกี่ยวข้องกับคุณ ระบบจะแจ้งที่นี่' }));
  } catch (err) {
    toast(err.message, 'err');
  }
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-notif]');
    if (a) {
      api(`/notifications/${a.dataset.notif}/read`, { method: 'POST' }).then(updateBadges).catch(() => {});
      closePopover();
    }
    if (e.target.closest('[data-read-all]')) {
      await api('/notifications/read-all', { method: 'POST' }).catch(() => {});
      $$('.notif.unread', el).forEach((n) => { n.classList.remove('unread'); n.querySelector('.unread-dot')?.remove(); });
      updateBadges();
    }
  });
}

function showUserMenu(trigger) {
  if (popover?.trigger === trigger) { closePopover(); return; }
  const u = store.user;
  const admin = adminLinks();
  const el = openPopover(trigger, html`
    <div class="popover-head" style="justify-content:flex-start">
      <span class="avatar" aria-hidden="true">${initials(u.name)}</span>
      <div class="grow" style="line-height:1.4"><b style="display:block">${u.name}</b>
        <span class="xs muted mono">${u.empId}</span>${u.department ? html`<span class="xs muted"> · ${u.department}</span>` : ''}
        <div class="row wrap" style="gap:4px;margin-top:4px">${roleTags(u.roles)}</div></div>
    </div>
    <ul class="menu-list" role="menu">
      <li><a role="menuitem" href="#/profile">${icon('user-round')}โปรไฟล์และรหัสผ่าน</a></li>
      <li><a role="menuitem" href="#/notifications">${icon('bell')}การแจ้งเตือนทั้งหมด</a></li>
      ${admin.map((i) => html`<li><a role="menuitem" href="${i.href}">${icon(i.icon)}${i.label}</a></li>`)}
      <li class="menu-sep" role="separator"></li>
      <li><button role="menuitem" class="danger" data-logout>${icon('log-out')}ออกจากระบบ</button></li>
    </ul>`, 'เมนูผู้ใช้');
  el.addEventListener('click', (e) => { if (e.target.closest('a')) closePopover(); });
}

async function logout() {
  closePopover();
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  setStore({ user: null });
  toast('ออกจากระบบแล้ว');
  navigate(store.settings.publicLibrary ? '#/library' : '#/login');
}

function wireAppShell() {
  $('#bell').addEventListener('click', (e) => showNotifications(e.currentTarget));
  $('#me-btn').addEventListener('click', (e) => showUserMenu(e.currentTarget));
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-logout]')) logout();
  const skip = e.target.closest('.skip-link');
  if (skip) { e.preventDefault(); $('#view')?.focus(); }
});

// ---------------------------------------------------------------------------
// Badges (poll ทุก 30 วินาที)
// ---------------------------------------------------------------------------
onStore((s) => {
  for (const el of $$('[data-badge]')) {
    const n = s.badge[el.dataset.badge] || 0;
    el.hidden = !n;
    el.textContent = n > 99 ? '99+' : String(n);
  }
  const bell = $('#bell');
  if (bell) bell.setAttribute('aria-label', s.badge.unread ? `การแจ้งเตือน ${s.badge.unread} รายการที่ยังไม่อ่าน` : 'การแจ้งเตือน');
});
setInterval(updateBadges, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateBadges(); });

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
let renderSeq = 0;
async function render() {
  const hash = location.hash || '';
  if (!hash.startsWith('#/')) { navigate(homeHash()); return; }
  const [pathPart, qs] = hash.slice(1).split('?');
  const found = match(pathPart);
  if (!found) { navigate(homeHash()); return; }
  const { route, params } = found;
  const query = parseQuery(qs);
  const u = store.user;

  // guards
  if (route.guestOnly && u) { navigate(u.mustChangePw ? '#/change-password' : query.next ? `#${query.next}` : '#/dashboard'); return; }
  if (!route.guestOnly && !(route.public && store.settings.publicLibrary)) {
    if (!u) { navigate(`#/login?next=${encodeURIComponent(hash.slice(1))}`); return; }
  }
  if (u?.mustChangePw && route.path !== '/change-password') { navigate('#/change-password'); return; }
  if (route.partial && !u) { navigate('#/login'); return; }
  if (route.role && !hasRole(route.role)) { toast('คุณไม่มีสิทธิ์เข้าหน้านี้', 'err'); navigate('#/dashboard'); return; }

  closePopover();
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;

  ensureShell(route.shell === 'bare' ? 'bare' : u ? 'app' : 'guest');
  setActiveNav(route.nav, route.title);
  const view = $('#view');
  const seq = ++renderSeq;
  view.innerHTML = '';
  window.scrollTo({ top: 0 });
  try {
    const result = await route.view({ el: view, params, query, navigate, isCurrent: () => seq === renderSeq });
    if (seq === renderSeq) cleanup = result;
  } catch (err) {
    console.error(err);
    if (seq === renderSeq) mount(view, html`<div class="card">${emptyState({ iconName: 'triangle-alert', title: 'เกิดข้อผิดพลาด', text: err.message })}</div>`);
  }
  if (document.activeElement === document.body) view.focus({ preventScroll: true });
  updateBadges();
}

window.addEventListener('hashchange', render);

async function boot() {
  try {
    const me = await api('/auth/me');
    setStore({ user: me.user, settings: me.settings });
  } catch (err) {
    mount(app, html`<div class="content">${emptyState({ iconName: 'triangle-alert', title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', text: err.message, action: html`<button class="btn btn-primary" data-reload>ลองใหม่</button>` })}</div>`);
    $('[data-reload]', app)?.addEventListener('click', () => location.reload());
    return;
  }
  render();
}


boot();
