import Link from 'next/link';
import { listVOC, pipelineStats, sentimentStats, channelStats, CASE_STATUS } from '../../lib/data';

export const dynamic = 'force-dynamic';

const COL: Record<string,string> = {
  'รับเรื่อง':'#94a3b8','ส่งต่อหน่วยงานที่รับผิดชอบ':'#4aa3ff','กำลังดำเนินการ':'#2e6cf0',
  'รอข้อมูลเพิ่มเติม':'#f59e0b','ติดตามผล':'#8b5cf6','ดำเนินการเสร็จ/ปิดเรื่อง':'#16a34a'
};

export default async function Dashboard() {
  const [rows, pipe, sent, chans] = await Promise.all([
    listVOC({ limit: 15 }), pipelineStats(), sentimentStats(), channelStats(),
  ]);
  const total = Object.values(pipe).reduce((a, b) => a + b, 0);
  return (
    <>
      <header className="top"><h1>ภาพรวมเสียงของลูกค้า</h1><div className="sub">สรุปข้อมูลจาก 8 ช่องทาง (ข้อมูลจำลอง)</div></header>
      <div className="content">
        <div className="cards">
          <div className="kpi"><div className="lab">เสียงลูกค้าทั้งหมด</div><div className="val">{sent.total.toLocaleString()}</div></div>
          <div className="kpi"><div className="lab">เสียงเชิงบวก (% Positive)</div><div className="val" style={{color:'var(--green)'}}>{sent.posPct}%</div></div>
          <div className="kpi"><div className="lab">เสียงเชิงลบ (% Negative)</div><div className="val" style={{color:'var(--red)'}}>{sent.negPct}%</div></div>
          <div className="kpi"><div className="lab">อยู่ระหว่างดำเนินการ</div><div className="val">{total - (pipe['ดำเนินการเสร็จ/ปิดเรื่อง']||0)}</div></div>
        </div>

        <div className="card">
          <h3>📋 สถานะการดำเนินการเรื่อง (Case Pipeline)</h3>
          <div className="pipe">
            {CASE_STATUS.map(s => { const w = total ? (pipe[s]/total*100) : 0; return <div key={s} title={s+': '+pipe[s]} style={{width:w+'%',background:COL[s]}} />; })}
          </div>
          <div style={{display:'flex',gap:14,flexWrap:'wrap',fontSize:12}}>
            {CASE_STATUS.map(s => <span key={s}><b style={{color:COL[s]}}>●</b> {s}: <b>{pipe[s]}</b></span>)}
          </div>
        </div>

        <div className="card">
          <h3>📥 เสียงลูกค้าแยกตามช่องทาง</h3>
          <table><thead><tr><th>ช่องทาง</th><th>จำนวน</th><th>% เชิงลบ</th></tr></thead>
            <tbody>{chans.map(c => <tr key={c.name}><td>{c.name}</td><td>{c.count}</td><td>{c.negPct}%</td></tr>)}</tbody>
          </table>
        </div>

        <div className="card">
          <h3>💬 รายการล่าสุด</h3>
          <table><thead><tr><th>รหัส</th><th>วันที่ต้นทาง</th><th>ช่องทาง</th><th>หัวข้อ</th><th>Sentiment</th><th>สถานะ</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id}>
                <td><Link href={'/voc/'+r.id} className="tag">{r.ref}</Link></td>
                <td>{r.occurredAt}{r.imported?' (ไฟล์)':''}</td>
                <td>{r.channel}{r.source!==r.channel?' › '+r.source:''}</td>
                <td>{r.topic}</td>
                <td><span className={'pill '+(r.sentiment==='Positive'?'p-pos':r.sentiment==='Negative'?'p-neg':'p-neu')}>{r.sentiment}</span></td>
                <td>{r.status}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
