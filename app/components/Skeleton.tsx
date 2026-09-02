// Skeleton — โครงร่างสีเทาระหว่างรอข้อมูลจากเซิร์ฟเวอร์ ใช้แทน "หน้าว่าง"
// ใช้ใน loading.tsx ของแต่ละหน้า (Next.js App Router จะแสดงไฟล์นี้อัตโนมัติระหว่างที่ page.tsx รอข้อมูล)
// ตั้งใจให้รูปร่างใกล้เคียงหน้าจริง เพื่อไม่ให้เนื้อหากระโดดตอนข้อมูลมาถึง
import React from 'react';

export function Sk({ h = 12, w = '100%', r = 8, mb = 9, style }: {
  h?: number | string; w?: number | string; r?: number; mb?: number; style?: React.CSSProperties;
}) {
  return <div className="sk" style={{ height: h, width: w, borderRadius: r, marginBottom: mb, ...style }} aria-hidden />;
}

/** การ์ด KPI แถวบน */
export function SkKpis({ n = 4 }: { n?: number }) {
  return (
    <div className="kgrid">
      {Array.from({ length: n }, (_, i) => <div key={i} className="sk sk-kpi" aria-hidden />)}
    </div>
  );
}

/** การ์ดเนื้อหา 1 ใบ — ใส่ h เมื่อเป็นบล็อกกราฟ, ไม่ใส่ = เป็นบรรทัดข้อความ */
export function SkCard({ h, lines = 3, title = true }: { h?: number; lines?: number; title?: boolean }) {
  return (
    <div className="card">
      {title && <Sk h={15} w={190} mb={14} />}
      {h != null
        ? <Sk h={h} r={12} mb={0} />
        : Array.from({ length: lines }, (_, i) =>
            <Sk key={i} w={i === lines - 1 ? '62%' : '100%'} mb={i === lines - 1 ? 0 : 9} />)}
    </div>
  );
}

/** ตาราง — หัวตาราง 1 แถว + แถวข้อมูล */
export function SkTable({ rows = 8, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="card">
      {title && <Sk h={15} w={190} mb={14} />}
      <Sk h={11} w="45%" mb={12} />
      {Array.from({ length: rows }, (_, i) => <Sk key={i} h={34} mb={i === rows - 1 ? 0 : 7} />)}
    </div>
  );
}

/** โครงหน้าเต็ม — หัวเรื่องจริง (ผู้ใช้รู้ว่ามาถูกหน้า) + โครงร่างเนื้อหา */
export default function PageSkeleton({ title, sub, filters = 0, kpis = 0, blocks = 1, table = 0 }: {
  title: string; sub?: string; filters?: number; kpis?: number; blocks?: number; table?: number;
}) {
  return (
    <>
      <header className="top">
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
        {filters > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {Array.from({ length: filters }, (_, i) => <Sk key={i} h={36} w={i % 2 ? 190 : 155} r={9} mb={0} />)}
          </div>
        )}
      </header>
      <div className="content" aria-busy="true">
        <span className="sr-only" role="status">กำลังโหลดข้อมูล…</span>
        {kpis > 0 && <SkKpis n={kpis} />}
        {Array.from({ length: blocks }, (_, i) => <SkCard key={i} h={i === 0 ? 240 : 150} />)}
        {table > 0 && <SkTable rows={table} />}
      </div>
    </>
  );
}
