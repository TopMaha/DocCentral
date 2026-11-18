// ตารางเลือกผู้อนุมัติตามตำแหน่ง — ใช้ทั้งหน้ายื่นคำขอ (ผู้ขอเลือก) และหน้ารายละเอียดคำขอ (Admin ส่งต่อ/แก้ไข)
// ติ๊กตำแหน่งที่ต้องอนุมัติ แล้วเลือกคนที่ดำรงตำแหน่งนั้น
import { html, icon, $$, api } from './core.js';

/** [{ code, label, approvers: [{ id, name, department }] }] */
export const loadPositions = () => api('/meta/approvers').then((r) => r.positions);

/**
 * @param positions ผลจาก loadPositions()
 * @param opts.requesterId ผู้ขอ (เลือกเป็นผู้อนุมัติไม่ได้)
 * @param opts.selected [{ position, approverId, status? }] ค่าที่เลือกไว้แล้ว
 */
export function approverPicker(positions, { requesterId, selected = [] } = {}) {
  const sel = new Map(selected.map((a) => [a.position, a]));
  return html`<ul class="appr-list">${positions.map((p) => {
    const people = p.approvers.filter((x) => x.id !== requesterId);
    const cur = sel.get(p.code);
    const none = !people.length;
    const on = !!cur && !none;
    const chosen = people.some((x) => x.id === cur?.approverId) ? cur.approverId : people[0]?.id;
    const why = p.approvers.length ? 'คุณดำรงตำแหน่งนี้เอง — อนุมัติคำขอของตัวเองไม่ได้' : 'ยังไม่ได้กำหนดผู้ดำรงตำแหน่งนี้ (Admin ตั้งได้ที่จัดการผู้ใช้)';
    return html`<li class="appr-row ${on ? 'on' : ''} ${none ? 'empty' : ''}" data-row="${p.code}">
      <label class="appr-check">
        <input type="checkbox" name="appr-pos" value="${p.code}" ${on ? 'checked' : ''} ${none ? 'disabled' : ''}>
        <span>${p.label}</span>
      </label>
      <div class="appr-who">
        ${none ? html`<span class="small muted">${why}</span>` : html`
          <label class="sr-only" for="appr-${p.code}">ผู้อนุมัติตำแหน่ง ${p.label}</label>
          <select class="select" id="appr-${p.code}" data-pos="${p.code}" ${on ? '' : 'disabled'}>
            ${people.map((x) => html`<option value="${x.id}" ${x.id === chosen ? 'selected' : ''}>${x.name}${x.department ? ` · ${x.department}` : ''}</option>`)}
          </select>`}
        ${cur?.status === 'APPROVED' && on ? html`<span class="tag tag-green appr-done" title="ถ้าเปลี่ยนคน ต้องอนุมัติใหม่">${icon('check', 'ic-sm')}อนุมัติแล้ว</span>` : ''}
      </div>
    </li>`;
  })}</ul>`;
}

/** เปิด/ปิดช่องเลือกคนตามการติ๊กตำแหน่ง */
export function wirePicker(root, onChange = () => {}) {
  root.addEventListener('change', (e) => {
    const cb = e.target.closest('input[name=appr-pos]');
    if (cb) {
      const row = cb.closest('.appr-row');
      row.classList.toggle('on', cb.checked);
      const s = row.querySelector('select');
      if (s) s.disabled = !cb.checked;
    }
    if (e.target.closest('input[name=appr-pos], select[data-pos]')) onChange(readPicker(root));
  });
}

/** [{ position, approverId, name }] ของตำแหน่งที่ติ๊กไว้ */
export function readPicker(root) {
  return $$('input[name=appr-pos]:checked', root).map((cb) => {
    const s = root.querySelector(`select[data-pos="${cb.value}"]`);
    return { position: cb.value, approverId: Number(s?.value) || null, name: s?.selectedOptions[0]?.text.split(' · ')[0] || '' };
  });
}
