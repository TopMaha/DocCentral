import {
  html, icon, $, mount, api, apiUpload, store, toast, docNo, fileExt, fmtSize, revText, todayISO,
} from '../core.js';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.xlsm,.ppt,.pptx,.vsd,.vsdx,.txt,.csv,.jpg,.jpeg,.png,.zip,.dwg,.dxf';

/** เดาเลขเอกสาร/Rev/ชื่อ จากชื่อไฟล์ เช่น "TH-QA-001_Rev02_แบบฟอร์มตรวจรับ.xlsx" */
function guess(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const m = base.match(/(TH-[A-Z]+-\d{1,6})[\s_-]*(?:Rev\.?\s*(\d+))?[\s_-]*(.*)$/i);
  if (!m) return { title: base };
  return { docNo: m[1].toUpperCase(), rev: m[2] ? Number(m[2]) : 0, title: (m[3] || '').replace(/[_]+/g, ' ').trim() };
}

export default async function importView({ el }) {
  const done = [];
  let file = null;
  const cats = (await api('/meta/categories').catch(() => ({ categories: [] }))).categories;

  mount(el, html`
    <a class="back-link" href="#/library">${icon('arrow-left', 'ic-sm')}คลังเอกสาร</a>
    <div class="page-head">
      <div><h1>นำเข้าเอกสารเดิม</h1><p>ลงทะเบียนเอกสารที่ใช้งานอยู่แล้วเข้าระบบโดยตรง (ไม่ผ่านขั้นตอนอนุมัติ) เพื่อให้ระบบ run เลขต่อได้ถูกต้อง</p></div>
    </div>
    <div class="form-layout">
      <form id="imp-form" class="card form-section stack" novalidate>
        <div class="notice notice-err" id="imp-err" role="alert" hidden></div>
        <div class="field">
          <span class="label">ไฟล์เอกสาร <span class="req">*</span></span>
          <div id="imp-file"></div>
          <p class="help">ตั้งชื่อไฟล์แบบ <span class="mono">TH-QA-001_Rev02_ชื่อเอกสาร.xlsx</span> ระบบจะกรอกข้อมูลให้อัตโนมัติ</p>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label class="label" for="imp-no">เลขที่เอกสาร <span class="req">*</span></label>
            <input class="input mono" id="imp-no" name="docNo" placeholder="TH-QA-001" autocapitalize="characters" spellcheck="false" aria-describedby="imp-no-help">
            <p class="help" id="imp-no-help">หมวดที่ใช้ได้: ${cats.map((c) => c.code).join(', ')}</p>
          </div>
          <div class="field">
            <label class="label" for="imp-rev">Revision ปัจจุบัน <span class="req">*</span></label>
            <input class="input mono" id="imp-rev" name="rev" type="number" min="0" max="99" value="0" inputmode="numeric">
          </div>
        </div>
        <div class="field">
          <label class="label" for="imp-title">ชื่อเอกสาร <span class="req">*</span></label>
          <input class="input" id="imp-title" name="title" maxlength="200">
        </div>
        <div class="field" style="max-width:260px">
          <label class="label" for="imp-eff">วันที่มีผลบังคับใช้</label>
          <input class="input" id="imp-eff" name="effectiveDate" type="date" value="${todayISO()}">
        </div>
        <button class="btn btn-primary btn-lg" type="submit" id="imp-btn">${icon('folder-input')}นำเข้าเอกสาร</button>
      </form>

      <aside class="form-aside stack">
        <section class="card form-section">
          <h2 style="font-size:16px;margin-bottom:10px">นำเข้าแล้ว (รอบนี้)</h2>
          <div id="imp-done"><p class="small muted">ยังไม่มีรายการ</p></div>
        </section>
        <div class="notice notice-info">${icon('info')}<div class="small">ไฟล์จะถูกจัดเก็บที่ <span class="mono">${store.settings.folders?.controlled || '01_Controlled'}/TH-หมวด/</span> และแสดงในคลังเอกสารทันที</div></div>
      </aside>
    </div>`);

  const form = $('#imp-form', el);
  const fileBox = $('#imp-file', el);

  function renderFile() {
    if (file) {
      mount(fileBox, html`<div class="file-card">${fileExt(file.name.split('.').pop().toLowerCase())}
        <div class="grow"><div class="file-name">${file.name}</div><div class="xs muted">${fmtSize(file.size)}</div></div>
        <button type="button" class="btn btn-ghost btn-sm" id="imp-clear">${icon('x', 'ic-sm')}เปลี่ยน</button></div>`);
      $('#imp-clear', el).addEventListener('click', () => { file = null; renderFile(); });
    } else {
      mount(fileBox, html`<label class="dropzone" style="padding:20px">
        <input type="file" id="imp-input" accept="${ACCEPT}">
        <span class="dz-icon">${icon('upload')}</span><b style="color:var(--ink)">เลือกไฟล์ หรือลากมาวาง</b></label>`);
      const input = $('#imp-input', el);
      const dz = input.parentElement;
      input.addEventListener('change', () => pick(input.files[0]));
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
      dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('dragover'); pick(e.dataTransfer.files[0]); });
    }
  }

  function pick(f) {
    if (!f) return;
    file = f;
    const g = guess(f.name);
    if (g.docNo && !form.docNo.value) form.docNo.value = g.docNo;
    if (g.rev != null && g.docNo) form.rev.value = g.rev;
    if (g.title && !form.title.value) form.title.value = g.title;
    renderFile();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#imp-err', el);
    err.hidden = true;
    const showErr = (m, f) => { err.hidden = false; mount(err, html`${icon('circle-alert')}<span>${m}</span>`); f?.focus(); };
    if (!file) return showErr('กรุณาเลือกไฟล์เอกสาร');
    if (!/^TH-[A-Z]+-\d{1,6}$/i.test(form.docNo.value.trim())) return showErr('รูปแบบเลขที่เอกสารไม่ถูกต้อง (เช่น TH-QA-001)', form.docNo);
    if (!form.title.value.trim()) return showErr('กรุณาใส่ชื่อเอกสาร', form.title);

    const fd = new FormData(form);
    fd.set('docNo', form.docNo.value.trim().toUpperCase());
    fd.append('file', file, file.name);
    const btn = $('#imp-btn', el);
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>กำลังนำเข้า…</span>';
    try {
      const { document: d } = await apiUpload('/documents/import', fd, (p) => { btn.lastElementChild.textContent = `กำลังอัปโหลด ${Math.round(p * 100)}%`; });
      done.unshift(d);
      toast(html`นำเข้า <b>${d.docNo}</b> แล้ว`);
      mount($('#imp-done', el), html`<ul class="list">${done.map((x) => html`<li style="padding:8px 0;border-top:1px solid var(--line)">
        <div class="row wrap" style="gap:6px">${docNo(x.docNo)}<span class="rev">${revText(x.rev)}</span></div><div class="small" style="margin-top:4px">${x.title}</div></li>`)}</ul>`);
      form.reset();
      form.effectiveDate.value = todayISO();
      file = null;
      renderFile();
    } catch (ex) {
      showErr(ex.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
    return undefined;
  });

  renderFile();
}
