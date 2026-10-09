import { html, icon, $, mount, api, setStore, store, toast } from '../core.js';

/** ใช้ทั้งหน้าบังคับเปลี่ยนรหัสครั้งแรก และในหน้าโปรไฟล์ */
export function passwordForm(idPrefix = 'pw') {
  return html`
  <form id="${idPrefix}-form" class="stack" novalidate>
    <div class="notice notice-err" id="${idPrefix}-err" role="alert" hidden></div>
    <div class="field">
      <label class="label" for="${idPrefix}-current">รหัสผ่านปัจจุบัน <span class="req">*</span></label>
      <input class="input" id="${idPrefix}-current" type="password" autocomplete="current-password" required>
    </div>
    <div class="field">
      <label class="label" for="${idPrefix}-next">รหัสผ่านใหม่ <span class="req">*</span></label>
      <input class="input" id="${idPrefix}-next" type="password" autocomplete="new-password" minlength="8" required aria-describedby="${idPrefix}-hint">
      <p class="help" id="${idPrefix}-hint">อย่างน้อย 8 ตัวอักษร ควรผสมตัวอักษรและตัวเลข</p>
    </div>
    <div class="field">
      <label class="label" for="${idPrefix}-confirm">ยืนยันรหัสผ่านใหม่ <span class="req">*</span></label>
      <input class="input" id="${idPrefix}-confirm" type="password" autocomplete="new-password" required>
    </div>
    <button class="btn btn-primary btn-block" type="submit">${icon('key-round')}บันทึกรหัสผ่านใหม่</button>
  </form>`;
}

export function wirePasswordForm(root, idPrefix, onDone) {
  const form = $(`#${idPrefix}-form`, root);
  const err = $(`#${idPrefix}-err`, root);
  const f = (k) => $(`#${idPrefix}-${k}`, root);
  const showErr = (msg, input) => {
    err.hidden = false;
    mount(err, html`${icon('circle-alert')}<span>${msg}</span>`);
    input?.focus();
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const current = f('current').value;
    const next = f('next').value;
    if (!current) return showErr('กรุณากรอกรหัสผ่านปัจจุบัน', f('current'));
    if (next.length < 8) return showErr('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', f('next'));
    if (next !== f('confirm').value) return showErr('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน', f('confirm'));
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const { user } = await api('/auth/change-password', { method: 'POST', body: { current, next } });
      setStore({ user });
      form.reset();
      onDone?.(user);
    } catch (ex) {
      showErr(ex.message, ex.code === 'BAD_CURRENT' ? f('current') : f('next'));
    } finally {
      btn.disabled = false;
    }
    return undefined;
  });
}

export default function changePasswordView({ el, navigate }) {
  const u = store.user;
  mount(el, html`
  <div class="auth" style="grid-template-columns:1fr">
    <section class="auth-panel" style="align-items:center">
      <div class="auth-card card card-pad" style="max-width:460px">
        <img class="logo" src="/assets/wesco-logo.png" alt="Wesco" width="80" height="61" style="height:60px">
        <div>
          <h2 style="font-size:22px">ตั้งรหัสผ่านใหม่</h2>
          <p class="sub">สวัสดี ${u?.name} — เพื่อความปลอดภัย กรุณาเปลี่ยนรหัสผ่านชั่วคราวก่อนเริ่มใช้งาน</p>
        </div>
        ${passwordForm('cp')}
        <button class="btn btn-ghost btn-block" data-logout>${icon('log-out')}ออกจากระบบ</button>
      </div>
    </section>
  </div>`);
  $('#cp-current', el).focus({ preventScroll: true });
  wirePasswordForm(el, 'cp', (user) => {
    toast(`ตั้งรหัสผ่านใหม่เรียบร้อย ยินดีต้อนรับ ${user.name}`);
    navigate('#/dashboard');
  });
}
