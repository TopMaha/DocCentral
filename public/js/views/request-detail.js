import {
  html, icon, $, mount, api, store, toast, confirmDialog, withBusy, updateBadges,
  docNo, fileExt, fmtDate, fmtDateTime, fmtSize, revText, statusPill, emptyState, errorState,
  TYPE, todayISO, initials,
} from '../core.js';

const LOG = {
  SUBMIT: ['send', 'ส่งคำขอ', 'info'],
  FORWARD: ['send', 'Admin ตรวจสอบแล้ว ส่งต่อผู้อนุมัติ', 'ok'],
  REASSIGN: ['users', 'เปลี่ยนผู้อนุมัติ', 'info'],
  APPROVE: ['stamp', 'อนุมัติ', 'ok'],
  REJECT: ['circle-x', 'ไม่อนุมัติ', 'bad'],
  WITHDRAW: ['undo-2', 'ผู้ขอยกเลิกคำขอ', 'bad'],
  DCN: ['hash', 'Run DCN No.', 'ok'],
  PUBLISH: ['circle-check', 'ประกาศใช้เอกสาร', 'ok'],
};

function steps(r, logs) {
  const reachedApproval = !!r.approver;
  const order = { PENDING_REVIEW: 1, PENDING_APPROVAL: 2, APPROVED: 3, PUBLISHED: 4 };
  let at = order[r.status];
  let failedAt = null;
  if (r.status === 'REJECTED' || r.status === 'WITHDRAWN') {
    failedAt = reachedApproval ? 2 : 1;
    at = failedAt;
  }
  const failLabel = r.status === 'REJECTED' ? 'ไม่อนุมัติ' : 'ยกเลิกคำขอ';
  const when = (a) => logs.filter((l) => l.action === a).pop()?.at;
  const defs = [
    { icon: 'send', label: 'ส่งคำขอ', sub: fmtDate(r.createdAt) },
    { icon: 'clipboard-list', label: 'Admin ตรวจสอบ', sub: when('FORWARD') ? fmtDate(when('FORWARD')) : '' },
    { icon: 'stamp', label: 'อนุมัติ', sub: r.approver?.name || '' },
    { icon: 'hash', label: r.type === 'CANCEL' ? 'DCC ยกเลิกใช้' : 'DCC ประกาศใช้', sub: r.dcnNo || '' },
  ];
  return html`<ol class="tracker" aria-label="ขั้นตอนของคำขอ">${defs.map((d, i) => {
    let cls = '';
    let ic = d.icon;
    let label = d.label;
    if (i === 0 || i < at || r.status === 'PUBLISHED') { cls = 'done'; ic = 'check'; }
    else if (failedAt === i) { cls = 'failed'; ic = 'x'; label = failLabel; }
    else if (i === at && !failedAt) cls = 'current';
    return html`<li class="step ${cls}" ${cls === 'current' ? 'aria-current="step"' : ''}>
      <span class="dot">${icon(ic)}</span><span class="step-label">${label}</span>${d.sub ? html`<span class="step-sub">${d.sub}</span>` : ''}
    </li>`;
  })}</ol>`;
}

function revChange(r) {
  if (r.type === 'NEW') return html`<span class="rev">Rev.00</span><span class="tag tag-green">ใหม่</span>`;
  if (r.type === 'REVISE') return html`<span class="rev-change"><span class="rev">${revText(r.fromRev)}</span>${icon('arrow-right', 'ic-sm')}<span class="rev" style="background:var(--green-50);border-color:var(--green-200);color:var(--green-800)">${revText(r.toRev)}</span></span>`;
  return html`<span class="rev-change"><span class="rev">${revText(r.fromRev)}</span>${icon('arrow-right', 'ic-sm')}<span class="tag tag-red">ยกเลิก</span></span>`;
}

function filesFlow(r) {
  const f = store.settings.folders || { controlled: '01_Controlled', obsolete: '02_Obsolete' };
  const folder = `TH-${r.category}`;
  const rows = [];
  if (r.type !== 'CANCEL') rows.push(html`<div class="ff">${icon('folder-open')}<span>ไฟล์ ${revText(r.type === 'NEW' ? 0 : r.toRev)} → <code>${f.controlled}/${folder}/</code></span></div>`);
  if (r.type !== 'NEW') rows.push(html`<div class="ff">${icon('folder-archive')}<span>ฉบับเดิม ${revText(r.fromRev)} → <code>${f.obsolete}/${folder}/</code></span></div>`);
  return html`<div class="flow-files">${rows}</div>`;
}

export default async function requestDetailView({ el, params, isCurrent }) {
  let approvers = null;

  async function load() {
    mount(el, html`<div class="card card-pad" aria-busy="true">${Array.from({ length: 6 }, () => html`<div class="skeleton sk-line" style="height:18px;margin:16px 0"></div>`)}</div>`);
    try {
      const data = await api(`/requests/${params.id}`);
      if (isCurrent()) render(data);
    } catch (err) {
      if (!isCurrent()) return;
      if (err.status === 404) {
        mount(el, html`<div class="card">${emptyState({ iconName: 'file-search', title: 'ไม่พบคำขอ', text: 'คำขอนี้อาจไม่มีอยู่ หรือคุณไม่มีสิทธิ์ดู', action: html`<a class="btn btn-soft" href="#/requests">กลับไปคำขอของฉัน</a>` })}</div>`);
      } else {
        mount(el, errorState(err));
        $('[data-retry]', el)?.addEventListener('click', load);
      }
    }
  }

  async function act(btn, path, body, okMsg) {
    await withBusy(btn, async () => {
      try {
        const data = await api(`/requests/${params.id}/${path}`, { method: 'POST', body });
        toast(okMsg);
        updateBadges();
        if (isCurrent()) render(data);
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  }

  function actionPanel(r) {
    const a = r.actions;
    const blocks = [];

    if (a.includes('forward')) {
      blocks.push(html`<section class="card card-pad action-card stack" aria-labelledby="ac-forward">
        <div class="ac-head"><span class="ac-icon">${icon('clipboard-list')}</span><div><h2 id="ac-forward" style="font-size:17px">ตรวจสอบคำขอ (Admin)</h2><p class="small muted">ตรวจสอบความครบถ้วน แล้วส่งต่อให้ผู้อนุมัติ</p></div></div>
        <div class="field">
          <label class="label" for="approver">ผู้อนุมัติ <span class="req">*</span></label>
          <select class="select" id="approver"><option value="">กำลังโหลด…</option></select>
          <div class="error-text" id="err-approver" hidden></div>
        </div>
        <div class="field">
          <label class="label" for="fw-comment">หมายเหตุถึงผู้อนุมัติ (ถ้ามี)</label>
          <textarea class="textarea" id="fw-comment" rows="2" style="min-height:76px"></textarea>
        </div>
        <div class="action-buttons">
          <button class="btn btn-primary" id="btn-forward" data-busy="กำลังส่งต่อ…">${icon('send')}ส่งต่อผู้อนุมัติ</button>
          ${a.includes('reject') ? html`<button class="btn btn-danger" id="btn-reject">${icon('circle-x')}ไม่ผ่าน · ส่งคืนผู้ขอ</button>` : ''}
        </div>
      </section>`);
    }

    if (a.includes('approve')) {
      blocks.push(html`<section class="card card-pad action-card stack" aria-labelledby="ac-approve">
        <div class="ac-head"><span class="ac-icon">${icon('stamp')}</span><div><h2 id="ac-approve" style="font-size:17px">พิจารณาอนุมัติ</h2><p class="small muted">คุณได้รับมอบหมายให้อนุมัติคำขอนี้</p></div></div>
        <div class="field">
          <label class="label" for="ap-comment">ความเห็น (ถ้ามี)</label>
          <textarea class="textarea" id="ap-comment" rows="2" style="min-height:76px"></textarea>
        </div>
        <div class="action-buttons">
          <button class="btn btn-primary" id="btn-approve" data-busy="กำลังอนุมัติ…">${icon('circle-check')}อนุมัติ</button>
          <button class="btn btn-danger" id="btn-reject">${icon('circle-x')}ไม่อนุมัติ</button>
        </div>
      </section>`);
    }

    if (a.includes('dcn')) {
      blocks.push(html`<section class="card card-pad action-card stack" aria-labelledby="ac-dcn">
        <div class="ac-head"><span class="ac-icon">${icon('hash')}</span><div><h2 id="ac-dcn" style="font-size:17px">Run DCN No.</h2><p class="small muted">คำขอได้รับการอนุมัติแล้ว — ออกเลข Document Change Notice ก่อนประกาศใช้</p></div></div>
        <div class="action-buttons"><button class="btn btn-primary btn-lg" id="btn-dcn" data-busy="กำลังออกเลข…">${icon('hash')}Run DCN No.</button></div>
      </section>`);
    }

    if (a.includes('publish')) {
      blocks.push(html`<section class="card card-pad action-card stack" aria-labelledby="ac-pub">
        <div class="ac-head"><span class="ac-icon">${icon('badge-check')}</span><div><h2 id="ac-pub" style="font-size:17px">${r.type === 'CANCEL' ? 'ประกาศยกเลิกเอกสาร' : 'ประกาศใช้เอกสาร (Publish)'}</h2><p class="small muted">ระบบจะย้ายไฟล์เข้า share folder ให้อัตโนมัติ</p></div></div>
        <div class="dcn-display">${icon('hash', 'ic-lg')}<div><div class="xs muted">DCN No.</div><div class="mono">${r.dcnNo}</div></div></div>
        <div class="field" style="max-width:260px">
          <label class="label" for="eff-date">วันที่มีผลบังคับใช้</label>
          <input class="input" id="eff-date" type="date" value="${todayISO()}">
        </div>
        ${filesFlow(r)}
        <div class="action-buttons"><button class="btn btn-primary btn-lg" id="btn-publish" data-busy="กำลังประกาศใช้…">${icon('badge-check')}${r.type === 'CANCEL' ? 'ยืนยันยกเลิกเอกสาร' : 'Publish เอกสาร'}</button></div>
      </section>`);
    }

    if (a.includes('reassign')) {
      blocks.push(html`<section class="card card-pad stack" aria-labelledby="ac-re">
        <h2 id="ac-re" style="font-size:16px">เปลี่ยนผู้อนุมัติ (Admin)</h2>
        <div class="row wrap" style="align-items:flex-end">
          <div class="field grow" style="min-width:200px"><label class="label" for="approver">ผู้อนุมัติใหม่</label>
            <select class="select" id="approver"><option value="">กำลังโหลด…</option></select></div>
          <button class="btn" id="btn-forward" data-busy="กำลังบันทึก…">${icon('users')}เปลี่ยนผู้อนุมัติ</button>
        </div>
        <div class="error-text" id="err-approver" hidden></div>
      </section>`);
    }
    return blocks;
  }

  function render({ request: r, logs }) {
    const t = TYPE[r.type];
    const mine = r.requester.id === store.user.id;

    mount(el, html`
      <a class="back-link" href="#/requests">${icon('arrow-left', 'ic-sm')}คำขอทั้งหมด</a>
      <div class="stack" style="gap:20px">
        <section class="card card-pad stack">
          <div class="row wrap between" style="gap:10px">
            <div class="row wrap" style="gap:8px"><span class="li-icon t-${r.type}" aria-hidden="true">${icon(t.icon)}</span>
              <div><div class="small muted">${t.label}</div><div class="mono" style="font-weight:600">${r.reqNo}</div></div></div>
            ${statusPill(r.status)}
          </div>
          <div>
            <div class="row wrap" style="gap:8px;margin-bottom:8px">${docNo(r.docNo, 'lg')}${revChange(r)}</div>
            <h1 style="font-size:22px;line-height:1.4">${r.title}</h1>
          </div>
          <div style="padding-top:8px">${steps(r, logs)}</div>
        </section>

        ${r.status === 'REJECTED' ? html`<div class="notice notice-err">${icon('circle-x')}<div><b>ไม่อนุมัติ</b> — ${logs.filter((l) => l.action === 'REJECT').pop()?.comment || ''}
          ${mine ? html`<div style="margin-top:6px"><a href="#/requests/new?type=${r.type}${r.documentId ? `&doc=${r.documentId}` : ''}${r.type === 'NEW' ? `&category=${r.category}` : ''}">ยื่นคำขอใหม่อีกครั้ง →</a></div>` : ''}</div></div>` : ''}
        ${r.status === 'PUBLISHED' && r.documentId ? html`<div class="notice notice-ok">${icon('circle-check')}<div>
          ${r.type === 'CANCEL' ? html`ยกเลิกการใช้เอกสารแล้ว และย้ายไปเก็บที่โฟลเดอร์ Obsolete` : html`ประกาศใช้แล้ว มีผล ${fmtDate(r.effectiveDate)} — <a href="#/library?doc=${r.documentId}">ดูในคลังเอกสาร</a>`}</div></div>` : ''}
        ${r.status === 'APPROVED' && !r.actions.length ? html`<div class="notice notice-info">${icon('info')}<div>อนุมัติแล้ว รอ DCC ${r.dcnNo ? `ประกาศใช้ (${r.dcnNo})` : 'run DCN No. และประกาศใช้'}</div></div>` : ''}

        ${actionPanel(r)}

        <div class="grid-2">
          <div class="stack">
            <section class="card card-pad stack" aria-labelledby="h-info">
              <h2 id="h-info" style="font-size:17px">รายละเอียดคำขอ</h2>
              <dl class="dl">
                <div><dt>ผู้ขอลงทะเบียน</dt><dd><span class="row" style="gap:8px"><span class="avatar sm" aria-hidden="true">${initials(r.requester.name)}</span><span>${r.requester.name}<br><span class="xs muted mono">${r.requester.empId}</span></span></span></dd></div>
                <div><dt>แผนก</dt><dd>${r.requester.department || '—'}</dd></div>
                <div><dt>หมวดเอกสาร</dt><dd>${r.category} · ${r.categoryName || ''}</dd></div>
                <div><dt>วันที่ยื่น</dt><dd>${fmtDateTime(r.createdAt)}</dd></div>
                <div><dt>ผู้อนุมัติ</dt><dd>${r.approver?.name || html`<span class="muted">รอ Admin มอบหมาย</span>`}</dd></div>
                <div><dt>DCN No.</dt><dd class="mono">${r.dcnNo || '—'}</dd></div>
                ${r.effectiveDate ? html`<div><dt>วันที่มีผล</dt><dd>${fmtDate(r.effectiveDate)}</dd></div>` : ''}
              </dl>
              <div>
                <h3 class="section-title" style="margin-bottom:8px">เหตุผลในการเปลี่ยนแปลง</h3>
                <div class="reason">${r.reason}</div>
              </div>
              ${r.file ? html`<div>
                <h3 class="section-title" style="margin-bottom:8px">ไฟล์แนบ</h3>
                <div class="file-card">${fileExt(r.file.ext)}
                  <div class="grow"><div class="file-name">${r.file.name}</div><div class="xs muted">${fmtSize(r.file.size)}</div></div>
                </div>
                <div class="action-buttons" style="margin-top:10px">
                  <a class="btn btn-soft btn-sm" href="/api/requests/${r.id}/file" download>${icon('download', 'ic-sm')}ดาวน์โหลด</a>
                  ${['pdf', 'png', 'jpg', 'jpeg'].includes(r.file.ext) ? html`<a class="btn btn-sm" href="/api/requests/${r.id}/file?inline=1" target="_blank" rel="noopener">${icon('external-link', 'ic-sm')}เปิดดู</a>` : ''}
                </div>
              </div>` : r.type === 'CANCEL' ? html`<p class="small muted">${icon('info', 'ic-sm')} คำขอยกเลิกเอกสาร ไม่ต้องแนบไฟล์</p>` : ''}
            </section>
            ${r.actions.includes('withdraw') ? html`<section class="card card-pad row wrap between">
              <div><b>ต้องการยกเลิกคำขอนี้?</b><p class="small muted">ยกเลิกได้จนกว่าจะได้รับการอนุมัติ${r.type === 'NEW' ? ' — เลขที่จองไว้จะถูกปล่อยคืน' : ''}</p></div>
              <button class="btn btn-danger" id="btn-withdraw" data-busy="กำลังยกเลิก…">${icon('undo-2')}ยกเลิกคำขอ</button>
            </section>` : ''}
          </div>

          <section class="card card-pad" aria-labelledby="h-log">
            <h2 id="h-log" style="font-size:17px;margin-bottom:16px">ประวัติการดำเนินการ</h2>
            <ol class="timeline">
              ${logs.map((l) => {
                const [ic, label, tone] = LOG[l.action] || ['info', l.action, ''];
                const text = l.action === 'PUBLISH' && r.type === 'CANCEL' ? 'ประกาศยกเลิกเอกสาร' : label;
                return html`<li><span class="tl-dot ${tone}">${icon(ic)}</span>
                  <div class="tl-body"><div><b>${text}</b></div>
                    <div class="xs muted">${l.actor || 'ระบบ'} · ${fmtDateTime(l.at)}</div>
                    ${l.comment && l.action !== 'SUBMIT' ? html`<div class="tl-comment">${l.comment}</div>` : ''}
                  </div></li>`;
              })}
            </ol>
          </section>
        </div>
      </div>`);

    wire(r);
  }

  async function fillApprovers(r) {
    const sel = $('#approver', el);
    if (!sel) return;
    try {
      approvers ??= (await api('/meta/approvers')).approvers;
    } catch (err) {
      mount(sel, html`<option value="">โหลดรายชื่อไม่สำเร็จ</option>`);
      return;
    }
    const usable = approvers.filter((x) => x.id !== r.requester.id);
    mount(sel, html`<option value="">— เลือกผู้อนุมัติ —</option>
      ${usable.map((x) => html`<option value="${x.id}" ${r.approver?.id === x.id ? 'selected' : ''}>${x.name}</option>`)}`);
    if (!usable.length) {
      const err = $('#err-approver', el);
      err.hidden = false;
      mount(err, html`${icon('circle-alert', 'ic-sm')}<span>ยังไม่มีผู้ใช้ที่มีสิทธิ์ผู้อนุมัติ (นอกจากผู้ขอ) — เพิ่มได้ที่เมนูจัดการผู้ใช้</span>`);
    }
  }

  function wire(r) {
    fillApprovers(r);
    $('#btn-forward', el)?.addEventListener('click', (e) => {
      const sel = $('#approver', el);
      if (!sel.value) {
        const err = $('#err-approver', el);
        err.hidden = false;
        mount(err, html`${icon('circle-alert', 'ic-sm')}<span>กรุณาเลือกผู้อนุมัติ</span>`);
        sel.setAttribute('aria-invalid', 'true');
        sel.focus();
        return;
      }
      const name = sel.options[sel.selectedIndex].text;
      act(e.currentTarget, 'forward', { approverId: Number(sel.value), comment: $('#fw-comment', el)?.value || '' },
        r.status === 'PENDING_APPROVAL' ? `เปลี่ยนผู้อนุมัติเป็น ${name} แล้ว` : `ส่งต่อให้ ${name} แล้ว — แจ้งเตือนผู้อนุมัติเรียบร้อย`);
    });
    $('#btn-approve', el)?.addEventListener('click', (e) => {
      act(e.currentTarget, 'approve', { comment: $('#ap-comment', el).value }, 'อนุมัติแล้ว — แจ้งเตือน DCC ให้ run DCN No. เรียบร้อย');
    });
    $('#btn-reject', el)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const res = await confirmDialog({
        title: 'ไม่อนุมัติคำขอนี้?',
        message: `${r.reqNo} · ${r.docNo} ${r.title}`,
        confirmText: 'ยืนยันไม่อนุมัติ',
        danger: true,
        input: { label: 'เหตุผลที่ไม่อนุมัติ', required: true, placeholder: 'แจ้งผู้ขอว่าต้องแก้ไขอะไร' },
      });
      if (res) act(btn, 'reject', { comment: res.value }, 'บันทึกไม่อนุมัติแล้ว — แจ้งผู้ขอเรียบร้อย');
    });
    $('#btn-dcn', el)?.addEventListener('click', (e) => act(e.currentTarget, 'dcn', {}, 'ออกเลข DCN เรียบร้อย'));
    $('#btn-publish', el)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const eff = $('#eff-date', el).value || todayISO();
      const ok = await confirmDialog({
        title: r.type === 'CANCEL' ? 'ยืนยันยกเลิกการใช้เอกสาร' : 'ยืนยันประกาศใช้เอกสาร',
        message: html`<div class="stack-sm"><div class="row wrap" style="gap:6px">${docNo(r.docNo)}${revChange(r)}</div>
          <div style="color:var(--ink)">${r.title}</div><div class="small">${r.dcnNo} · มีผล ${fmtDate(eff)}</div>${filesFlow(r)}</div>`,
        confirmText: r.type === 'CANCEL' ? 'ยืนยันยกเลิก' : 'Publish',
        danger: r.type === 'CANCEL',
      });
      if (ok) act(btn, 'publish', { effectiveDate: eff }, r.type === 'CANCEL' ? 'ยกเลิกเอกสารเรียบร้อย' : 'ประกาศใช้เอกสารเรียบร้อย — ไฟล์อยู่ใน share folder แล้ว');
    });
    $('#btn-withdraw', el)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const res = await confirmDialog({
        title: 'ยกเลิกคำขอนี้?',
        message: 'เมื่อยกเลิกแล้วจะไม่สามารถดำเนินการต่อได้ ต้องยื่นคำขอใหม่',
        confirmText: 'ยกเลิกคำขอ',
        danger: true,
        input: { label: 'เหตุผล (ถ้ามี)', required: false },
      });
      if (res) act(btn, 'withdraw', { comment: res.value }, 'ยกเลิกคำขอแล้ว');
    });
  }

  await load();
}
