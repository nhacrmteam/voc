import Link from 'next/link';
import { listVOC } from '../../lib/data';

export const dynamic = 'force-dynamic';

// น้ำหนัก 3 ปัจจัย (แอดมินปรับได้ในระบบจริง — ตอนเชื่อม Supabase เก็บในตาราง settings)
const W = { freq: 0.30, sev: 0.40, urg: 0.30 };
const FACTORS = [
  { key: 'freq', name: 'ความถี่ (Frequency)', w: W.freq, desc: 'พบบ่อยแค่ไหนเทียบกับประเด็นอื่น' },
  { key: 'sev', name: 'ความรุนแรง (Severity)', w: W.sev, desc: 'สัดส่วนเสียงเชิงลบในประเด็นนั้น' },
  { key: 'urg', name: 'ความเร่งด่วน (Urgency)', w: W.urg, desc: 'สัดส่วนเรื่องที่ถูกจัด Priority = High' },
];

export default async function Prioritize() {
  const rows = await listVOC();
  const g: Record<string, { c: number; neg: number; high: number }> = {};
  rows.forEach(r => { const t = r.topic; g[t] ||= { c: 0, neg: 0, high: 0 }; g[t].c++; if (r.sentiment === 'Negative') g[t].neg++; if (r.priority === 'High') g[t].high++; });
  const maxc = Math.max(...Object.values(g).map(o => o.c), 1);
  const arr = Object.entries(g).map(([t, o]) => {
    const fl = Math.max(1, Math.min(5, Math.ceil(o.c / maxc * 5)));
    const np = o.c ? o.neg / o.c * 100 : 0; const sl = np >= 50 ? 5 : np >= 35 ? 4 : np >= 20 ? 3 : np >= 10 ? 2 : 1;
    const hp = o.c ? o.high / o.c * 100 : 0; const ul = hp >= 40 ? 5 : hp >= 25 ? 4 : hp >= 15 ? 3 : hp >= 5 ? 2 : 1;
    return { t, c: o.c, fl, sl, ul, score: fl * W.freq + sl * W.sev + ul * W.urg };
  }).sort((a, b) => b.score - a.score);
  const top10 = arr.slice(0, 10);

  return (
    <>
      <header className="top"><h1>จัดลำดับความสำคัญ (5 ระดับ × 3 ปัจจัย)</h1><div className="sub">คะแนน 1–5 ต่อปัจจัย × น้ำหนัก → ผลจัดลำดับ Top 10</div></header>
      <div className="content">
        {/* น้ำหนัก 3 ปัจจัย */}
        <div className="card">
          <h3>⚖️ น้ำหนักปัจจัย (แอดมินปรับได้)</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:14, marginTop:10 }}>
            {FACTORS.map(f => (
              <div key={f.key}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                  <b>{f.name}</b><b style={{ color:'#1f3a93' }}>{Math.round(f.w * 100)}%</b>
                </div>
                <div style={{ height:10, background:'#eef2f7', borderRadius:6 }}>
                  <div style={{ width: f.w * 100 + '%', height:'100%', background:'#1f3a93', borderRadius:6 }} />
                </div>
                <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:4 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 10 */}
        <div className="card">
          <h3>🎯 Top 10 ประเด็นที่ควรจัดการก่อน</h3>
          <table>
            <thead><tr><th>อันดับ</th><th>ประเด็น</th><th>จำนวน</th><th>ความถี่ (1–5)</th><th>ความรุนแรง (1–5)</th><th>ความเร่งด่วน (1–5)</th><th>คะแนนถ่วงน้ำหนัก</th><th>ระดับ</th></tr></thead>
            <tbody>{top10.map((x, i) => {
              const band = x.score >= 4 ? ['สูงมาก','p-hi'] : x.score >= 3 ? ['สูง','p-md'] : x.score >= 2 ? ['ปานกลาง','p-lo'] : ['ต่ำ','p-neu'];
              return (
                <tr key={x.t} style={i < 3 ? { background:'#fef9ec' } : undefined}>
                  <td><b>{i+1}</b></td>
                  <td><Link href={'/voc?q=' + encodeURIComponent(x.t)} style={{ color:'#0f172a' }}>{x.t}</Link></td>
                  <td>{x.c}</td><td>{x.fl}</td><td>{x.sl}</td><td>{x.ul}</td>
                  <td><b>{x.score.toFixed(2)}</b></td>
                  <td><span className={'pill '+band[1]}>{band[0]}</span></td>
                </tr>
              );
            })}</tbody>
          </table>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:8 }}>
            คะแนน = ความถี่×{W.freq} + ความรุนแรง×{W.sev} + ความเร่งด่วน×{W.urg} · คลิกชื่อประเด็นเพื่อดูรายการที่เกี่ยวข้อง
          </div>
        </div>
      </div>
    </>
  );
}
