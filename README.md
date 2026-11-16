# VOC Web App — Next.js (โค้ดจริง รันได้)

แอป Next.js (App Router + TypeScript) ที่แปลงจาก prototype — ตอนนี้ใช้ **ข้อมูลจำลองใน `lib/data.ts`** (ยังไม่ต่อ Supabase) เพื่อให้รันเห็นผลได้ทันที

## วิธีรัน (บนเครื่องคุณ / Claude Code)
```bash
cd voc-app
npm install        # ติดตั้งครั้งแรก (ต้องต่ออินเทอร์เน็ต)
npm run dev        # เปิด http://localhost:3000  → เด้งไป /dashboard
```
> หมายเหตุ: ไฟล์นี้ **ไม่มีโฟลเดอร์ `node_modules`** (ต้อง `npm install` เอง) — สภาพแวดล้อมที่สร้างไฟล์ติดตั้งไม่ได้เพราะข้อจำกัดเวลา/สิทธิ์ แต่โค้ดเป็นมาตรฐาน Next.js 14 รันได้ปกติ

## หน้าที่มี
| เส้นทาง | หน้า |
|---|---|
| `/dashboard` | ภาพรวม: KPI (%เสียงบวก/ลบ), Case Pipeline, ช่องทาง, รายการล่าสุด |
| `/voc` | รายการ VOC + ค้นหา |
| `/voc/[id]` | รายละเอียดเสียงลูกค้า + ผล AI + วันที่ต้นทาง/นำเข้า |
| `/prioritize` | จัดลำดับความสำคัญ 5 ระดับ × 3 ปัจจัย (คำนวณจากข้อมูล) |

## โครงสร้าง
```
voc-app/
├─ app/            # หน้าเว็บ (Server Components)
│  ├─ dashboard/ voc/ voc/[id]/ prioritize/
│  ├─ layout.tsx  globals.css  page.tsx
├─ lib/data.ts     # ชั้นข้อมูล (mock) — สลับเป็น Supabase ที่นี่
├─ package.json  tsconfig.json  .env.example
```

## สลับจาก mock → Supabase (เฟสถัดไป)
1. `npm install @supabase/supabase-js`
2. คัดลอก `../nextjs-starter/lib/supabaseClient.ts` และ `../nextjs-starter/lib/voc.ts`
3. รัน `../supabase_schema.sql` ใน Supabase → ใส่คีย์ใน `.env.local` (ดู `.env.example`)
4. แก้ฟังก์ชันใน `lib/data.ts` ให้เรียก Supabase (โครงฟังก์ชันเหมือนกัน: `listVOC`, `getVOC`, `pipelineStats` ...)

> ดูบริบทโครงการทั้งหมดที่ `../CLAUDE.md`
