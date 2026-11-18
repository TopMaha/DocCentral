// ตำแหน่งผู้อนุมัติ — ลำดับนี้คือลำดับที่แสดงในหน้าเว็บ (ต้องตรงกับ POSITION ใน public/js/core.js)
export const POSITIONS = {
  QA_MGR: 'QA Manager',
  ENG_MGR: 'ENG Manager',
  PRD_MGR: 'Production Manager',
  MAT_MGR: 'Material Manager',
  GM: 'General Manager',
};
export const POSITION_CODES = Object.keys(POSITIONS);

/** '' = คำขอเดิมก่อนมีระบบตำแหน่ง */
export const positionLabel = (code) => POSITIONS[code] || 'ผู้อนุมัติ';
export const positionOrder = (code) => POSITION_CODES.indexOf(code);

export const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
export const positionsOf = (user) => splitList(user?.positions).filter((p) => POSITIONS[p]);

export function cleanPositions(list) {
  const arr = Array.isArray(list) ? list : splitList(list);
  const set = new Set(arr.map((x) => String(x).trim()));
  return POSITION_CODES.filter((p) => set.has(p));
}
