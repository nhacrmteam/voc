import Link from 'next/link';
import { listVOC } from '../../lib/data';
import { W, FACTORS, scoreTopics, scoreBand } from '../../lib/priority';

export const dynamic = 'force-dynamic';

export default async function Prioritize() {
  const rows = await listVOC();
  const top10 = Array.from(scoreTopics(rows).values()).sort((a, b) => b.score - a.score).slice(0, 10);

  return (
    <>
      <header className="top"><h1>จัดลำดับความสำคัญ & วิเคราะห์</h1><div className="sub">โมเดล VOC 4 ปัจจัย × น้ำหนัก → ประเด็นที่ควรเฝ้าระวังก่อน (Top 10)</div></header>
      <div className="content">
        {/* น้ำหนักปัจจัย */}
        <div className="card">
          <h3>⚖️ น้ำหนักปัจจัย (แอดมินปรับได้)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 14, marginTop: 10 }}>
            {FACTORS.map(f => (
              <div key={f.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <b>{f.name}</b><b style={{ color: '#1f3a93' }}>{Math.round(f.w * 100)}%</b>
                </div>
                <div style={{ height: 10, background: '#eef2f7', borderRadius: 6 }}>
                  <div style={{ width: f.w * 100 + '%', height: '100%', background: '#1f3a93', borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 10 */}
        <div className="card">
          <h3>🎯 Top 10 ประเด็นที่ควรเฝ้าระวัง/จัดการก่อน</h3>
          <table>
            <thead><tr><th>อันดับ</th><th>ประเด็น</th><th>จำนวน</th><th>ความถี่</th><th>ความรุนแรง</th><th>แนวโน้ม</th><th>ผลกระทบ</th><th>คะแนนถ่วงน้ำหนัก</th><th>ระดับ</th></tr></thead>
            <tbody>{top10.map((x, i) => {
              const band = scoreBand(x.score);
              return (
                <tr key={x.topic} style={i < 3 ? { background: '#fef9ec' } : undefined}>
                  <td><b>{i + 1}</b></td>
                  <td><Link href={'/voc?q=' + encodeURIComponent(x.topic)} style={{ color: '#0f172a' }}>{x.topic}</Link></td>
                  <td>{x.count}</td><td>{x.fl}</td><td>{x.sl}</td><td>{x.tl}</td><td>{x.il}</td>
                  <td><b>{x.score.toFixed(2)}</b></td>
                  <td><span className={'pill ' + band.cls}>{band.label}</span></td>
                </tr>
              );
            })}</tbody>
          </table>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            คะแนน = ความถี่×{W.freq} + ความรุนแรง×{W.sev} + แนวโน้ม×{W.trend} + ผลกระทบ×{W.impact} · แต่ละปัจจัยให้คะแนน 1–5 · คลิกชื่อประเด็นเพื่อดูทุกเสียง
          </div>
        </div>
      </div>
    </>
  );
}
