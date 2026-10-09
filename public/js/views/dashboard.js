import {
  html, icon, $, mount, api, store, isStaff, roleTags, emptyState, errorState,
  docNo, revText, statusPill, fmtAgo, fmtDate, TYPE,
} from '../core.js';

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'อรุณสวัสดิ์' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
};

export function requestItem(r, { showRequester = false } = {}) {
  const t = TYPE[r.type];
  return html`<li><a class="list-item" href="#/requests/${r.id}">
    <span class="li-icon t-${r.type}" aria-hidden="true">${icon(t.icon)}</span>
    <span class="li-main">
      <span class="li-top">${docNo(r.docNo)}<span class="xs muted mono">${r.reqNo}</span></span>
      <span class="li-title">${r.title}</span>
      <span class="li-meta">
        <span>${t.label}</span>
        ${r.type === 'REVISE' ? html`<span class="mono">${revText(r.fromRev)} → ${revText(r.toRev)}</span>` : ''}
        ${showRequester ? html`<span>${icon('user', 'ic-sm')} ${r.requester.name}</span>` : ''}
        <span>${fmtAgo(r.updatedAt)}</span>
        <span class="only-mobile-inline">${statusPill(r.status)}</span>
      </span>
    </span>
    <span class="li-end"><span class="pill-wrap">${statusPill(r.status)}</span></span>
    <span class="li-chev">${icon('chevron-right')}</span>
  </a></li>`;
}

const FEED = {
  NEW: ['file-plus', 'ประกาศใช้ใหม่', 'ok'],
  REVISE: ['file-pen', 'Up Rev.', 'info'],
  CANCEL: ['file-x', 'ยกเลิกใช้', 'bad'],
};

export default async function dashboardView({ el, isCurrent }) {
  const u = store.user;
  const staff = isStaff();
  const firstName = u.name.split(/\s+/)[0];

  mount(el, html`
    <section class="hero" aria-labelledby="hello">
      <div class="motif" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="hero-inner">
        <p class="eyebrow">${greet()} · ${fmtDate(new Date().toISOString())}</p>
        <h1 id="hello" style="margin-top:4px">คุณ${firstName}</h1>
        <div class="row wrap" style="gap:6px;margin-top:10px">
          <span class="tag role-tag mono">${u.empId}</span>${u.department ? html`<span class="tag role-tag">${icon('building-2', 'ic-sm')}${u.department}</span>` : ''}
          ${roleTags(u.roles, 'role-tag')}
        </div>
        <nav class="quick-actions" aria-label="ยื่นคำขอด่วน">
          ${['NEW', 'REVISE', 'CANCEL'].map((k) => html`
            <a class="qa" href="#/requests/new?type=${k}">
              <span class="qa-icon">${icon(TYPE[k].icon)}</span>
              <span><b>${TYPE[k].label}</b><span>${k === 'NEW' ? 'ขอเลขเอกสารใหม่' : k === 'REVISE' ? 'ขึ้น Revision ใหม่' : 'ยกเลิกการใช้เอกสาร'}</span></span>
              ${icon('chevron-right', 'ic-go')}
            </a>`)}
        </nav>
      </div>
    </section>
    <div id="dash-body" style="margin-top:22px">
      <div class="kpis">${Array.from({ length: 4 }, () => html`<div class="kpi"><div class="skeleton" style="width:36px;height:36px"></div><div class="skeleton sk-line" style="width:50%;height:26px"></div><div class="skeleton sk-line" style="width:70%"></div></div>`)}</div>
    </div>`);

  const body = $('#dash-body', el);

  async function load() {
    let s;
    try {
      s = await api('/meta/stats');
    } catch (err) {
      mount(body, errorState(err));
      $('[data-retry]', body)?.addEventListener('click', load);
      return;
    }
    if (!isCurrent()) return;
    const max = Math.max(1, ...s.byCategory.map((c) => c.count));

    mount(body, html`
      <div class="kpis">
        <a class="kpi" href="#/library">
          <span class="kpi-icon">${icon('files')}</span>
          <span class="kpi-value">${s.activeDocs}</span><span class="kpi-label">เอกสารที่ใช้งานอยู่</span>
        </a>
        ${staff ? html`
          <a class="kpi ${s.tasks ? 'alert' : ''}" href="#/tasks">
            <span class="kpi-icon">${icon('inbox')}</span>
            <span class="kpi-value">${s.tasks}</span><span class="kpi-label">งานรอฉันดำเนินการ</span>
          </a>` : ''}
        <a class="kpi" href="#/requests?status=ACTIVE">
          <span class="kpi-icon">${icon('clock')}</span>
          <span class="kpi-value">${s.myActive}</span><span class="kpi-label">คำขอของฉันที่กำลังดำเนินการ</span>
        </a>
        <div class="kpi">
          <span class="kpi-icon">${icon('trending-up')}</span>
          <span class="kpi-value">${s.publishedThisMonth}</span><span class="kpi-label">คำขอที่ประกาศใช้เดือนนี้</span>
        </div>
        ${!staff ? html`<a class="kpi" href="#/requests/new">
          <span class="kpi-icon">${icon('plus')}</span>
          <span class="kpi-value" style="font-size:18px;padding-top:8px">ยื่นคำขอ</span><span class="kpi-label">ลงทะเบียน / แก้ไข / ยกเลิก</span>
        </a>` : ''}
      </div>

      <div class="grid-2" style="margin-top:20px">
        <div class="stack">
          ${staff ? html`
          <section class="card" aria-labelledby="h-tasks">
            <div class="card-head"><h2 id="h-tasks">งานรอดำเนินการ</h2><a class="btn btn-ghost btn-sm" href="#/tasks">ดูทั้งหมด ${icon('chevron-right', 'ic-sm')}</a></div>
            ${s.taskList.length
              ? html`<ul class="list" style="margin-top:10px">${s.taskList.map((r) => requestItem(r, { showRequester: true }))}</ul>`
              : emptyState({ iconName: 'check-check', title: 'ไม่มีงานค้าง', text: 'เมื่อมีคำขอที่ต้องตรวจสอบ อนุมัติ หรือประกาศใช้ จะแสดงที่นี่' })}
          </section>` : ''}
          <section class="card" aria-labelledby="h-mine">
            <div class="card-head"><h2 id="h-mine">คำขอล่าสุดของฉัน</h2><a class="btn btn-ghost btn-sm" href="#/requests">ดูทั้งหมด ${icon('chevron-right', 'ic-sm')}</a></div>
            ${s.myRecent.length
              ? html`<ul class="list" style="margin-top:10px">${s.myRecent.map((r) => requestItem(r))}</ul>`
              : emptyState({ iconName: 'clipboard-list', title: 'ยังไม่มีคำขอ', text: 'เริ่มยื่นคำขอลงทะเบียน แก้ไข หรือยกเลิกเอกสารได้เลย', action: html`<a class="btn btn-primary" href="#/requests/new">${icon('plus')}ยื่นคำขอเอกสาร</a>` })}
          </section>
        </div>

        <div class="stack">
          <section class="card" aria-labelledby="h-feed">
            <div class="card-head"><h2 id="h-feed">ความเคลื่อนไหวเอกสาร</h2></div>
            <div class="card-body">
              ${s.feed.length ? html`<ul class="timeline">${s.feed.map((f) => html`<li>
                <span class="tl-dot ${FEED[f.kind][2]}">${icon(FEED[f.kind][0])}</span>
                <div class="tl-body">
                  <div class="row wrap" style="gap:6px">${docNo(f.docNo)}<span class="xs muted">${FEED[f.kind][1]} ${revText(f.rev)}</span></div>
                  <div class="small" style="margin-top:4px;line-height:1.45">${f.title}</div>
                  <div class="xs muted" style="margin-top:2px">${f.dcnNo ? html`<span class="mono">${f.dcnNo}</span> · ` : ''}${fmtAgo(f.at)}</div>
                </div></li>`)}</ul>`
                : html`<p class="small muted">ยังไม่มีการประกาศใช้เอกสารผ่านระบบ</p>`}
            </div>
          </section>
          <section class="card" aria-labelledby="h-cats">
            <div class="card-head"><h2 id="h-cats">เอกสารตามหมวด</h2></div>
            <div class="card-body">
              <div class="bars">
                ${s.byCategory.map((c) => html`<a class="bar-row" href="#/library?cat=${c.code}" aria-label="${c.code} ${c.name}: ${c.count} ฉบับ">
                  <span class="mono">${c.code}</span>
                  <span class="bar-track"><span class="bar-fill" style="width:${Math.round((c.count / max) * 100)}%"></span></span>
                  <span class="n">${c.count}</span>
                </a>`)}
              </div>
            </div>
          </section>
        </div>
      </div>`);
  }
  await load();
}
