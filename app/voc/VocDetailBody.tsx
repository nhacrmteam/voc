// VocDetailBody — เนื้อหารายละเอียดเสียงลูกค้า 1 รายการ
// ใช้ร่วมกัน 2 ที่ให้เห็นเหมือนกันเป๊ะ: หน้าเต็ม /voc/[id] (server) และป๊อปอัป VocModal (client)
// จงใจไม่ใช้ hook ใด ๆ — จะได้ import ได้ทั้งฝั่ง server และ client
import Link from 'next/link';
import type { Voc } from '../../lib/data';
import { journeyLabel, JOURNEY_DESC } from '../../lib/data';
import { scoreTopics, scoreBand, FACTORS, W } from '../../lib/priority';
import { vocHref, ALL_TIME } from '../../lib/vocLink';

export default function VocDetailBody({ r, rows, onNavigate, period = ALL_TIME }: {
  r: Voc;
  rows: Voc[];                 // ข้อมูลทั้งหมด — ใช้คิดคะแนน/ประเด็นซ้ำ (ต้องเป็นชุดเต็ม ไม่ใช่ชุดที่กรองแล้ว)
  onNavigate?: () => void;     // ป๊อปอัปส่งมาเพื่อปิดตัวเองก่อนพาไปหน้าอื่น
  // ตัวเลข "พบ N ครั้งในระบบ" นับจากข้อมูลทั้งหมด ลิงก์จึงต้องพา "ทั้งหมด" ไปด้วย
  // ไม่งั้นกดแล้วหน้ารายการจะกรองเหลือไตรมาสปัจจุบัน แล้วเห็นไม่ครบ N
  period?: { fy?: number | string; qt?: string };
}) {
  const same = rows.filter(x => x.topic === r.topic);
  const sameNeg = same.filter(x => x.sentiment === 'Negative').length;
  const sp = r.sentiment === 'Positive' ? 'p-pos' : r.sentiment === 'Negative' ? 'p-neg' : 'p-neu';
  const pp = r.priority === 'High' ? 'p-hi' : r.priority === 'Medium' ? 'p-md' : 'p-lo';

  // คะแนนความสำคัญ — โมเดล 4 ปัจจัยชุดเดียวกับหน้าจัดลำดับ (คิดจากข้อมูลทั้งหมดเสมอ)
  const scoreMap = scoreTopics(rows);
  const sc = scoreMap.get(r.topic);
  const band = sc ? scoreBand(sc.score) : null;
  const lv: Record<string, number> = sc ? { freq: sc.fl, sev: sc.sl, trend: sc.tl, impact: sc.il } : {};
  const ranked = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
  const rank = sc ? ranked.findIndex(x => x.topic === r.topic) + 1 : 0;

  return (
    <>
      <div className="card">
        <div className="vd-quote">
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>💬 เสียงลูกค้า (ข้อความเต็ม)</div>“{r.voice}”
        </div>
        <table className="vd-table" style={{ marginTop: 14 }}>
          <tbody>
            <tr><th>ช่องทาง</th><td>{r.channel}{r.source !== r.channel ? ' › ' + r.source : ''}</td><th>วันที่เกิดเรื่อง</th><td>{r.occurredAt}{r.imported ? ' · นำเข้า ' + r.importedAt + ' (ไฟล์)' : ' · เรียลไทม์'}</td></tr>
            <tr><th>โครงการ</th><td>{r.project} ({r.projectType})</td>
              <th>เส้นทางลูกค้า</th>
              <td>{journeyLabel(r.journey)}
                {JOURNEY_DESC[r.journey] && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{JOURNEY_DESC[r.journey]}</div>}
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
              <div className="vd-score">{sc.score.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>เต็ม 5.00</div>
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <div style={{ marginBottom: 6 }}>
                <span className={'pill ' + band.cls} style={{ fontSize: 13 }}>ระดับ{band.label}</span>
                {rank > 0 && rank <= 10 && (
                  <span className="vd-rank">
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
                      <div key={n} className={n <= v ? 'vd-pip on' : 'vd-pip'} />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{f.desc}</div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>
            * ความถี่และแนวโน้มวัดที่ระดับ &ldquo;ประเด็น&rdquo; เสียงที่อยู่ในประเด็นเดียวกันจึงได้คะแนนเท่ากัน ·
            <Link href="/prioritize" onClick={onNavigate} style={{ color: 'var(--blue)', marginLeft: 4 }}>ดูตารางจัดลำดับทั้งหมด →</Link>
          </div>
        </div>
      )}

      {/* เฝ้าระวังประเด็นซ้ำ (monitoring) */}
      <div className="card" style={{ marginBottom: 0 }}>
        <h3>🔁 การเฝ้าระวังประเด็นซ้ำ</h3>
        {same.length >= 3 ? (
          <div className="vd-warn">
            ⚠️ ประเด็น <b>&ldquo;{r.topic}&rdquo;</b> พบ <b>{same.length}</b> ครั้งในระบบ (เชิงลบ {sameNeg} ครั้ง) — เป็นประเด็นที่เกิดซ้ำ ควรเฝ้าระวัง
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>ประเด็น &ldquo;{r.topic}&rdquo; พบ {same.length} ครั้งในระบบ — ยังไม่ถึงเกณฑ์ประเด็นซ้ำ (≥3)</div>
        )}
        <div style={{ marginTop: 10 }}>
          <Link href={vocHref(r.topic, period)} onClick={onNavigate} className="btn">ดูทุกเสียงในประเด็นนี้ →</Link>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          * ระบบนี้เป็นการรับฟังและเฝ้าระวังเสียงลูกค้า (monitoring) — การดำเนินการแก้ไขอยู่ที่หน่วยงานที่เกี่ยวข้อง
        </div>
      </div>
    </>
  );
}
