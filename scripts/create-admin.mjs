// สร้าง (หรือรีเซ็ต) บัญชี Admin คนแรกใน D1
//   npm run admin:local     → ฐานข้อมูลจำลองในเครื่อง (wrangler dev)
//   npm run admin:remote    → D1 จริงบน Cloudflare
// รหัสผ่านชั่วคราวจะถูกเขียนไว้ที่ .admin-password.txt (อยู่ใน .gitignore) และต้องเปลี่ยนเมื่อเข้าระบบครั้งแรก
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword, tempPassword } from '../src/lib/crypto.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const target = args.includes('--remote') ? '--remote' : '--local';
const get = (flag, d) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : d; };

const empId = get('--emp', 'T-815').toUpperCase();
const name = get('--name', 'วิภาวัส จันทะคาม');
const dept = get('--dept', 'DCC');
const iterations = Number(get('--iterations', process.env.PBKDF2_ITERATIONS || 100000));
const password = tempPassword(10);
const hash = await hashPassword(password, iterations);

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `INSERT INTO users (emp_id, name, department, password_hash, roles, must_change_pw)
VALUES (${q(empId)}, ${q(name)}, ${q(dept)}, ${q(hash)}, 'admin,approver,dcc', 1)
ON CONFLICT(emp_id) DO UPDATE SET password_hash = excluded.password_hash, must_change_pw = 1, active = 1,
  roles = CASE WHEN (',' || roles || ',') LIKE '%,admin,%' THEN roles ELSE 'admin,' || roles END;`;

const file = path.join(ROOT, '.admin-seed.sql');
fs.writeFileSync(file, sql, 'utf8');
try {
  // ใช้ path แบบ relative (cwd = ROOT) เพราะ path ที่มีช่องว่างจะพังเมื่อเรียกผ่าน shell บน Windows
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, '--file', path.basename(file), '--yes'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
} finally {
  fs.rmSync(file, { force: true });
}
const out = path.join(ROOT, `.admin-password${target === '--remote' ? '' : '.local'}.txt`);
fs.writeFileSync(out, `${empId}\n${password}\n`, 'utf8');
console.log(`\n✔ Admin ${empId} (${name}) พร้อมใช้งาน — รหัสผ่านชั่วคราวอยู่ในไฟล์ ${path.basename(out)}\n  ระบบจะบังคับเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก`);
