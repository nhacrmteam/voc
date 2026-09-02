import Link from 'next/link';
import EmptyState from '../components/EmptyState';
import { vocHref, ALL_TIME } from '../../lib/vocLink';
import { listVOC } from '../../lib/data';
import { W, SW, FACTORS, STRENGTH_FACTORS, scoreTopics, scoreBand, scoreStrengths, strengthBand } from '../../lib/priority';

export const dynamic = 'force-dynamic';

export default async function Prioritize() {
  const rows = await listVOC();
  const top10 = Array.from(scoreTopics(rows).values()).sort((a, b) => b.score - a.score).slice(0, 10);
  const strengths = scoreStrengths(rows).slice(0, 10);

  return (
    <>
      <header className="top"><h1>จัดลำดับความสำคัญ &amp; วิเคราะห์</h1><div className="sub">โมเดล VOC 4 ปัจจัย × น้ำหนัก — ประเด็นที่ควรเฝ้าระวังก่อน และจุดแข็งที่ควรขยายผล (อย่างละ Top 10)</div></header>
      <div className="content">
        {/* น้ำหนักปัจจัย */}
        <div className="card">
          <h3>⚖️ น้ำหนักปัจจัย — ด้านเฝ้าระวัง (แอดมินปรับได้)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 14, marginTop: 10 }}>
            {FACTORS.map(f => (
              <div key={f.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <b>{f.name}</b><b style={{ color: '#1f3a93' }}>{Math.round(f.w * 100)}%</b>
                </div>
                <div style={{ height: 10, background: '#eef2f7', borderRadius: 6 }}>
                  <div style={{ width: f.w * 100 + '%', height: '100%', background: '#1f3a93', borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 10 */}
        <div className="card">
          <h3>🎯 Top 10 ประเด็นที่ควรเฝ้าระวัง/จัดการก่อน</h3>
          <table className="tcards">
            <thead><tr><th>อันดับ</th><th>ประเด็น</th><th>จำนวน</th><th>ความถี่</th><th>ความรุนแรง</th><th>แนวโน้ม</th><th>ผลกระทบ</th><th>คะแนนถ่วงน้ำหนัก</th><th>ระดับ</th></tr></thead>
            <tbody>{top10.map((x, i) => {
              const band = scoreBand(x.score);
              return (
                <tr key={x.topic} style={i < 3 ? { background: '#fef9ec' } : undefined}>
                  <td data-label="อันดับ"><b>{i + 1}</b></td>
                  <td className="cell-wrap" data-label="ประเด็น"><Link href={vocHref(x.topic, ALL_TIME)} style={{ color: '#0f172a' }}>{x.topic}</Link></td>
                  <td data-label="จำนวน">{x.count}</td><td data-label="ความถี่">{x.fl}</td><td data-label="ความรุนแรง">{x.sl}</td><td data-label="แนวโน้ม">{x.tl}</td><td data-label="ผลกระทบ">{x.il}</td>
                  <td data-label="คะแนนถ่วงน้ำหนัก"><b>{x.score.toFixed(2)}</b></td>
                  <td data-label="ระดับ"><span className={'pill ' + band.cls}>{band.label}</span></td>
                </tr>
              );
            })}</tbody>
          </table>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            คะแนน = ความถี่×{W.freq} + ความรุนแรง×{W.sev} + แนวโน้ม×{W.trend} + ผลกระทบ×{W.impact} · แต่ละปัจจัยให้คะแนน 1–5 · คลิกชื่อประเด็นเพื่อดูทุกเสียง
          </div>
        </div>

        {/* น้ำหนักปัจจัยด้านจุดแข็ง */}
        <div className="card">
          <h3>⚖️ น้ำหนักปัจจัย — ด้านจุดแข็ง</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 10 }}>
            ใช้น้ำหนักชุดเดียวกับด้านเฝ้าระวัง แต่เปลี่ยนความหมาย 2 ปัจจัย — ความรุนแรงเป็นความเข้มเชิงบวก และผลกระทบเป็นการบอกต่อ
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 14 }}>
            {STRENGTH_FACTORS.map(f => (
              <div key={f.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <b>{f.name}</b><b style={{ color: '#15803d' }}>{Math.round(f.w * 100)}%</b>
                </div>
                <div style={{ height: 10, background: '#eef2f7', borderRadius: 6 }}>
                  <div style={{ width: f.w * 100 + '%', height: '100%', background: '#16a34a', borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 10 จุดแข็ง */}
        <div className="card">
          <h3>🌟 Top 10 จุดแข็งที่ควรขยายผล/ชื่นชม</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 10 }}>
            ระบบนี้ฟังเสียงลูกค้าทั้งสองด้าน — ตารางนี้บอกว่าอะไรทำได้ดีจนลูกค้าชม ควรรักษาไว้ ขยายไปโครงการอื่น และชื่นชมหน่วยงานที่รับผิดชอบ
          </div>
          {strengths.length === 0 ? (
            <EmptyState icon="🌟" title="ยังไม่พบประเด็นที่มีเสียงเชิงบวกในช่วงข้อมูลนี้"
              detail={<>เมื่อมีคำชมเข้ามา ระบบจะจัดอันดับให้ว่าเรื่องไหนควรขยายผลก่อน พร้อมระบุฝ่ายที่ควรได้รับคำชม</>} />
          ) : (
            <>
              <table className="tcards">
                <thead><tr><th>อันดับ</th><th>ประเด็น</th><th>เสียงบวก</th><th>ความถี่</th><th>ความเข้มบวก</th><th>แนวโน้ม</th><th>การบอกต่อ</th><th>คะแนนถ่วงน้ำหนัก</th><th>ระดับ</th><th>ฝ่ายที่ควรได้รับคำชม</th></tr></thead>
                <tbody>{strengths.map((x, i) => {
                  const band = strengthBand(x.score);
                  return (
                    <tr key={x.topic} style={i < 3 ? { background: '#f0fdf4' } : undefined}>
                      <td data-label="อันดับ"><b>{i + 1}</b></td>
                      <td className="cell-wrap" data-label="ประเด็น"><Link href={vocHref(x.topic, ALL_TIME)} style={{ color: '#0f172a' }}>{x.topic}</Link></td>
                      <td data-label="เสียงบวก"><b style={{ color: '#15803d' }}>{x.posCount}</b> <span style={{ color: 'var(--muted)' }}>/ {x.count}</span></td>
                      <td data-label="ความถี่">{x.fl}</td><td data-label="ความเข้มบวก">{x.pl}</td><td data-label="แนวโน้ม">{x.tl}</td><td data-label="การบอกต่อ">{x.al}</td>
                      <td data-label="คะแนนถ่วงน้ำหนัก"><b>{x.score.toFixed(2)}</b></td>
                      <td data-label="ระดับ"><span className={'pill ' + band.cls}>{band.label}</span></td>
                      <td data-label="ฝ่ายที่ควรได้รับคำชม" style={{ fontSize: 12.5 }}>{x.owner || '-'}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                คะแนน = ความถี่×{SW.freq} + ความเข้มบวก×{SW.pos} + แนวโน้ม×{SW.trend} + การบอกต่อ×{SW.advocacy} · นับเฉพาะประเด็นที่มีเสียงเชิงบวกจริง
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
