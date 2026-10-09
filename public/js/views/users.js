import {
  html, icon, $, $$, mount, api, store, toast, openModal, confirmDialog, withBusy,
  initials, roleTags, fmtDateTime, emptyState, errorState, ROLE,
} from '../core.js';

function tempPasswordModal(user, password) {
  const { el } = openModal({
    title: 'รหัสผ่านชั่วคราว',
    body: html`<div class="stack">
      <p>ส่งรหัสนี้ให้ <b>${user.name}</b> (<span class="mono">${user.empId}</span>) ระบบจะบังคับให้ตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งแรก</p>
      <div class="temp-pw"><span class="mono" id="tp">${password}</span>
        <button class="btn btn-soft btn-sm" id="copy-pw">${icon('files', 'ic-sm')}คัดลอก</button></div>
      <div class="notice notice-warn">${icon('triangle-alert')}<div>รหัสนี้จะแสดงเพียงครั้งเดียว กรุณาคัดลอกเก็บไว้ก่อนปิดหน้าต่าง</div></div>
    </div>`,
    foot: html`<button class="btn btn-primary" data-close>เสร็จสิ้น</button>`,
  });
  $('#copy-pw', el).addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(password);
      e.currentTarget.innerHTML = String(html`${icon('check', 'ic-sm')}คัดลอกแล้ว`);
    } catch {
      const r = document.createRange();
      r.selectNodeContents($('#tp', el));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      toast('เลือกข้อความแล้ว กด Ctrl+C เพื่อคัดลอก');
    }
  });
}

function userForm(u = null) {
  const roles = u?.roles || [];
  return html`<form id="user-form" class="stack" novalidate>
    <div class="notice notice-err" id="uf-err" role="alert" hidden></div>
    <div class="form-grid cols-2">
      <div class="field">
        <label class="label" for="uf-emp">รหัสพนักงาน <span class="req">*</span></label>
        <input class="input mono" id="uf-emp" name="empId" value="${u?.empId || ''}" ${u ? 'readonly' : ''} placeholder="เช่น T-901" autocapitalize="characters" spellcheck="false">
      </div>
      <div class="field">
        <label class="label" for="uf-name">ชื่อ-นามสกุล <span class="req">*</span></label>
        <input class="input" id="uf-name" name="name" value="${u?.name || ''}" autocomplete="off">
      </div>
      <div class="field">
        <label class="label" for="uf-dept">แผนก</label>
        <input class="input" id="uf-dept" name="department" value="${u?.department || ''}" placeholder="เช่น QA, ENG, PRD" list="dept-list">
        <datalist id="dept-list"><option value="DCC"><option value="QA"><option value="ENG"><option value="PRD"><option value="ADM"><option value="HR"><option value="Warehouse"></datalist>
      </div>
      <div class="field">
        <label class="label" for="uf-email">อีเมล</label>
        <input class="input" id="uf-email" name="email" type="email" value="${u?.email || ''}" placeholder="name@wesco.com" autocomplete="off">
      </div>
    </div>
    <fieldset style="border:0;margin:0;padding:0">
      <legend class="label" style="margin-bottom:4px">สิทธิ์การใช้งาน</legend>
      <p class="help" style="margin-bottom:10px">ผู้ใช้ทุกคนยื่นคำขอและดาวน์โหลดเอกสารได้อยู่แล้ว เลือกสิทธิ์เพิ่มเติมตามหน้าที่</p>
      <div class="choice-grid">
        ${Object.entries(ROLE).map(([k, r]) => html`<label class="choice compact">
          <input type="checkbox" name="roles" value="${k}" ${roles.includes(k) ? 'checked' : ''} ${u?.id === store.user.id && k === 'admin' ? 'disabled' : ''}>
          <span class="choice-icon">${icon(k === 'admin' ? 'shield-check' : k === 'approver' ? 'stamp' : 'hash')}</span>
          <span><span class="choice-title">${r.label}</span><span class="choice-desc" style="display:block">${r.desc}</span></span>
          <span class="choice-tick">${icon('check', 'ic-sm')}</span>
        </label>`)}
      </div>
    </fieldset>
    ${u && u.id !== store.user.id ? html`<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> เปิดใช้งานบัญชี (ปิดเพื่อระงับการเข้าสู่ระบบ)</label>` : ''}
  </form>`;
}

export default async function usersView({ el, isCurrent }) {
  let users = [];
  let q = '';

  mount(el, html`
    <div class="page-head">
      <div><h1>จัดการผู้ใช้</h1><p>เพิ่มพนักงาน กำหนดสิทธิ์ Admin / ผู้อนุมัติ / DCC และรีเซ็ตรหัสผ่าน</p></div>
      <button class="btn btn-primary" id="add-user">${icon('user-plus')}เพิ่มผู้ใช้</button>
    </div>
    <div class="toolbar"><div class="input-wrap search">${icon('search')}
      <label class="sr-only" for="u-q">ค้นหาผู้ใช้</label>
      <input class="input" id="u-q" type="search" placeholder="ค้นหารหัสพนักงาน ชื่อ หรือแผนก" autocomplete="off"></div></div>
    <div id="u-list"></div>`);

  const list = $('#u-list', el);

  function renderList() {
    const term = q.toLowerCase();
    const shown = users.filter((u) => !term || `${u.empId} ${u.name} ${u.department} ${u.email}`.toLowerCase().includes(term));
    if (!shown.length) {
      mount(list, html`<div class="card">${emptyState({ iconName: 'users', title: 'ไม่พบผู้ใช้', text: 'ลองค้นหาด้วยคำอื่น' })}</div>`);
      return;
    }
    mount(list, html`<p class="xs muted" style="margin:0 0 10px">${shown.length} คน · ผู้อนุมัติ ${users.filter((u) => u.active && u.roles.includes('approver')).length} · DCC ${users.filter((u) => u.active && u.roles.includes('dcc')).length}</p>
      <div class="card" style="overflow:hidden"><ul class="list">
      ${shown.map((u) => html`<li><div class="list-item" style="${u.active ? '' : 'opacity:.6'}">
        <span class="avatar" aria-hidden="true">${initials(u.name)}</span>
        <div class="li-main">
          <div class="li-top"><b>${u.name}</b><span class="xs mono muted">${u.empId}</span>${u.active ? '' : html`<span class="tag tag-red">ระงับ</span>`}${u.mustChangePw ? html`<span class="tag">รอตั้งรหัสผ่าน</span>` : ''}</div>
          <div class="li-meta">${u.department ? html`<span>${icon('building-2', 'ic-sm')} ${u.department}</span>` : ''}${u.email ? html`<span>${icon('mail', 'ic-sm')} ${u.email}</span>` : ''}
            <span>เข้าระบบล่าสุด ${u.lastLogin ? fmtDateTime(u.lastLogin) : '—'}</span></div>
          <div class="row wrap" style="gap:4px;margin-top:6px">${u.roles.length ? roleTags(u.roles) : html`<span class="tag">ผู้ใช้ทั่วไป</span>`}</div>
        </div>
        <div class="row" style="gap:4px;flex:none">
          <button class="btn btn-ghost btn-icon" data-edit="${u.id}" aria-label="แก้ไข ${u.name}" title="แก้ไข">${icon('pencil')}</button>
          <button class="btn btn-ghost btn-icon" data-reset="${u.id}" aria-label="รีเซ็ตรหัสผ่าน ${u.name}" title="รีเซ็ตรหัสผ่าน">${icon('key-round')}</button>
        </div>
      </div></li>`)}
      </ul></div>`);
  }

  async function load() {
    try {
      users = (await api('/users')).users;
      if (isCurrent()) renderList();
    } catch (err) {
      mount(list, errorState(err));
    }
  }

  function readForm(form) {
    return {
      empId: form.empId.value.trim(),
      name: form.name.value.trim(),
      department: form.department.value.trim(),
      email: form.email.value.trim(),
      roles: $$('input[name=roles]:checked', form).map((x) => x.value),
      ...(form.active ? { active: form.active.checked } : {}),
    };
  }

  function openForm(u = null) {
    const { el: dlg, close } = openModal({
      title: u ? `แก้ไขผู้ใช้ · ${u.empId}` : 'เพิ่มผู้ใช้ใหม่',
      wide: true,
      body: userForm(u),
      foot: html`<button class="btn btn-ghost" data-close>ยกเลิก</button>
        <button class="btn btn-primary" type="submit" form="user-form" data-busy="กำลังบันทึก…">${icon('check')}${u ? 'บันทึก' : 'เพิ่มผู้ใช้'}</button>`,
    });
    const form = $('#user-form', dlg);
    (u ? form.name : form.empId).focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#uf-err', dlg);
      err.hidden = true;
      const data = readForm(form);
      if (u?.id === store.user.id) data.roles = [...new Set([...data.roles, 'admin'])];
      if (!data.empId || !data.name) {
        err.hidden = false;
        mount(err, html`${icon('circle-alert')}<span>กรุณากรอกรหัสพนักงานและชื่อ-นามสกุล</span>`);
        (data.empId ? form.name : form.empId).focus();
        return;
      }
      await withBusy($('.modal-foot .btn-primary', dlg), async () => {
        try {
          if (u) {
            await api(`/users/${u.id}`, { method: 'PATCH', body: data });
            toast(`บันทึกข้อมูล ${data.name} แล้ว`);
            close();
          } else {
            const res = await api('/users', { method: 'POST', body: data });
            close();
            tempPasswordModal(res.user, res.tempPassword);
          }
          load();
        } catch (ex) {
          err.hidden = false;
          mount(err, html`${icon('circle-alert')}<span>${ex.message}</span>`);
        }
      });
    });
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('#add-user')) { openForm(); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openForm(users.find((u) => u.id === Number(ed.dataset.edit))); return; }
    const rs = e.target.closest('[data-reset]');
    if (rs) {
      const u = users.find((x) => x.id === Number(rs.dataset.reset));
      const ok = await confirmDialog({
        title: 'รีเซ็ตรหัสผ่าน?',
        message: html`สร้างรหัสผ่านชั่วคราวใหม่ให้ <b>${u.name}</b> — รหัสเดิมจะใช้ไม่ได้ และผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์`,
        confirmText: 'รีเซ็ตรหัสผ่าน',
      });
      if (!ok) return;
      try {
        const res = await api(`/users/${u.id}/reset-password`, { method: 'POST' });
        tempPasswordModal(u, res.tempPassword);
        load();
      } catch (ex) { toast(ex.message, 'err'); }
    }
    if (e.target.closest('[data-retry]')) load();
  });
  $('#u-q', el).addEventListener('input', (e) => { q = e.target.value.trim(); renderList(); });

  await load();
}
