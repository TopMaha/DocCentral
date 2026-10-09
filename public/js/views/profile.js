import { html, icon, $, mount, api, store, setStore, toast, initials, roleTags, ROLE } from '../core.js';
import { passwordForm, wirePasswordForm } from './change-password.js';

export default function profileView({ el }) {
  const u = store.user;
  mount(el, html`
    <div class="page-head"><div><h1>โปรไฟล์ของฉัน</h1><p>ข้อมูลบัญชี อีเมลรับแจ้งเตือน และรหัสผ่าน</p></div></div>
    <div class="grid-2">
      <div class="stack">
        <section class="card card-pad stack">
          <div class="row" style="gap:16px">
            <span class="avatar" style="width:64px;height:64px;font-size:22px" aria-hidden="true">${initials(u.name)}</span>
            <div><h2 style="font-size:20px">${u.name}</h2><div class="small muted"><span class="mono">${u.empId}</span>${u.department ? ` · ${u.department}` : ''}</div>
              <div class="row wrap" style="gap:4px;margin-top:6px">${u.roles.length ? roleTags(u.roles) : html`<span class="tag">ผู้ใช้ทั่วไป</span>`}</div></div>
          </div>
          ${u.roles.length ? html`<ul class="next-steps">${u.roles.map((r) => html`<li><span class="ns-ic">${icon('check')}</span>${ROLE[r]?.label}: ${ROLE[r]?.desc}</li>`)}</ul>` : ''}
        </section>
        <section class="card card-pad">
          <form id="email-form" class="stack" novalidate>
            <h2 style="font-size:17px">อีเมลรับแจ้งเตือน</h2>
            <div class="field">
              <label class="label" for="pf-email">อีเมล</label>
              <input class="input" id="pf-email" type="email" value="${u.email}" placeholder="name@wesco.com" autocomplete="email">
              <p class="help">${store.settings.emailEnabled ? 'ระบบจะส่งอีเมลแจ้งเตือนเมื่อมีคำขอที่เกี่ยวข้องกับคุณ' : 'ขณะนี้ระบบแจ้งเตือนผ่านกระดิ่งในเว็บ (ยังไม่ได้เปิดส่งอีเมล)'}</p>
            </div>
            <div><button class="btn btn-soft" type="submit">${icon('check')}บันทึกอีเมล</button></div>
          </form>
        </section>
      </div>
      <section class="card card-pad stack">
        <h2 style="font-size:17px">เปลี่ยนรหัสผ่าน</h2>
        ${passwordForm('pf')}
      </section>
    </div>`);

  $('#email-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { user } = await api('/auth/profile', { method: 'PATCH', body: { email: $('#pf-email', el).value.trim() } });
      setStore({ user });
      toast('บันทึกอีเมลแล้ว');
    } catch (ex) {
      toast(ex.message, 'err');
    }
  });
  wirePasswordForm(el, 'pf', () => toast('เปลี่ยนรหัสผ่านเรียบร้อย'));
}
