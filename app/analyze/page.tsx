import Link from 'next/link';
import { listVOC, sentimentStats, JOURNEYS, JOURNEY_TH, JOURNEY_DESC } from '../../lib/data';
import ReanalyzePanel from './ReanalyzePanel';

export const dynamic = 'force-dynamic';

const SENT_TH: Record<string, string> = { Positive: 'เชิงบวก', Neutral: 'เป็นกลาง', Negative: 'เชิงลบ' };
const SENT_COLOR: Record<string, string> = { Positive: '#16a34a', Neutral: '#64748b', Negative: '#dc2626' };

function groupBy(rows: { [k: string]: any }[], key: string) {
  const m: Record<string, number> = {};
  rows.forEach(r => { const v = r[key]; if (v) m[v] = (m[v] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function BarList({ title, note, data, total, color }: { title: string; note?: string; data: [string, number][]; total: number; color: string }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {note && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 8 }}>{note}</div>}
      {data.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>ยังไม่มีข้อมูล</div>}
      {data.map(([k, v]) => (
        <div key={k} style={{ margin: '9px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
            <span>{k}</span><span style={{ fontWeight: 600 }}>{v} ({Math.round(v / total * 100)}%)</span>
          </div>
          <div style={{ height: 8, background: '#eef2f7', borderRadius: 6 }}>
            <div style={{ width: Math.round(v / total * 100) + '%', height: '100%', background: color, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function Analyze() {
  const rows = await listVOC();
  const s = await sentimentStats();
  const total = rows.length || 1;
  const pendingReview = rows.filter(r => r.sentUncertain && !r.sentManual).length;

  const prod = groupBy(rows, 'catProduct');
  const sales = groupBy(rows, 'catSales');
  const owner = groupBy(rows, 'owner');
  // Journey เรียงตามลำดับขั้น 1→6 เสมอ (ไม่เรียงตามจำนวน) เพราะเป็นเส้นทางที่มีลำดับ
  const jrCount: Record<string, number> = {};
  rows.forEach(r => { if (r.journey) jrCount[r.journey] = (jrCount[r.journey] || 0) + 1; });
  const journeySteps = JOURNEYS.map(k => ({ en: k, th: JOURNEY_TH[k], desc: JOURNEY_DESC[k], n: jrCount[k] || 0 }));

  return (
    <>
      <header className="top">
        <h1>AI วิเคราะห์เสียงลูกค้า</h1>
        <div className="sub">LLM จริงตรวจจับ Sentiment และจำแนกประเภทอัตโนมัติ (สำรองด้วย rule-based) · เจ้าหน้าที่ยืนยัน/แก้ไขได้ (human-in-the-loop)</div>
      </header>
      <div className="content">
        {/* Sentiment summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>เสียงลูกค้าทั้งหมด</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1f3a93' }}>{s.total.toLocaleString()}</div></div>
          <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>% เสียงเชิงบวก</div><div style={{ fontSize: 26, fontWeight: 700, color: '#16a34a' }}>{s.posPct}%</div></div>
          <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>% เป็นกลาง</div><div style={{ fontSize: 26, fontWeight: 700, color: 'var(--muted)' }}>{s.neuPct}%</div></div>
          <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>% เสียงเชิงลบ</div><div style={{ fontSize: 26, fontWeight: 700, color: '#dc2626' }}>{s.negPct}%</div></div>
        </div>

        {/* เครื่องมือวิเคราะห์ที่ใช้จริง + วิเคราะห์ใหม่ด้วย LLM */}
        <ReanalyzePanel />

        {/* คิวยืนยัน — สรุปแล้วส่งต่อไปหน้าจัดการคิวเต็ม (/review)
            เดิมแปะรายการ 20 อันไว้ตรงนี้ ทำให้หน้านี้ยาวและทำงานต่อไม่ได้จริง */}
        <div className="card rq-teaser">
          <div>
            <h3 style={{ marginBottom: 4 }}>✋ คิวยืนยันเสียงลูกค้า</h3>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
              รายการที่ AI ไม่มั่นใจ (ความเชื่อมั่น ≤ 50%) รอเจ้าหน้าที่ตรวจและยืนยัน<br />
              ยืนยันแล้วจะถูกล็อก ไม่ถูกทับเมื่อสั่งวิเคราะห์ใหม่ด้วย LLM
            </div>
          </div>
          <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
            <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.1, color: pendingReview > 0 ? '#b45309' : 'var(--green)' }}>
              {pendingReview.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>รายการรอยืนยัน</div>
            <Link href="/review" className="btn">เปิดคิวยืนยัน →</Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
          {/* Sentiment bars */}
          <div className="card">
            <h3>สัดส่วน Sentiment (AI ตรวจจับ)</h3>
            {(['Positive', 'Neutral', 'Negative'] as const).map(k => {
              const v = (s as any)[k] as number;
              return (
                <div key={k} style={{ margin: '10px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                    <span>{SENT_TH[k]}</span><span style={{ fontWeight: 600 }}>{v} ({Math.round(v / total * 100)}%)</span>
                  </div>
                  <div style={{ height: 8, background: '#eef2f7', borderRadius: 6 }}>
                    <div style={{ width: Math.round(v / total * 100) + '%', height: '100%', background: SENT_COLOR[k], borderRadius: 6 }} />
                  </div>
                </div>
              );
            })}
          </div>

          <BarList title="มิติผลิตภัณฑ์และบริการ" note="AI จำแนกหมวดผลิตภัณฑ์/บริการ" data={prod} total={total} color="#2e6cf0" />
          <BarList title="มิติการสนับสนุนการขาย" note="AI จำแนกหมวดสนับสนุนการขาย" data={sales} total={total} color="#8b5cf6" />
          {/* Customer Journey — เรียงตามลำดับขั้น พร้อมคำอธิบายว่าเสียงแบบไหนอยู่ขั้นนั้น */}
          <div className="card">
            <h3>เส้นทางลูกค้า Customer Journey (6 ขั้น)</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 10 }}>
              AI จำแนกจากประเด็นในข้อความเป็นหลัก · ใช้ช่องทางต้นทางช่วยเมื่อข้อความกำกวม
            </div>
            {journeySteps.map((j, i) => (
              <div key={j.en} style={{ margin: '11px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, marginBottom: 3 }}>
                  <span>
                    <span style={{
                      display: 'inline-grid', placeItems: 'center', width: 18, height: 18, borderRadius: '50%',
                      background: '#e0f2fe', color: '#0369a1', fontSize: 11.5, fontWeight: 700, marginRight: 7,
                    }}>{i + 1}</span>
                    {j.th} <span style={{ color: 'var(--muted)', fontSize: 12 }}>({j.en})</span>
                  </span>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{j.n} ({Math.round(j.n / total * 100)}%)</span>
                </div>
                <div style={{ height: 8, background: '#eef2f7', borderRadius: 6 }}>
                  <div style={{ width: Math.round(j.n / total * 100) + '%', height: '100%', background: '#0ea5e9', borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, marginLeft: 25 }}>{j.desc}</div>
              </div>
            ))}
          </div>
          <BarList title="ฝ่ายผู้รับผิดชอบ" note="จับคู่ฝ่ายตามประเภทเสียง" data={owner} total={total} color="#f59e0b" />
        </div>
      </div>
    </>
  );
}
