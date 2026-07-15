import Link from 'next/link';
import { getVOC } from '../../../lib/data';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function VocDetail({ params }: { params: { id: string } }) {
  const r = await getVOC(params.id);
  if (!r) return notFound();
  const sp = r.sentiment==='Positive'?'p-pos':r.sentiment==='Negative'?'p-neg':'p-neu';
  return (
    <>
      <header className="top"><h1>รายละเอียด {r.ref}</h1><div className="sub"><Link href="/voc">← กลับรายการ VOC</Link></div></header>
      <div className="content">
        <div className="card">
          <div style={{background:'#f5f7ff',border:'1px solid #c7d2fe',borderRadius:10,padding:13,fontSize:15,lineHeight:1.6}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>💬 เสียงลูกค้า (ข้อความเต็ม)</div>“{r.voice}”
          </div>
          <table style={{marginTop:14}}>
            <tbody>
              <tr><th>ช่องทาง</th><td>{r.channel}{r.source!==r.channel?' › '+r.source:''}</td><th>วันที่เกิดเรื่อง</th><td>{r.occurredAt}{r.imported?' · นำเข้า '+r.importedAt+' (ไฟล์)':' · เรียลไทม์'}</td></tr>
              <tr><th>กลุ่มผลิตภัณฑ์</th><td>{r.product}</td><th>โครงการ</th><td>{r.project}</td></tr>
              <tr><th>หัวข้อ</th><td>{r.topic}</td><th>Journey</th><td>{r.journey}</td></tr>
              <tr><th>Sentiment</th><td><span className={'pill '+sp}>{r.sentiment}</span></td><th>Priority</th><td>{r.priority}</td></tr>
              <tr><th>ผู้รับผิดชอบ</th><td>{r.owner}</td><th>สถานะ</th><td>{r.status}</td></tr>
              <tr><th>หมวด AI (ผลิตภัณฑ์)</th><td>{r.catProduct}</td><th>หมวด AI (สนับสนุนขาย)</th><td>{r.catSales}</td></tr>
            </tbody>
          </table>
          <div style={{marginTop:14,fontSize:12,color:'var(--muted)'}}>* หน้าจัดการส่งต่อ/ติดตาม (forwardCase / addFollowUp) เชื่อม Supabase ได้ตาม lib/voc.ts</div>
        </div>
      </div>
    </>
  );
}
