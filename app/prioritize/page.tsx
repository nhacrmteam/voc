import Link from 'next/link';
import { listVOC } from '../../lib/data';
import { impactLevel } from '../../lib/ai';

export const dynamic = 'force-dynamic';

// โมเดลจัดลำดับความสำคัญ VOC (monitoring) — 4 ปัจจัย × น้ำหนัก (แอดมินปรับได้ในระบบจริง)
const W = { freq: 0.25, sev: 0.35, trend: 0.20, impact: 0.20 };
const FACTORS = [
  { key: 'freq', name: 'ความถี่ (Volume)', w: W.freq, desc: 'จำนวนครั้งที่ประเด็นถูกพูดถึง — กระทบลูกค้าจำนวนมาก' },
  { key: 'sev', name: 'ความรุนแรง (Severity)', w: W.sev, desc: 'สัดส่วน + ความเข้มของเสียงเชิงลบในประเด็น' },
  { key: 'trend', name: 'แนวโน้ม (Trend)', w: W.trend, desc: 'ประเด็นกำลังพุ่งขึ้นเทียบช่วงก่อนหรือไม่' },
  { key: 'impact', name: 'ผลกระทบ (Impact)', w: W.impact, desc: 'มีคำด้านความปลอดภัย/การเงิน/กฎหมาย — เสี่ยงสูงแม้จำนวนน้อย' },
];
const INTENSE = ['มาก', 'สุด', 'เกินไป', 'ตลอด', 'หลายวัน', 'ทุกครั้ง', 'ด่วน', 'เร่งด่วน'];

export default async function Prioritize() {
  const rows = await listVOC();

  // ช่วงเวลาโดยรวม เพื่อคำนวณแนวโน้ม (แบ่งครึ่งช่วง: ก่อน vs หลัง)
  const dates = rows.map(r => r.occurredAt).filter(Boolean).sort();
  const minD = dates[0] || '', maxD = dates[dates.length - 1] || '';
  const midMs = minD && maxD ? (new Date(minD).getTime() + new Date(maxD).getTime()) / 2 : 0;

  const g: Record<string, { c: number; neg: number; intense: number; impact: number; recent: number; earlier: number }> = {};
  rows.forEach(r => {
    const t = r.topic; if (!t) return;
    g[t] ||= { c: 0, neg: 0, intense: 0, impact: 0, recent: 0, earlier: 0 };
    const o = g[t];
    o.c++;
    if (r.sentiment === 'Negative') o.neg++;
    if (INTENSE.some(k => (r.voice || '').includes(k))) o.intense++;
    if (impactLevel(r.voice || '') > 0) o.impact++;
    if (new Date(r.occurredAt).getTime() >= midMs) o.recent++; else o.earlier++;
  });

  const maxc = Math.max(...Object.values(g).map(o => o.c), 1);
  const arr = Object.entries(g).map(([t, o]) => {
    // 1) ความถี่
    const fl = Math.max(1, Math.min(5, Math.ceil(o.c / maxc * 5)));
    // 2) ความรุนแรง = สัดส่วนลบ + ความเข้ม
    const negPct = o.c ? o.neg / o.c * 100 : 0;
    let sl = negPct >= 50 ? 5 : negPct >= 35 ? 4 : negPct >= 20 ? 3 : negPct >= 10 ? 2 : 1;
    if (o.neg > 0 && o.intense / o.neg >= 0.5) sl = Math.min(5, sl + 1);
    // 3) แนวโน้ม = หลังเทียบก่อน
    const ratio = o.recent / (o.earlier || 1);
    const tl = o.earlier === 0 && o.recent > 0 ? 5 : ratio >= 2 ? 5 : ratio >= 1.5 ? 4 : ratio >= 1.1 ? 3 : ratio >= 0.8 ? 2 : 1;
    // 4) ผลกระทบ
    const impPct = o.c ? o.impact / o.c * 100 : 0;
    const il = impPct >= 40 ? 5 : impPct >= 25 ? 4 : impPct >= 15 ? 3 : impPct >= 5 ? 2 : 1;
    const score = fl * W.freq + sl * W.sev + tl * W.trend + il * W.impact;
    return { t, c: o.c, fl, sl, tl, il, score };
  }).sort((a, b) => b.score - a.score);
  const top10 = arr.slice(0, 10);

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
              const band = x.score >= 4 ? ['สูงมาก', 'p-hi'] : x.score >= 3 ? ['สูง', 'p-md'] : x.score >= 2 ? ['ปานกลาง', 'p-lo'] : ['ต่ำ', 'p-neu'];
              return (
                <tr key={x.t} style={i < 3 ? { background: '#fef9ec' } : undefined}>
                  <td><b>{i + 1}</b></td>
                  <td><Link href={'/voc?q=' + encodeURIComponent(x.t)} style={{ color: '#0f172a' }}>{x.t}</Link></td>
                  <td>{x.c}</td><td>{x.fl}</td><td>{x.sl}</td><td>{x.tl}</td><td>{x.il}</td>
                  <td><b>{x.score.toFixed(2)}</b></td>
                  <td><span className={'pill ' + band[1]}>{band[0]}</span></td>
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
