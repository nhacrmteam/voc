import Link from 'next/link';
import { listVOC } from '../../lib/data';

export const dynamic = 'force-dynamic';

export default async function VocList({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams?.q || '';
  const rows = await listVOC({ q });
  return (
    <>
      <header className="top"><h1>รายการเสียงลูกค้า (VOC)</h1><div className="sub">ค้นหา + ดูรายละเอียด</div></header>
      <div className="content">
        <div className="card">
          <form method="get" style={{ display:'flex', gap:8, marginBottom:14 }}>
            <input name="q" defaultValue={q} placeholder="🔎 ค้นหา เช่น จอง, ซ่อม, สินเชื่อ..." />
            <button className="btn" type="submit">ค้นหา</button>
          </form>
          <div className="sub" style={{marginBottom:10}}>พบ {rows.length} รายการ</div>
          <table>
            <thead><tr><th>รหัส</th><th>ช่องทาง</th><th>โครงการ</th><th>หัวข้อ</th><th>เสียงลูกค้า</th><th>Sentiment</th><th>ฝ่าย</th><th>สถานะ</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id}>
                <td><Link href={'/voc/'+r.id} className="tag">{r.ref}</Link></td>
                <td>{r.channel}</td><td>{r.project}</td><td>{r.topic}</td>
                <td style={{maxWidth:260,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={r.voice}>{r.voice}</td>
                <td><span className={'pill '+(r.sentiment==='Positive'?'p-pos':r.sentiment==='Negative'?'p-neg':'p-neu')}>{r.sentiment}</span></td>
                <td>{r.owner}</td><td>{r.status}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
