import { html, icon, $, $$, mount, api, emptyState, errorState, fmtAgo, updateBadges } from '../core.js';

const NOTIF_ICON = { review: 'clock', approval: 'stamp', publish: 'hash', success: 'circle-check', danger: 'circle-x', info: 'info' };

export function notifItem(n) {
  return html`<a class="notif ${n.read ? '' : 'unread'}" href="${n.link || '#/notifications'}" data-notif="${n.id}">
    <span class="n-dot k-${n.kind}">${icon(NOTIF_ICON[n.kind] || 'bell', 'ic-sm')}</span>
    <span class="grow"><b>${n.title}</b><p>${n.body}</p><time>${fmtAgo(n.at)}</time></span>
    ${n.read ? '' : html`<span class="unread-dot" aria-label="ยังไม่อ่าน"></span>`}
  </a>`;
}

export default async function notificationsView({ el, isCurrent }) {
  mount(el, html`
    <div class="page-head">
      <div><h1>การแจ้งเตือน</h1><p>คำขอที่ต้องดำเนินการและความคืบหน้าของคำขอของคุณ</p></div>
      <button class="btn" id="read-all">${icon('check-check')}อ่านทั้งหมด</button>
    </div>
    <div id="n-list"></div>`);
  const list = $('#n-list', el);

  async function load() {
    try {
      const { notifications } = await api('/notifications');
      if (!isCurrent()) return;
      mount(list, notifications.length
        ? html`<div class="card" style="overflow:hidden">${notifications.map(notifItem)}</div>`
        : html`<div class="card">${emptyState({ iconName: 'bell', title: 'ยังไม่มีการแจ้งเตือน', text: 'เมื่อมีคำขอที่เกี่ยวข้องกับคุณ ระบบจะแจ้งที่นี่' })}</div>`);
    } catch (err) {
      mount(list, errorState(err));
    }
  }

  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-notif]');
    if (a) api(`/notifications/${a.dataset.notif}/read`, { method: 'POST' }).then(updateBadges).catch(() => {});
    if (e.target.closest('#read-all')) {
      await api('/notifications/read-all', { method: 'POST' }).catch(() => {});
      $$('.notif.unread', el).forEach((n) => { n.classList.remove('unread'); n.querySelector('.unread-dot')?.remove(); });
      updateBadges();
    }
    if (e.target.closest('[data-retry]')) load();
  });
  await load();
}
