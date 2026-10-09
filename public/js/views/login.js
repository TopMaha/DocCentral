import { html, icon, $, mount, api, setStore, store, toast } from '../core.js';

const features = [
  ['file-plus', 'ลงทะเบียน · แก้ไข · ยกเลิก', 'ยื่นคำขอออนไลน์ ระบบ run เลขเอกสารให้อัตโนมัติ'],
  ['stamp', 'อนุมัติผ่านระบบ', 'แจ้งเตือน Admin และผู้อนุมัติทันทีที่มีคำขอ'],
  ['folder-open', 'ดาวน์โหลดฉบับล่าสุด', 'เอกสารที่ประกาศใช้จัดเก็บใน share folder อัตโนมัติ'],
];

export default function loginView({ el, query, navigate }) {
  mount(el, html`
  <div class="auth">
    <section class="auth-brand" aria-hidden="false">
      <div class="motif" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="auth-brand-inner">
        <span class="eyebrow">${icon('shield-check', 'ic-sm')} Document Control Center</span>
        <h1>ระบบควบคุมเอกสาร<br>Wesco Thailand</h1>
        <p>ลงทะเบียน แก้ไข และยกเลิกเอกสาร พร้อมติดตามการอนุมัติได้ทุกขั้นตอน ทั้งบนมือถือและคอมพิวเตอร์</p>
        <ul class="auth-features">
          ${features.map(([ic, t, d]) => html`<li><span class="f-ic">${icon(ic)}</span><span><b>${t}</b><span>${d}</span></span></li>`)}
        </ul>
      </div>
    </section>

    <section class="auth-panel">
      <div class="auth-card">
        <img class="logo" src="/assets/wesco-logo.png" alt="Wesco" width="110" height="84">
        <div>
          <h2>เข้าสู่ระบบ</h2>
          <p class="sub">ใช้รหัสพนักงานและรหัสผ่านของคุณ</p>
        </div>

        <form id="login-form" class="stack" novalidate>
          <div class="notice notice-err" id="login-err" role="alert" hidden></div>
          <div class="field">
            <label class="label" for="empId">รหัสพนักงาน</label>
            <div class="input-wrap">
              ${icon('user')}
              <input class="input" id="empId" name="empId" autocomplete="username" autocapitalize="characters"
                     placeholder="เช่น T-815" required spellcheck="false">
            </div>
          </div>
          <div class="field">
            <label class="label" for="password">รหัสผ่าน</label>
            <div class="input-wrap has-action">
              ${icon('lock')}
              <input class="input" id="password" name="password" type="password" autocomplete="current-password" required>
              <button type="button" class="input-action" id="toggle-pw" aria-label="แสดงรหัสผ่าน" aria-pressed="false">${icon('eye')}</button>
            </div>
          </div>
          <label class="check"><input type="checkbox" name="remember" id="remember"> จดจำการเข้าสู่ระบบบนอุปกรณ์นี้</label>
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-busy="กำลังเข้าสู่ระบบ…">${icon('log-in')}เข้าสู่ระบบ</button>
          <p class="help" style="text-align:center">ลืมรหัสผ่าน? ติดต่อ Admin ฝ่าย DCC เพื่อรีเซ็ตรหัสผ่าน</p>
        </form>

        ${store.settings.publicLibrary ? html`
          <div class="divider">หรือ</div>
          <a class="btn btn-soft btn-block" href="#/library">${icon('download')}ดาวน์โหลดเอกสารโดยไม่ต้องเข้าสู่ระบบ</a>` : ''}
      </div>
    </section>
  </div>`);

  const form = $('#login-form', el);
  const err = $('#login-err', el);
  const pw = $('#password', el);
  $('#empId', el).focus({ preventScroll: true });

  $('#toggle-pw', el).addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    btn.innerHTML = String(icon(show ? 'eye-off' : 'eye'));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const empId = form.empId.value.trim();
    const password = pw.value;
    err.hidden = true;
    if (!empId || !password) {
      err.hidden = false;
      mount(err, html`${icon('circle-alert')}<span>กรุณากรอกรหัสพนักงานและรหัสผ่าน</span>`);
      (empId ? pw : form.empId).focus();
      return;
    }
    const btn = form.querySelector('[type=submit]');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>กำลังเข้าสู่ระบบ…</span>';
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: { empId, password, remember: form.remember.checked } });
      setStore({ user });
      if (user.mustChangePw) {
        navigate('#/change-password');
      } else {
        toast(`ยินดีต้อนรับ ${user.name}`);
        navigate(query.next ? `#${query.next}` : '#/dashboard');
      }
    } catch (ex) {
      err.hidden = false;
      mount(err, html`${icon('circle-alert')}<span>${ex.message}</span>`);
      pw.select();
      pw.focus();
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
}
