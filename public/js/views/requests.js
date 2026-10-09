import {
  html, icon, $, $$, mount, api, isStaff, emptyState, errorState, skeletonList,
} from '../core.js';
import { requestItem } from './dashboard.js';

const FILTERS = [
  ['', 'ทั้งหมด'],
  ['ACTIVE', 'กำลังดำเนินการ'],
  ['PUBLISHED', 'ประกาศใช้แล้ว'],
  ['REJECTED', 'ไม่อนุมัติ'],
  ['WITHDRAWN', 'ยกเลิกคำขอ'],
];

export default async function requestsView({ el, query, isCurrent }) {
  const staff = isStaff();
  const state = {
    scope: ['mine', 'tasks', 'all'].includes(query.scope) && (query.scope === 'mine' || staff) ? query.scope : 'mine',
    status: query.status || '',
    q: query.q || '',
  };
  const titles = {
    mine: ['คำขอของฉัน', 'ติดตามสถานะคำขอที่คุณยื่นไว้ทั้งหมด'],
    tasks: ['งานรอดำเนินการ', 'คำขอที่รอคุณตรวจสอบ อนุมัติ หรือประกาศใช้'],
    all: ['คำขอทั้งหมด', 'คำขอเอกสารทุกรายการในระบบ'],
  };

  mount(el, html`
    <div class="page-head">
      <div><h1 id="rq-title"></h1><p id="rq-sub"></p></div>
      <a class="btn btn-primary hide-mobile" href="#/requests/new">${icon('plus')}ยื่นคำขอเอกสาร</a>
    </div>
    ${staff ? html`<div class="tabs" role="tablist" aria-label="มุมมองคำขอ" style="margin-bottom:16px">
      <button class="tab" role="tab" data-scope="mine">${icon('user', 'ic-sm')}ของฉัน</button>
      <button class="tab" role="tab" data-scope="tasks">${icon('inbox', 'ic-sm')}รอฉันดำเนินการ<span class="badge" data-badge="tasks" hidden></span></button>
      <button class="tab" role="tab" data-scope="all">${icon('list-checks', 'ic-sm')}ทั้งหมด</button>
    </div>` : ''}
    <div class="toolbar">
      <div class="input-wrap search">${icon('search')}
        <label class="sr-only" for="rq-q">ค้นหาคำขอ</label>
        <input class="input" id="rq-q" type="search" placeholder="ค้นหาเลขคำขอ เลขที่เอกสาร ชื่อ หรือ DCN No." value="${state.q}" autocomplete="off">
      </div>
    </div>
    <div class="chips scroll-mobile" id="rq-filters" role="group" aria-label="กรองตามสถานะ" style="margin-bottom:16px"></div>
    <div id="rq-list" aria-live="polite"></div>`);

  const list = $('#rq-list', el);

  function syncHeader() {
    $('#rq-title', el).textContent = titles[state.scope][0];
    $('#rq-sub', el).textContent = titles[state.scope][1];
    $$('[data-scope]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.scope === state.scope)));
    const filters = $('#rq-filters', el);
    filters.hidden = state.scope === 'tasks';
    mount(filters, html`${FILTERS.map(([k, l]) => html`<button class="chip" data-status="${k}" aria-pressed="${state.status === k}">${l}</button>`)}`);
    const base = state.scope === 'tasks' ? '#/tasks' : '#/requests';
    const p = new URLSearchParams();
    if (state.scope === 'all') p.set('scope', 'all');
    if (state.status && state.scope !== 'tasks') p.set('status', state.status);
    if (state.q) p.set('q', state.q);
    history.replaceState(null, '', `${base}${p.toString() ? `?${p}` : ''}`);
  }

  let seq = 0;
  async function load() {
    const my = ++seq;
    mount(list, skeletonList(5));
    try {
      const p = new URLSearchParams({ scope: state.scope, status: state.scope === 'tasks' ? '' : state.status, q: state.q });
      const { requests } = await api(`/requests?${p}`);
      if (my !== seq || !isCurrent()) return;
      if (!requests.length) {
        const empty = state.scope === 'tasks'
          ? { iconName: 'check-check', title: 'ไม่มีงานค้าง เยี่ยมมาก!', text: 'คำขอที่ต้องตรวจสอบ อนุมัติ หรือประกาศใช้ จะแสดงที่นี่' }
          : state.q || state.status
            ? { iconName: 'file-search', title: 'ไม่พบคำขอที่ตรงเงื่อนไข', text: 'ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ' }
            : { iconName: 'clipboard-list', title: 'ยังไม่มีคำขอ', text: 'เริ่มยื่นคำขอลงทะเบียน แก้ไข หรือยกเลิกเอกสาร', action: html`<a class="btn btn-primary" href="#/requests/new">${icon('plus')}ยื่นคำขอเอกสาร</a>` };
        mount(list, html`<div class="card">${emptyState(empty)}</div>`);
        return;
      }
      mount(list, html`<p class="xs muted" style="margin:0 0 10px">${requests.length} รายการ</p>
        <div class="card" style="overflow:hidden"><ul class="list">${requests.map((r) => requestItem(r, { showRequester: state.scope !== 'mine' }))}</ul></div>`);
    } catch (err) {
      if (my === seq) mount(list, errorState(err));
    }
  }

  el.addEventListener('click', (e) => {
    const sc = e.target.closest('[data-scope]');
    if (sc) { state.scope = sc.dataset.scope; state.status = ''; syncHeader(); load(); return; }
    const st = e.target.closest('[data-status]');
    if (st) { state.status = st.dataset.status; syncHeader(); load(); return; }
    if (e.target.closest('[data-retry]')) load();
  });
  let t;
  $('#rq-q', el).addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim(); syncHeader(); load(); }, 250);
  });

  syncHeader();
  await load();
}
