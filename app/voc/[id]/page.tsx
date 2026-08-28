import Link from 'next/link';
import { getVOC, listVOC, journeyLabel, JOURNEY_DESC } from '../../../lib/data';
import { scoreTopics, scoreBand, FACTORS, W } from '../../../lib/priority';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const SENT_TH: Record<string, string> = { Positive: 'เชิงบวก', Neutral: 'เป็นกลาง', Negative: 'เชิงลบ' };

export default async function VocDetail({ params }: { params: { id: string } }) {
  const r = await getVOC(params.id);
  if (!r) return notFound();
  // ประเด็นซ้ำ (recurring) — นับหัวข้อเดียวกันในระบบเพื่อเฝ้าระวัง
  const all = await listVOC({});
  const same = all.filter(x => x.topic === r.topic);
  const sameNeg = same.filter(x => x.sentiment === 'Negative').length;
  const sp = r.sentiment === 'Positive' ? 'p-pos' : r.sentiment === 'Negative' ? 'p-neg' : 'p-neu';
  const pp = r.priority === 'High' ? 'p-hi' : r.priority === 'Medium' ? 'p-md' : 'p-lo';
  // คะแนนความสำคัญของเสียงนี้ (โมเดล 4 ปัจจัยเดียวกับหน้าจัดลำดับ)
  const scoreMap = scoreTopics(all);
  const sc = scoreMap.get(r.topic);
  const band = sc ? scoreBand(sc.score) : null;
  const lv: Record<string, number> = sc ? { freq: sc.fl, sev: sc.sl, trend: sc.tl, impact: sc.il } : {};
  const ranked = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
  const rank = sc ? ranked.findIndex(x => x.topic === r.topic) + 1 : 0;

  return (
    <>
      <header className="top"><h1>รายละเอียด {r.ref}</h1><div className="sub"><Link href="/voc">← กลับรายการ VOC</Link></div></header>
      <div className="content">
        <div className="card">
          <div style={{ background: '#f5f7ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: 13, fontSize: 15, lineHeight: 1.6 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>💬 เสียงลูกค้า (ข้อความเต็ม)</div>“{r.voice}”
          </div>
          <table style={{ marginTop: 14 }}>
            <tbody>
              <tr><th>ช่องทาง</th><td>{r.channel}{r.source !== r.channel ? ' › ' + r.source : ''}</td><th>วันที่เกิดเรื่อง</th><td>{r.occurredAt}{r.imported ? ' · นำเข้า ' + r.importedAt + ' (ไฟล์)' : ' · เรียลไทม์'}</td></tr>
              <tr><th>โครงการ</th><td>{r.project} ({r.projectType})</td>
                <th>เส้นทางลูกค้า</th>
                <td>{journeyLabel(r.journey)}
                  {JOURNEY_DESC[r.journey] && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{JOURNEY_DESC[r.journey]}</div>}
                </td></tr>
              <tr><th>หัวข้อ</th><td colSpan={3}>{r.topic}</td></tr>
              <tr><th>Sentiment</th><td><span className={'pill ' + sp}>{r.sentiment}</span></td><th>ความรุนแรง (Priority)</th><td><span className={'pill ' + pp}>{r.priority}</span></td></tr>
              <tr><th>ฝ่ายที่เกี่ยวข้อง</th><td>{r.owner}</td><th>หมวด AI (ผลิตภัณฑ์)</th><td>{r.catProduct}</td></tr>
              <tr><th>หมวด AI (สนับสนุนขาย)</th><td>{r.catSales}</td><th>ความเชื่อมั่น AI</th><td>{r.sentConf}%{r.sentManual ? ' · ✔ ยืนยันโดยเจ้าหน้าที่' : r.sentUncertain ? ' · ⚠ AI ไม่แน่ใจ' : ''}</td></tr>
            </tbody>
          </table>
        </div>

        {/* คะแนนความสำคัญ 4 ปัจจัย — โมเดลเดียวกับหน้าจัดลำดับ */}
        {sc && band && (
          <div className="card">
            <h3>🎯 คะแนนความสำคัญของเสียงนี้ (โมเดล 4 ปัจจัย)</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', margin: '12px 0 16px' }}>
              <div style={{ textAlign: 'center', minWidth: 96 }}>
                <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1, color: '#1f3a93' }}>{sc.score.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>เต็ม 5.00</div>
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <div style={{ marginBottom: 6 }}>
                  <span className={'pill ' + band.cls} style={{ fontSize: 13 }}>ระดับ{band.label}</span>
                  {rank > 0 && rank <= 10 && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#b45309', background: '#fef3c7', borderRadius: 20, padding: '2px 9px' }}>
                      อันดับ {rank} ของประเด็นที่ควรเฝ้าระวัง
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                  คิดจากประเด็น &ldquo;{sc.topic}&rdquo; ที่พบ {sc.count} ครั้งในระบบ ·
                  คะแนน = ความถี่×{W.freq} + ความรุนแรง×{W.sev} + แนวโน้ม×{W.trend} + ผลกระทบ×{W.impact}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 14 }}>
              {FACTORS.map(f => {
                const v = lv[f.key] || 0;
                return (
                  <div key={f.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, marginBottom: 4 }}>
                      <span>{f.name} <span style={{ color: 'var(--muted)' }}>({Math.round(f.w * 100)}%)</span></span>
                      <b style={{ color: '#1f3a93' }}>{v}/5</b>
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} style={{ flex: 1, height: 8, borderRadius: 3, background: n <= v ? '#1f3a93' : '#eef2f7' }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{f.desc}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>
              * ความถี่และแนวโน้มวัดที่ระดับ &ldquo;ประเด็น&rdquo; เสียงที่อยู่ในประเด็นเดียวกันจึงได้คะแนนเท่ากัน ·
              <Link href="/prioritize" style={{ color: 'var(--blue)', marginLeft: 4 }}>ดูตารางจัดลำดับทั้งหมด →</Link>
            </div>
          </div>
        )}

        {/* เฝ้าระวังประเด็นซ้ำ (monitoring) */}
        <div className="card">
          <h3>🔁 การเฝ้าระวังประเด็นซ้ำ</h3>
          {same.length >= 3 ? (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, color: '#92400e' }}>
              ⚠️ ประเด็น <b>&ldquo;{r.topic}&rdquo;</b> พบ <b>{same.length}</b> ครั้งในระบบ (เชิงลบ {sameNeg} ครั้ง) — เป็นประเด็นที่เกิดซ้ำ ควรเฝ้าระวัง
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>ประเด็น &ldquo;{r.topic}&rdquo; พบ {same.length} ครั้งในระบบ — ยังไม่ถึงเกณฑ์ประเด็นซ้ำ (≥3)</div>
          )}
          <div style={{ marginTop: 10 }}>
            <Link href={'/voc?q=' + encodeURIComponent(r.topic)} className="btn">ดูทุกเสียงในประเด็นนี้ →</Link>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
            * ระบบนี้เป็นการรับฟังและเฝ้าระวังเสียงลูกค้า (monitoring) — การดำเนินการแก้ไขอยู่ที่หน่วยงานที่เกี่ยวข้อง
          </div>
        </div>
      </div>
    </>
  );
}
