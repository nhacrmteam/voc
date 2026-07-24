import Link from 'next/link';
import { getVOC, listVOC } from '../../../lib/data';
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
              <tr><th>กลุ่มผลิตภัณฑ์</th><td>{r.product}</td><th>โครงการ</th><td>{r.project} ({r.projectType})</td></tr>
              <tr><th>หัวข้อ</th><td>{r.topic}</td><th>Journey</th><td>{r.journey}</td></tr>
              <tr><th>Sentiment</th><td><span className={'pill ' + sp}>{r.sentiment}</span></td><th>ความรุนแรง (Priority)</th><td><span className={'pill ' + pp}>{r.priority}</span></td></tr>
              <tr><th>ฝ่ายที่เกี่ยวข้อง</th><td>{r.owner}</td><th>หมวด AI (ผลิตภัณฑ์)</th><td>{r.catProduct}</td></tr>
              <tr><th>หมวด AI (สนับสนุนขาย)</th><td>{r.catSales}</td><th>ความเชื่อมั่น AI</th><td>{r.sentConf}%{r.sentManual ? ' · ✔ ยืนยันโดยเจ้าหน้าที่' : r.sentUncertain ? ' · ⚠ AI ไม่แน่ใจ' : ''}</td></tr>
            </tbody>
          </table>
        </div>

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
