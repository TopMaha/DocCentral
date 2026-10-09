import {
  html, icon, $, $$, mount, api, apiUpload, store, toast, confirmDialog, initials,
  docNo, fileExt, fmtSize, revText, TYPE, updateBadges,
} from '../core.js';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.xlsm,.ppt,.pptx,.vsd,.vsdx,.txt,.csv,.jpg,.jpeg,.png,.zip,.dwg,.dxf';

export default async function requestNewView({ el, query, navigate, isCurrent }) {
  const u = store.user;
  const state = {
    type: TYPE[query.type] ? query.type : '',
    category: query.category || '',
    title: '',
    documentId: query.doc ? Number(query.doc) : null,
    reason: '',
    file: null,
    nextNo: null,
    docs: null,
    categories: [],
    pickerQ: '',
  };

  mount(el, html`
    <a class="back-link" href="#/requests">${icon('arrow-left', 'ic-sm')}คำขอของฉัน</a>
    <div class="page-head">
      <div>
        <h1>ยื่นคำขอเอกสาร</h1>
        <p>ลงทะเบียนใหม่ · แก้ไข (Up Rev.) · ยกเลิกเอกสาร — ระบบจะแจ้งเตือน Admin ทันทีที่กด Submit</p>
      </div>
    </div>

    <form id="req-form" class="form-layout" novalidate>
      <div class="stack">
        <div class="notice notice-err" id="form-errors" role="alert" tabindex="-1" hidden></div>

        <section class="card form-section" aria-labelledby="s1">
          <div class="fs-head"><span class="fs-num">1</span><div><h2 id="s1">ผู้ขอลงทะเบียน</h2><p>ดึงจากบัญชีที่เข้าสู่ระบบ</p></div></div>
          <div class="requester">
            <span class="avatar" aria-hidden="true">${initials(u.name)}</span>
            <div class="grow"><b>${u.name}</b><span class="small muted"><span class="mono">${u.empId}</span>${u.department ? ` · ${u.department}` : ''}</span></div>
          </div>
        </section>

        <section class="card form-section" aria-labelledby="s2">
          <div class="fs-head"><span class="fs-num">2</span><div><h2 id="s2">เลือกประเภทการแก้ไข <span class="req" style="color:var(--red-600)">*</span></h2><p>เลือก 1 รายการ</p></div></div>
          <div class="choice-grid cols-3" role="radiogroup" aria-labelledby="s2">
            ${['NEW', 'REVISE', 'CANCEL'].map((k) => html`
              <label class="choice">
                <input type="radio" name="type" value="${k}" ${state.type === k ? 'checked' : ''}>
                <span class="choice-icon">${icon(TYPE[k].icon)}</span>
                <span><span class="choice-title">${TYPE[k].label}</span><span class="choice-desc" style="display:block">${TYPE[k].desc}</span></span>
                <span class="choice-tick">${icon('check', 'ic-sm')}</span>
              </label>`)}
          </div>
          <div class="error-text" id="err-type" hidden></div>
        </section>

        <section class="card form-section" aria-labelledby="s3" id="sec-detail" hidden>
          <div class="fs-head"><span class="fs-num">3</span><div><h2 id="s3">รายละเอียดเอกสาร</h2><p id="s3-sub"></p></div></div>
          <div id="detail-body" class="stack"></div>
        </section>

        <section class="card form-section" aria-labelledby="s4">
          <div class="fs-head"><span class="fs-num" id="n-reason">4</span><div><h2 id="s4"><label for="reason">เหตุผลในการเปลี่ยนแปลง</label> <span class="req" style="color:var(--red-600)">*</span></h2><p>อธิบายสิ่งที่เปลี่ยนแปลงและเหตุผล เพื่อให้ผู้อนุมัติพิจารณาได้รวดเร็ว</p></div></div>
          <textarea class="textarea" id="reason" name="reason" maxlength="1000" placeholder="เช่น ปรับปรุงขั้นตอนการตรวจสอบให้สอดคล้องกับ ISO 9001:2015 ข้อ 7.5" aria-describedby="reason-count"></textarea>
          <div class="row between" style="margin-top:6px"><div class="error-text" id="err-reason" hidden></div><span class="char-count grow" id="reason-count">0 / 1000</span></div>
        </section>

        <section class="card form-section" aria-labelledby="s5" id="sec-file">
          <div class="fs-head"><span class="fs-num" id="n-file">5</span><div><h2 id="s5">แนบไฟล์เอกสาร <span class="req" style="color:var(--red-600)">*</span></h2><p>PDF, Word, Excel, PowerPoint, Visio, รูปภาพ, ZIP · ไม่เกิน ${store.settings.maxUploadMb} MB</p></div></div>
          <div id="file-body"></div>
          <div class="error-text" id="err-file" hidden style="margin-top:6px"></div>
        </section>
      </div>

      <aside class="form-aside">
        <section class="card form-section" aria-labelledby="sum-h">
          <h2 id="sum-h" style="font-size:17px;margin-bottom:10px">สรุปคำขอ</h2>
          <dl id="summary" style="margin:0"></dl>
          <div style="margin:16px 0 18px">
            <h3 class="section-title" style="margin-bottom:10px">ขั้นตอนหลัง Submit</h3>
            <ol class="next-steps">
              <li><span class="ns-ic">${icon('clock')}</span>Admin ตรวจสอบคำขอ</li>
              <li><span class="ns-ic">${icon('stamp')}</span>ผู้อนุมัติ อนุมัติ / ไม่อนุมัติ</li>
              <li><span class="ns-ic">${icon('hash')}</span>DCC run DCN No. และประกาศใช้</li>
              <li><span class="ns-ic">${icon('folder-open')}</span>จัดเก็บเข้า share folder อัตโนมัติ</li>
            </ol>
          </div>
          <div class="progress" id="up-progress" hidden><span style="width:0"></span></div>
          <button type="submit" class="btn btn-primary btn-lg btn-block" id="submit-btn" style="margin-top:12px">${icon('send')}Submit คำขอ</button>
          <p class="help" style="text-align:center;margin-top:8px">ยกเลิกคำขอได้จนกว่าจะได้รับการอนุมัติ</p>
        </section>
      </aside>
    </form>`);

  const form = $('#req-form', el);
  const detail = $('#detail-body', el);
  const fileBody = $('#file-body', el);

  // ---------- โหลดข้อมูลประกอบ ----------
  const loadCats = api('/meta/categories').then((r) => { state.categories = r.categories; }).catch(() => {});
  async function ensureDocs() {
    if (state.docs) return;
    const r = await api('/documents?status=ACTIVE');
    state.docs = r.documents;
  }

  async function refreshNextNo() {
    state.nextNo = null;
    renderSummary();
    if (state.type !== 'NEW' || !state.category) return;
    const cat = state.category;
    try {
      const r = await api(`/meta/next-number?category=${encodeURIComponent(cat)}`);
      if (state.category === cat && isCurrent()) {
        state.nextNo = r.docNo;
        renderSummary();
        const pv = $('#no-preview', el);
        if (pv) mount(pv, html`${docNo(r.docNo, 'lg')}<span class="rev">Rev.${r.rev}</span>`);
      }
    } catch { /* ignore */ }
  }

  const selectedDoc = () => state.docs?.find((d) => d.id === state.documentId) || null;

  // ---------- Section 3 ----------
  async function renderDetail() {
    const sec = $('#sec-detail', el);
    const fileSec = $('#sec-file', el);
    sec.hidden = !state.type;
    fileSec.hidden = state.type === 'CANCEL';
    $('#n-reason', el).textContent = state.type ? '4' : '3';
    $('#n-file', el).textContent = state.type ? '5' : '4';
    if (!state.type) return;

    if (state.type === 'NEW') {
      await loadCats;
      $('#s3-sub', el).textContent = 'เลือกหมวด ระบบจะ run เลขต่อจากเอกสารที่มีอยู่ให้อัตโนมัติ';
      mount(detail, html`
        <fieldset style="border:0;margin:0;padding:0">
          <legend class="label" style="margin-bottom:8px">หมวดเอกสาร <span class="req">*</span></legend>
          <div class="choice-grid cols-auto">
            ${state.categories.map((c) => html`
              <label class="choice compact">
                <input type="radio" name="category" value="${c.code}" ${state.category === c.code ? 'checked' : ''}>
                <span class="choice-icon mono" style="font-size:11px;font-weight:600">${c.code}</span>
                <span><span class="choice-title mono" style="font-size:13.5px">${c.pattern}</span><span class="choice-desc" style="display:block">${c.description}</span></span>
              </label>`)}
          </div>
          <div class="error-text" id="err-category" hidden style="margin-top:6px"></div>
        </fieldset>
        <div class="field">
          <label class="label" for="title">ชื่อเอกสาร <span class="req">*</span></label>
          <input class="input" id="title" name="title" maxlength="200" value="${state.title}" placeholder="เช่น แบบฟอร์มตรวจรับวัตถุดิบ">
          <div class="error-text" id="err-title" hidden></div>
        </div>
        <div class="field">
          <span class="label">เลขที่เอกสารที่จะได้รับ</span>
          <div class="row wrap" id="no-preview" style="gap:8px;min-height:36px">
            ${state.nextNo ? html`${docNo(state.nextNo, 'lg')}<span class="rev">Rev.00</span>` : html`<span class="small muted">เลือกหมวดเพื่อดูเลขที่เอกสาร</span>`}
          </div>
          <p class="help">ระบบจะจองเลขนี้ให้เมื่อกด Submit (หากมีผู้ยื่นพร้อมกัน เลขอาจเลื่อนไป 1 ลำดับ)</p>
        </div>`);
      if (state.category && !state.nextNo) refreshNextNo();
      return;
    }

    // REVISE / CANCEL — เลือกเอกสารที่มีอยู่
    $('#s3-sub', el).textContent = state.type === 'REVISE'
      ? 'เลือกเอกสารที่จะแก้ไข ระบบจะ up revision จากฉบับปัจจุบัน'
      : 'เลือกเอกสารที่ต้องการยกเลิกการใช้งาน';
    mount(detail, html`<div class="skeleton" style="height:180px;border-radius:14px"></div>`);
    try {
      await ensureDocs();
    } catch (err) {
      mount(detail, html`<div class="notice notice-err">${icon('circle-alert')}${err.message}</div>`);
      return;
    }
    if (!isCurrent()) return;
    const doc = selectedDoc();
    mount(detail, html`
      <div class="field">
        <span class="label" id="dp-label">เอกสาร <span class="req">*</span></span>
        <div class="doc-picker">
          <label class="sr-only" for="dp-q">ค้นหาเอกสาร</label>
          <div class="input-wrap">${icon('search')}<input class="input dp-search" id="dp-q" type="search" placeholder="พิมพ์เลขที่หรือชื่อเอกสาร" value="${state.pickerQ}" autocomplete="off"></div>
          <ul class="dp-list" id="dp-list" role="radiogroup" aria-labelledby="dp-label"></ul>
        </div>
        <div class="error-text" id="err-document" hidden></div>
      </div>
      ${state.type === 'REVISE' ? html`
        <div class="field">
          <label class="label" for="title">ชื่อเอกสาร (แก้ไขได้หากเปลี่ยนชื่อ)</label>
          <input class="input" id="title" name="title" maxlength="200" value="${state.title || doc?.title || ''}" placeholder="เลือกเอกสารก่อน">
        </div>` : ''}
      <div id="rev-preview"></div>`);
    renderPicker();
    renderRevPreview();
  }

  function renderPicker() {
    const list = $('#dp-list', el);
    if (!list) return;
    const q = state.pickerQ.toLowerCase();
    const all = state.docs || [];
    const found = all.filter((d) => !q || d.docNo.toLowerCase().includes(q) || d.title.toLowerCase().includes(q));
    // ให้เอกสารที่เลือกอยู่แสดงด้านบนเสมอ
    const sel = selectedDoc();
    const shown = [...(sel && found.includes(sel) ? [sel] : []), ...found.filter((d) => d !== sel)].slice(0, 60);
    if (!all.length) {
      mount(list, html`<li class="dp-more">ยังไม่มีเอกสารที่ใช้งานอยู่ในระบบ</li>`);
      return;
    }
    mount(list, html`
      ${shown.map((d) => html`<li><label class="dp-opt">
        <input type="radio" name="documentId" value="${d.id}" ${d.id === state.documentId ? 'checked' : ''} ${d.pendingRequest ? 'disabled' : ''}>
        <span class="grow"><span class="row wrap" style="gap:6px">${docNo(d.docNo)}<span class="rev">${revText(d.rev)}</span>
          ${d.pendingRequest ? html`<span class="tag tag-amber">${icon('clock', 'ic-sm')}มีคำขอ ${d.pendingRequest.reqNo}</span>` : ''}</span>
          <span class="dp-title" style="display:block;margin-top:4px">${d.title}</span></span>
      </label></li>`)}
      ${!found.length ? html`<li class="dp-more">ไม่พบเอกสารที่ตรงกับ “${state.pickerQ}”</li>` : ''}
      ${found.length > shown.length ? html`<li class="dp-more">แสดง ${shown.length} จาก ${found.length} รายการ — พิมพ์เพื่อค้นหาเพิ่มเติม</li>` : ''}`);
  }

  function renderRevPreview() {
    const box = $('#rev-preview', el);
    if (!box) return;
    const d = selectedDoc();
    if (!d) { box.innerHTML = ''; return; }
    mount(box, state.type === 'REVISE'
      ? html`<div class="notice notice-info">${icon('file-pen')}<div><b>${d.docNo}</b> จะขึ้นจาก <b class="mono">${revText(d.rev)}</b> เป็น <b class="mono">${revText(d.rev + 1)}</b> — ฉบับเดิมจะถูกย้ายไปโฟลเดอร์ Obsolete เมื่อประกาศใช้</div></div>`
      : html`<div class="notice notice-warn">${icon('triangle-alert')}<div><b>${d.docNo} ${revText(d.rev)}</b> จะถูกยกเลิกการใช้งาน และย้ายไปเก็บที่โฟลเดอร์ Obsolete หลัง DCC ประกาศ</div></div>`);
  }

  // ---------- Section 5: ไฟล์ ----------
  function renderFile() {
    if (state.file) {
      const ext = state.file.name.split('.').pop().toLowerCase();
      mount(fileBody, html`<div class="file-card">
        ${fileExt(ext)}
        <div class="grow"><div class="file-name">${state.file.name}</div><div class="xs muted">${fmtSize(state.file.size)}</div></div>
        <button type="button" class="btn btn-ghost btn-sm" id="file-remove">${icon('x', 'ic-sm')}เปลี่ยนไฟล์</button>
      </div>`);
      $('#file-remove', el).addEventListener('click', () => { state.file = null; renderFile(); renderSummary(); $('#file-input', el)?.focus(); });
    } else {
      mount(fileBody, html`<label class="dropzone" id="dropzone">
        <input type="file" id="file-input" name="file" accept="${ACCEPT}" aria-describedby="dz-hint">
        <span class="dz-icon">${icon('upload', 'ic-lg')}</span>
        <b style="color:var(--ink)">แตะเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่</b>
        <span class="small" id="dz-hint">ไฟล์จะถูกเก็บในโฟลเดอร์ Pending จนกว่าจะประกาศใช้</span>
      </label>`);
      const dz = $('#dropzone', el);
      const input = $('#file-input', el);
      input.addEventListener('change', () => pickFile(input.files[0]));
      ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('dragover')));
      dz.addEventListener('drop', (e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); });
    }
  }

  function pickFile(f) {
    if (!f) return;
    const ext = `.${f.name.split('.').pop().toLowerCase()}`;
    const err = $('#err-file', el);
    if (!ACCEPT.split(',').includes(ext)) {
      showFieldErr(err, `ไม่รองรับไฟล์ ${ext} — กรุณาเลือก PDF, Word, Excel หรือไฟล์ที่รองรับ`);
      return;
    }
    if (f.size > store.settings.maxUploadMb * 1024 * 1024) {
      showFieldErr(err, `ไฟล์มีขนาด ${fmtSize(f.size)} เกินกำหนด ${store.settings.maxUploadMb} MB`);
      return;
    }
    err.hidden = true;
    state.file = f;
    renderFile();
    renderSummary();
  }

  // ---------- Summary ----------
  function renderSummary() {
    const d = selectedDoc();
    let no = html`<span class="muted">—</span>`;
    if (state.type === 'NEW') no = state.nextNo ? html`${docNo(state.nextNo)}` : html`<span class="muted">เลือกหมวด</span>`;
    else if (d) no = html`${docNo(d.docNo)}`;
    let rev = html`<span class="muted">—</span>`;
    if (state.type === 'NEW') rev = html`<span class="mono">Rev.00</span>`;
    else if (d && state.type === 'REVISE') rev = html`<span class="mono">${revText(d.rev)} → ${revText(d.rev + 1)}</span>`;
    else if (d && state.type === 'CANCEL') rev = html`<span class="mono">${revText(d.rev)}</span> → <span style="color:var(--red-700)">ยกเลิก</span>`;
    mount($('#summary', el), html`
      <div class="summary-row"><dt>ประเภท</dt><dd>${state.type ? TYPE[state.type].label : html`<span class="muted">ยังไม่เลือก</span>`}</dd></div>
      <div class="summary-row"><dt>เลขที่เอกสาร</dt><dd>${no}</dd></div>
      <div class="summary-row"><dt>Revision</dt><dd>${rev}</dd></div>
      <div class="summary-row"><dt>ไฟล์แนบ</dt><dd>${state.type === 'CANCEL' ? html`<span class="muted">ไม่ต้องแนบ</span>` : state.file ? html`<span class="small">${fmtSize(state.file.size)}</span>` : html`<span class="muted">ยังไม่แนบ</span>`}</dd></div>`);
  }

  function showFieldErr(box, msg, input) {
    box.hidden = false;
    mount(box, html`${icon('circle-alert', 'ic-sm')}<span>${msg}</span>`);
    input?.setAttribute('aria-invalid', 'true');
  }

  // ---------- Events ----------
  form.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.name === 'type') {
      state.type = t.value;
      state.nextNo = null;
      $('#err-type', el).hidden = true;
      history.replaceState(null, '', `#/requests/new?type=${state.type}${state.documentId ? `&doc=${state.documentId}` : ''}`);
      await renderDetail();
      renderSummary();
    } else if (t.name === 'category') {
      state.category = t.value;
      $('#err-category', el).hidden = true;
      refreshNextNo();
    } else if (t.name === 'documentId') {
      state.documentId = Number(t.value);
      $('#err-document', el).hidden = true;
      const d = selectedDoc();
      const title = $('#title', el);
      if (title && d) { title.value = d.title; state.title = ''; }
      renderRevPreview();
      renderSummary();
    }
  });
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'dp-q') { state.pickerQ = t.value.trim(); renderPicker(); }
    if (t.id === 'title') { state.title = t.value; t.removeAttribute('aria-invalid'); $('#err-title', el) && ($('#err-title', el).hidden = true); }
    if (t.id === 'reason') {
      state.reason = t.value;
      $('#reason-count', el).textContent = `${t.value.length} / 1000`;
      if (t.value.trim().length >= 5) { t.removeAttribute('aria-invalid'); $('#err-reason', el).hidden = true; }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errors = [];
    const fail = (id, msg, focusEl) => { showFieldErr($(`#err-${id}`, el), msg, focusEl); errors.push({ msg, focusEl }); };
    $$('.error-text', form).forEach((x) => { x.hidden = true; });
    $('#form-errors', el).hidden = true;

    if (!state.type) fail('type', 'กรุณาเลือกประเภทการแก้ไข', $('input[name=type]', el));
    if (state.type === 'NEW') {
      if (!state.category) fail('category', 'กรุณาเลือกหมวดเอกสาร', $('input[name=category]', el));
      const title = $('#title', el);
      if (!title?.value.trim()) fail('title', 'กรุณาใส่ชื่อเอกสาร', title);
    }
    if ((state.type === 'REVISE' || state.type === 'CANCEL') && !selectedDoc()) fail('document', 'กรุณาเลือกเอกสาร', $('#dp-q', el));
    const reason = $('#reason', el);
    if (reason.value.trim().length < 5) fail('reason', 'กรุณาใส่เหตุผลในการเปลี่ยนแปลง (อย่างน้อย 5 ตัวอักษร)', reason);
    if (state.type && state.type !== 'CANCEL' && !state.file) fail('file', 'กรุณาแนบไฟล์เอกสาร', $('#file-input', el));

    if (errors.length) {
      const box = $('#form-errors', el);
      box.hidden = false;
      mount(box, html`${icon('circle-alert')}<div><b>กรุณาตรวจสอบ ${errors.length} รายการ</b><ul style="margin:4px 0 0;padding-left:18px">${errors.map((x) => html`<li>${x.msg}</li>`)}</ul></div>`);
      (errors[0].focusEl || box).focus();
      errors[0].focusEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const d = selectedDoc();
    const title = $('#title', el)?.value.trim() || d?.title || '';
    const ok = await confirmDialog({
      title: 'ยืนยันการส่งคำขอ',
      message: html`<div class="stack-sm">
        <div><b>${TYPE[state.type].label}</b></div>
        <div class="row wrap" style="gap:6px">${docNo(state.type === 'NEW' ? (state.nextNo || 'เลขใหม่') : d.docNo)}
          <span class="mono small">${state.type === 'NEW' ? 'Rev.00' : state.type === 'REVISE' ? `${revText(d.rev)} → ${revText(d.rev + 1)}` : `${revText(d.rev)} → ยกเลิก`}</span></div>
        <div style="color:var(--ink)">${title}</div>
        <div class="small">ระบบจะแจ้งเตือน Admin เพื่อตรวจสอบและส่งต่อผู้อนุมัติ</div></div>`,
      confirmText: 'Submit คำขอ',
    });
    if (!ok) return;

    const fd = new FormData();
    fd.append('type', state.type);
    fd.append('reason', reason.value.trim());
    if (state.type === 'NEW') { fd.append('category', state.category); fd.append('title', title); }
    else { fd.append('documentId', String(state.documentId)); if (state.type === 'REVISE') fd.append('title', title); }
    if (state.file && state.type !== 'CANCEL') fd.append('file', state.file, state.file.name);

    const btn = $('#submit-btn', el);
    const bar = $('#up-progress', el);
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>กำลังส่งคำขอ…</span>';
    bar.hidden = !state.file;
    try {
      const { request } = await apiUpload('/requests', fd, (p) => {
        bar.firstElementChild.style.width = `${Math.round(p * 100)}%`;
        btn.lastElementChild.textContent = p < 1 ? `กำลังอัปโหลด ${Math.round(p * 100)}%` : 'กำลังบันทึก…';
      });
      toast(html`ส่งคำขอ <b>${request.reqNo}</b> (${request.docNo}) แล้ว — แจ้งเตือน Admin เรียบร้อย`);
      updateBadges();
      navigate(`#/requests/${request.id}`);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = original;
      bar.hidden = true;
      const box = $('#form-errors', el);
      box.hidden = false;
      mount(box, html`${icon('circle-alert')}<div>${err.message}</div>`);
      box.focus();
      if (state.type === 'NEW') refreshNextNo();
      if (err.status === 409) { state.docs = null; renderDetail(); }
    }
  });

  // ---------- initial ----------
  renderFile();
  renderSummary();
  await renderDetail();
  renderSummary();
  if (state.documentId && state.type && state.type !== 'NEW' && !selectedDoc()) {
    toast('เอกสารที่เลือกไม่อยู่ในสถานะใช้งาน หรือมีคำขอค้างอยู่', 'err');
    state.documentId = null;
  }
}
