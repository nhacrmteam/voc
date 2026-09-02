import Link from 'next/link';
import { getVOC, listVOC } from '../../../lib/data';
import { notFound } from 'next/navigation';
import VocDetailBody from '../VocDetailBody';

export const dynamic = 'force-dynamic';

// หน้าเต็มยังอยู่เหมือนเดิมเพื่อ deep link / คัดลอกลิงก์ส่งต่อ / เปิดแท็บใหม่
// แต่เนื้อหาใช้ VocDetailBody ชุดเดียวกับป๊อปอัป — แก้ที่เดียวเห็นตรงกันทั้งสองที่
export default async function VocDetail({ params }: { params: { id: string } }) {
  const r = await getVOC(params.id);
  if (!r) return notFound();
  const all = await listVOC({});

  return (
    <>
      <header className="top">
        <h1>รายละเอียด {r.ref}</h1>
        <div className="sub"><Link href="/voc">← กลับรายการ VOC</Link></div>
      </header>
      <div className="content">
        <VocDetailBody r={r} rows={all} />
      </div>
    </>
  );
}
