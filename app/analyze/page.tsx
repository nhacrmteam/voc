import { listVOC, sentimentStats } from '../../lib/data';

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
      {note && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: -6, marginBottom: 8 }}>{note}</div>}
      {data.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>ยังไม่มีข้อมูล</div>}
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

  const prod = groupBy(rows, 'catProduct');
  const sales = groupBy(rows, 'catSales');
  const journey = groupBy(rows, 'journey');
  const owner = groupBy(rows, 'owner');

  return (
    <>
      <header className="top">
        <h1>AI วิเคราะห์เสียงลูกค้า</h1>
        <div className="sub">AI ตรวจจับ Sentiment และจำแนกประเภทอัตโนมัติ · เจ้าหน้าที่ยืนยัน/แก้ไขได้ (human-in-the-loop)</div>
      </header>
      <div className="content">
        {/* Sentiment summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>เสียงลูกค้าทั้งหมด</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1f3a93' }}>{s.total.toLocaleString()}</div></div>
          <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>% เสียงเชิงบวก</div><div style={{ fontSize: 26, fontWeight: 700, color: '#16a34a' }}>{s.posPct}%</div></div>
          <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>% เป็นกลาง</div><div style={{ fontSize: 26, fontWeight: 700, color: '#64748b' }}>{s.neuPct}%</div></div>
          <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>% เสียงเชิงลบ</div><div style={{ fontSize: 26, fontWeight: 700, color: '#dc2626' }}>{s.negPct}%</div></div>
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
          <BarList title="Customer Journey (6 ขั้น)" data={journey} total={total} color="#0ea5e9" />
          <BarList title="ฝ่ายผู้รับผิดชอบ" note="จับคู่ฝ่ายตามประเภทเสียง" data={owner} total={total} color="#f59e0b" />
        </div>
      </div>
    </>
  );
}
