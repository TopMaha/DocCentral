# Wesco DCC — Document Control Center

ระบบลงทะเบียน แก้ไข (Up Rev.) และยกเลิกเอกสาร พร้อมขั้นตอนอนุมัติ และคลังเอกสารให้ทุกคนดาวน์โหลดฉบับล่าสุด
ใช้งานได้ทั้งมือถือและคอมพิวเตอร์ · ธีมเขียว–ขาว Wesco

**Stack:** Cloudflare Workers · D1 (ฐานข้อมูล SQLite) · R2 (ที่เก็บไฟล์) · หน้าเว็บ Vanilla JS (ไม่ต้อง build framework)

---

## ขั้นตอนการทำงาน

```
ผู้ขอ (ทุกคน)          Admin                 ผู้อนุมัติ              DCC
─────────────          ─────                 ─────────              ───
1. Login
2. เลือกประเภท
   • ลงทะเบียนใหม่
   • แก้ไข (Up Rev.)
   • ยกเลิกเอกสาร
3. ใส่เหตุผล + แนบไฟล์
4. Submit  ──แจ้งเตือน──▶ ตรวจสอบ
                        ส่งต่อผู้อนุมัติ ──แจ้งเตือน──▶ อนุมัติ / ไม่อนุมัติ
                        (หรือส่งคืน)                      │
                                                         └─แจ้งเตือน──▶ Run DCN No.
                                                                        Publish
                                                                          │
     ◀──────────────────────── แจ้งผลทุกขั้นตอน ─────────────────────────┘
```

หลัง Publish ระบบย้ายไฟล์ให้อัตโนมัติ:

| โฟลเดอร์ใน R2 | เก็บอะไร |
|---|---|
| `00_Pending/` | ไฟล์แนบของคำขอที่ยังไม่ประกาศใช้ |
| `01_Controlled/TH-QA/TH-QA-001_Rev03_ชื่อเอกสาร.pdf` | **ฉบับที่ใช้งาน** (share folder ที่ทุกคนดาวน์โหลดได้) |
| `02_Obsolete/TH-QA/TH-QA-001_Rev02_ชื่อเอกสาร.pdf` | ฉบับเก่าที่ถูกแทนที่ / เอกสารที่ยกเลิก |

## เลขที่เอกสาร

| รูปแบบ | ใช้กับ |
|---|---|
| `TH-BP-XXX` | เอกสารที่เป็น procedure |
| `TH-ADM-XXX` | แบบฟอร์มที่เป็นเอกสารทั่วไป |
| `TH-QA-XXX` | แบบฟอร์มของ QA |
| `TH-ENG-XXX` | แบบฟอร์มของ ENG |
| `TH-PRD-XXX` | แบบฟอร์มของ PRD |

- **ลงทะเบียนใหม่:** ระบบ run เลขต่อจากเลขสูงสุดของเอกสารที่มีอยู่ + เลขที่จองไว้ (จองตอน Submit, ถ้าไม่อนุมัติ/ยกเลิกคำขอ เลขจะถูกปล่อยคืน)
- **Up Rev.:** Rev.00 → Rev.01 → … ฉบับเดิมย้ายไป Obsolete
- **DCN No.:** `DCN-2026-001` run ต่อเนื่องรายปี
- **เลขคำขอ:** `REQ-2026-0001`

## สิทธิ์ผู้ใช้

| สิทธิ์ | ทำอะไรได้ |
|---|---|
| ผู้ใช้ทั่วไป | ยื่นคำขอ ติดตามสถานะ ดาวน์โหลดเอกสาร |
| **Admin** | จัดการผู้ใช้ ตรวจสอบคำขอและส่งต่อผู้อนุมัติ ส่งคืนคำขอ |
| **ผู้อนุมัติ** | อนุมัติ / ไม่อนุมัติคำขอที่ได้รับมอบหมาย (อนุมัติคำขอของตัวเองไม่ได้) |
| **DCC** | Run DCN No. · Publish · นำเข้าเอกสารเดิม · ดาวน์โหลดฉบับเก่า |

Admin คนแรก: **T-815 วิภาวัส จันทะคาม** (มีทุกสิทธิ์)

---

## เริ่มใช้งานในเครื่อง (Local)

ต้องมี Node.js 22+

```bash
npm install
npm run setup:local      # build ไอคอน/ฟอนต์ + สร้างตารางใน D1 จำลอง + สร้าง Admin T-815
npm run dev              # http://localhost:8787
```

รหัสผ่านชั่วคราวของ Admin อยู่ในไฟล์ `.admin-password.local.txt` — ระบบจะบังคับเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก

## Deploy ขึ้น Cloudflare

ทรัพยากรที่สร้างไว้แล้ว (ดู `wrangler.jsonc`):

- D1: `doccentral-db` (region APAC)
- R2: `doccentral-files` (region APAC)

```bash
npx wrangler login              # ครั้งแรกเท่านั้น
npm run db:migrate:remote       # สร้าง/อัปเดตตาราง (ทำแล้ว)
npm run admin:remote            # สร้างหรือรีเซ็ตรหัส Admin T-815 → .admin-password.txt
npm run deploy                  # → https://doccentral.<subdomain>.workers.dev
```

## ตั้งค่า (`wrangler.jsonc` → `vars`)

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `PUBLIC_LIBRARY` | `false` | `true` = ดาวน์โหลดเอกสารได้โดยไม่ต้อง login (ระวัง: บน internet คือทุกคนในโลก) |
| `MAX_UPLOAD_MB` | `50` | ขนาดไฟล์สูงสุด |
| `SESSION_HOURS` / `REMEMBER_DAYS` | `12` / `30` | อายุการ login |
| `PBKDF2_ITERATIONS` | `100000` | ความแข็งแรงของ hash รหัสผ่าน (ถ้าใช้ Workers Free แล้ว login error 1102 ให้ลดเหลือ `20000` — ระบบจะ re-hash ให้อัตโนมัติเมื่อผู้ใช้ login) |
| `FOLDER_*` | `00_Pending` / `01_Controlled` / `02_Obsolete` | ชื่อโฟลเดอร์ใน R2 |
| `MAIL_FROM` + secret `RESEND_API_KEY` | ว่าง | เปิดส่งอีเมลแจ้งเตือนผ่าน [Resend](https://resend.com) (`npx wrangler secret put RESEND_API_KEY`) |

ถ้าไม่ตั้งค่าอีเมล ระบบแจ้งเตือนผ่าน **กระดิ่งในเว็บ** (ตัวเลข badge อัปเดตทุก 30 วินาที)

## นำเข้าเอกสารเดิม

เมนู **ผู้ดูแลระบบ → นำเข้าเอกสารเดิม** (สิทธิ์ DCC) — ตั้งชื่อไฟล์แบบ `TH-QA-001_Rev02_ชื่อเอกสาร.xlsx` ระบบจะกรอกเลขที่/Rev/ชื่อให้อัตโนมัติ
ควรนำเข้าเอกสารที่ใช้อยู่ทั้งหมดก่อนเปิดให้ยื่นคำขอใหม่ เพื่อให้ run เลขต่อได้ถูกต้อง

## เปิดดูไฟล์ใน R2 แบบโฟลเดอร์บน Windows (ไม่บังคับ)

ใช้ [rclone](https://rclone.org/) + R2 API token แล้ว `rclone mount r2:doccentral-files Z:` จะเห็น `01_Controlled` / `02_Obsolete` เป็นไดรฟ์ Z:
แนะนำให้ mount แบบ read-only (`--read-only`) เพื่อไม่ให้แก้ไฟล์นอกระบบ

## โครงสร้างโปรเจกต์

```
src/                 Cloudflare Worker (API /api/*)
  index.js           entry + router
  lib/workflow.js    ขั้นตอนคำขอ / run เลข / ย้ายไฟล์ตอน Publish
  lib/auth.js        session cookie, สิทธิ์, กันเดารหัสผ่าน
  lib/files.js       R2: 00_Pending / 01_Controlled / 02_Obsolete
  routes/            auth, documents, requests, meta, users, notifications
migrations/          SQL schema ของ D1
public/              หน้าเว็บ (SPA, hash routing)
  js/views/          login, dashboard, library, request-new, request-detail, users, import, profile
  css/app.css        design tokens เขียว–ขาว จากโลโก้ Wesco (#00AA13)
scripts/
  build-assets.mjs   สร้าง icons.svg (Lucide) + copy ฟอนต์ Prompt / IBM Plex Sans Thai
  create-admin.mjs   สร้าง/รีเซ็ต Admin คนแรก
```
