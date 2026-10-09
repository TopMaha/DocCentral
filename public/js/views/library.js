import {
  html, icon, $, $$, mount, api, store, hasRole, openModal, toast,
  docNo, fileExt, fmtDate, fmtSize, revText, emptyState, errorState,
} from '../core.js';

const ALL = '';

export default async function libraryView({ el, query, isCurrent }) {
  const state = {
    q: query.q || '',
    category: query.cat || ALL,
    status: hasRole('dcc') && query.status === 'OBSOLETE' ? 'OBSOLETE' : 'ACTIVE',
    categories: [],
  };
  const loggedIn = !!store.user;

  mount(el, html`
    <div class="page-head">
      <div>
        <h1>คลังเอกสาร</h1>
        <p>เอกสารฉบับล่าสุดที่ประกาศใช้ — ทุกคนดาวน์โหลดไปใช้งานได้ทันที</p>
      </div>
      <div class="row wrap">
        ${hasRole('dcc') ? html`<a class="btn hide-mobile" href="#/admin/import">${icon('folder-input')}นำเข้าเอกสารเดิม</a>` : ''}
        ${loggedIn ? html`<a class="btn btn-primary hide-mobile" href="#/requests/new">${icon('file-plus')}ยื่นคำขอเอกสาร</a>` : ''}
      </div>
    </div>

    <div class="toolbar">
      <div class="input-wrap search">
        ${icon('search')}
        <label class="sr-only" for="lib-q">ค้นหาเอกสาร</label>
        <input class="input" id="lib-q" type="search" placeholder="ค้นหาเลขที่เอกสาร หรือชื่อเอกสาร" value="${state.q}" autocomplete="off">
      </div>
      ${hasRole('dcc') ? html`
        <div class="tabs" role="tablist" aria-label="สถานะเอกสาร">
          <button class="tab" role="tab" data-status="ACTIVE" aria-selected="${state.status === 'ACTIVE'}">${icon('file-check', 'ic-sm')}ใช้งานอยู่</button>
          <button class="tab" role="tab" data-status="OBSOLETE" aria-selected="${state.status === 'OBSOLETE'}">${icon('archive', 'ic-sm')}ยกเลิกแล้ว</button>
        </div>` : ''}
    </div>
    <div class="chips scroll-mobile" id="lib-cats" role="group" aria-label="กรองตามหมวดเอกสาร" style="margin-bottom:18px"></div>
    <div id="lib-results" aria-live="polite"></div>
  `);

  const results = $('#lib-results', el);
  const cats = $('#lib-cats', el);

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category) p.set('cat', state.category);
    if (state.status !== 'ACTIVE') p.set('status', state.status);
    const qs = p.toString();
    history.replaceState(null, '', `#/library${qs ? `?${qs}` : ''}`);
  }

  function renderCats() {
    const total = state.categories.reduce((n, c) => n + c.count, 0);
    mount(cats, html`
      <button class="chip" data-cat="" aria-pressed="${state.category === ALL}">ทั้งหมด${state.status === 'ACTIVE' ? html`<span class="count">${total}</span>` : ''}</button>
      ${state.categories.map((c) => html`
        <button class="chip" data-cat="${c.code}" aria-pressed="${state.category === c.code}" title="${c.description}">
          <span class="mono" style="font-size:13px">${c.code}</span><span class="chip-name">${c.name}</span>${state.status === 'ACTIVE' ? html`<span class="count">${c.count}</span>` : ''}
        </button>`)}`);
  }

  const row = (d) => html`
    <tr class="clickable" data-doc="${d.id}">
      <td>${docNo(d.docNo, d.status === 'OBSOLETE' ? 'muted' : '')}</td>
      <td><button class="t-title" style="all:unset;cursor:pointer" data-doc-open="${d.id}">${d.title}</button>
        ${d.pendingRequest ? html`<div class="xs" style="margin-top:4px"><span class="tag tag-amber">${icon('clock', 'ic-sm')}มีคำขอ ${d.pendingRequest.reqNo}</span></div>` : ''}</td>
      <td><span class="rev">${revText(d.rev)}</span></td>
      <td class="nowrap">${fmtDate(d.effectiveDate)}</td>
      <td>${d.file ? html`<span class="row" style="gap:8px">${fileExt(d.file.ext, true)}<span class="xs muted nowrap">${fmtSize(d.file.size)}</span></span>` : '—'}</td>
      <td class="t-actions">
        ${d.status === 'ACTIVE' && d.file ? html`<a class="btn btn-soft btn-sm" href="/api/documents/${d.id}/download" download data-stop aria-label="ดาวน์โหลด ${d.docNo}">${icon('download', 'ic-sm')}ดาวน์โหลด</a>` : html`<span class="tag">ยกเลิกแล้ว</span>`}
      </td>
    </tr>`;

  const card = (d) => html`
    <article class="doc-card">
      ${d.file ? fileExt(d.file.ext) : ''}
      <div class="dc-main">
        <div class="row wrap" style="gap:6px">${docNo(d.docNo, d.status === 'OBSOLETE' ? 'muted' : '')}<span class="rev">${revText(d.rev)}</span></div>
        <button class="dc-title" data-doc-open="${d.id}">${d.title}</button>
        <div class="dc-meta">
          <span>${icon('calendar', 'ic-sm')} ${fmtDate(d.effectiveDate)}</span>
          ${d.file ? html`<span>${fmtSize(d.file.size)}</span>` : ''}
          ${d.pendingRequest ? html`<span class="tag tag-amber">${icon('clock', 'ic-sm')}มีคำขอค้างอยู่</span>` : ''}
        </div>
        <div class="dc-actions">
          ${d.status === 'ACTIVE' && d.file ? html`<a class="btn btn-primary btn-sm" href="/api/documents/${d.id}/download" download>${icon('download', 'ic-sm')}ดาวน์โหลด</a>` : ''}
          <button class="btn btn-sm" data-doc-open="${d.id}">${icon('info', 'ic-sm')}รายละเอียด</button>
        </div>
      </div>
    </article>`;

  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    mount(results, html`<div class="card card-pad" aria-busy="true">${Array.from({ length: 5 }, () => html`<div class="skeleton sk-line" style="height:20px;margin:14px 0"></div>`)}</div>`);
    try {
      const p = new URLSearchParams({ q: state.q, category: state.category, status: state.status });
      const { documents } = await api(`/documents?${p}`);
      if (seq !== loadSeq || !isCurrent()) return;
      if (!documents.length) {
        mount(results, html`<div class="card">${emptyState({
          iconName: state.q ? 'file-search' : 'folder-open',
          title: state.q ? `ไม่พบเอกสารที่ตรงกับ “${state.q}”` : 'ยังไม่มีเอกสารในหมวดนี้',
          text: state.q ? 'ลองค้นหาด้วยเลขที่เอกสาร เช่น TH-QA-001 หรือคำในชื่อเอกสาร' : 'เอกสารที่ประกาศใช้แล้วจะแสดงที่นี่',
          action: loggedIn && !state.q ? html`<a class="btn btn-primary" href="#/requests/new?type=NEW${state.category ? `&category=${state.category}` : ''}">${icon('file-plus')}ขอลงทะเบียนเอกสารใหม่</a>` : '',
        })}</div>`);
        return;
      }
      mount(results, html`
        <p class="xs muted" style="margin:0 0 10px">พบ ${documents.length} รายการ</p>
        <div class="card only-desktop" style="overflow:hidden">
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">เลขที่เอกสาร</th><th scope="col">ชื่อเอกสาร</th><th scope="col">Rev.</th><th scope="col">วันที่มีผล</th><th scope="col">ไฟล์</th><th scope="col"><span class="sr-only">ดาวน์โหลด</span></th></tr></thead>
            <tbody>${documents.map(row)}</tbody>
          </table></div>
        </div>
        <div class="doc-cards only-mobile">${documents.map(card)}</div>`);
    } catch (err) {
      if (seq !== loadSeq) return;
      mount(results, errorState(err));
    }
  }

  async function loadCats() {
    try {
      const { categories } = await api('/meta/categories');
      state.categories = categories;
      store.categories = categories;
      renderCats();
    } catch { /* หมวดโหลดไม่ได้ ให้รายการเอกสารแสดงข้อผิดพลาดแทน */ }
  }

  // ---------- events ----------
  let t;
  $('#lib-q', el).addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim(); syncUrl(); load(); }, 250);
  });
  cats.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.category = b.dataset.cat;
    renderCats();
    syncUrl();
    load();
  });
  el.addEventListener('click', (e) => {
    const s = e.target.closest('[data-status]');
    if (s) {
      state.status = s.dataset.status;
      $$('[data-status]', el).forEach((x) => x.setAttribute('aria-selected', String(x === s)));
      renderCats();
      syncUrl();
      load();
      return;
    }
    if (e.target.closest('[data-stop]')) return;
    if (e.target.closest('[data-retry]')) { load(); return; }
    const open = e.target.closest('[data-doc-open]') || e.target.closest('tr[data-doc]');
    if (open) openDocument(open.dataset.docOpen || open.dataset.doc);
  });

  await Promise.all([loadCats(), load()]);
  if (query.doc) openDocument(query.doc);
}

// ---------------------------------------------------------------------------
// รายละเอียดเอกสาร + ประวัติ Revision
// ---------------------------------------------------------------------------
export async function openDocument(id) {
  let data;
  try {
    data = await api(`/documents/${id}`);
  } catch (err) {
    toast(err.message, 'err');
    return;
  }
  const { document: d, revisions } = data;
  const loggedIn = !!store.user;
  const active = d.status === 'ACTIVE';
  const current = revisions.find((v) => v.status === 'CURRENT') || revisions[0];
  const REV_STATUS = { CURRENT: ['ฉบับปัจจุบัน', 'tag-green'], SUPERSEDED: ['ถูกแทนที่', ''], CANCELLED: ['ยกเลิก', 'tag-red'] };

  openModal({
    title: 'รายละเอียดเอกสาร',
    wide: true,
    body: html`
      <div class="stack">
        <div>
          <div class="row wrap" style="gap:8px;margin-bottom:8px">
            ${docNo(d.docNo, `lg ${active ? '' : 'muted'}`)}<span class="rev">${revText(d.rev)}</span>
            ${active ? html`<span class="tag tag-green">${icon('circle-check', 'ic-sm')}ใช้งานอยู่</span>` : html`<span class="tag tag-red">${icon('archive', 'ic-sm')}ยกเลิกแล้ว</span>`}
          </div>
          <h3 style="font-size:19px;line-height:1.4">${d.title}</h3>
          <p class="small muted" style="margin-top:4px">หมวด ${d.category} · ${d.categoryName}</p>
        </div>

        ${d.file && active ? html`
          <div class="file-card">
            ${fileExt(d.file.ext)}
            <div class="grow"><div class="file-name">${d.file.name}</div><div class="xs muted">${fmtSize(d.file.size)}</div></div>
          </div>
          <div class="action-buttons">
            <a class="btn btn-primary" href="/api/documents/${d.id}/download" download>${icon('download')}ดาวน์โหลด</a>
            ${d.file.inline ? html`<a class="btn" href="/api/documents/${d.id}/download?inline=1" target="_blank" rel="noopener">${icon('external-link')}เปิดดูในเบราว์เซอร์</a>` : ''}
          </div>` : ''}

        <dl class="dl cols-3">
          <div><dt>DCN No.</dt><dd class="mono">${current?.dcnNo && current.dcnNo !== 'IMPORT' ? current.dcnNo : '—'}</dd></div>
          <div><dt>วันที่มีผลบังคับใช้</dt><dd>${fmtDate(d.effectiveDate)}</dd></div>
          <div><dt>ปรับปรุงล่าสุด</dt><dd>${fmtDate(d.updatedAt)}</dd></div>
        </dl>

        ${d.pendingRequest ? html`<div class="notice notice-warn">${icon('clock')}<div>เอกสารนี้มีคำขอ <b class="mono">${d.pendingRequest.reqNo}</b> กำลังดำเนินการอยู่
          ${loggedIn ? html` — <a href="#/requests/${d.pendingRequest.id}" data-close>ดูคำขอ</a>` : ''}</div></div>` : ''}

        ${loggedIn && active && !d.pendingRequest ? html`
          <div class="action-buttons">
            <a class="btn btn-soft" href="#/requests/new?type=REVISE&doc=${d.id}" data-close>${icon('file-pen')}ขอแก้ไข (Up Rev.)</a>
            <a class="btn btn-danger" href="#/requests/new?type=CANCEL&doc=${d.id}" data-close>${icon('file-x')}ขอยกเลิกเอกสาร</a>
          </div>` : ''}

        <div>
          <h4 class="section-title" style="margin-bottom:10px">ประวัติ Revision</h4>
          <ul class="timeline">
            ${revisions.map((v) => html`<li>
              <span class="tl-dot ${v.status === 'CURRENT' ? 'ok' : v.status === 'CANCELLED' ? 'bad' : ''}">${icon(v.status === 'CURRENT' ? 'file-check' : 'history')}</span>
              <div class="tl-body">
                <div class="row wrap" style="gap:6px"><b class="mono">${revText(v.rev)}</b><span class="tag ${REV_STATUS[v.status]?.[1] || ''}">${REV_STATUS[v.status]?.[0] || v.status}</span>
                  ${v.dcnNo && v.dcnNo !== 'IMPORT' ? html`<span class="xs muted mono">${v.dcnNo}</span>` : v.dcnNo === 'IMPORT' ? html`<span class="xs muted">นำเข้าจากระบบเดิม</span>` : ''}</div>
                <div class="xs muted" style="margin-top:2px">มีผล ${fmtDate(v.effectiveDate)}${v.publisher ? ` · โดย ${v.publisher}` : ''}${v.obsoletedAt ? ` · ยกเลิก ${fmtDate(v.obsoletedAt)}` : ''}</div>
                ${v.reason ? html`<div class="tl-comment">${v.reason}</div>` : ''}
                ${v.canDownload && v.status !== 'CURRENT' ? html`<a class="btn btn-ghost btn-sm" style="margin-top:6px;padding-left:0" href="/api/revisions/${v.id}/download" download>${icon('download', 'ic-sm')}ดาวน์โหลดฉบับนี้ (เฉพาะ DCC)</a>` : ''}
              </div>
            </li>`)}
          </ul>
        </div>
      </div>`,
  });
}

