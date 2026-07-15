import Link from 'next/link';
import { listVOC, CHANNELS } from '../../../lib/data';

export const dynamic = 'force-dynamic';

const SENT_TH: Record<string, string> = { Positive: 'เชิงบวก', Neutral: 'เป็นกลาง', Negative: 'เชิงลบ' };
const SENT_COLOR: Record<string, string> = { Positive: '#16a34a', Neutral: '#64748b', Negative: '#dc2626' };

export default async function ChannelDetail({ params }: { params: { name: string } }) {
  const name = decodeURIComponent(params.name);
  const known = CHANNELS.includes(name);
  const rows = known ? await listVOC({ channel: name }) : [];
  const total = rows.length || 1;

  const sent = { Positive: 0, Neutral: 0, Negative: 0 };
  rows.forEach(r => { sent[r.sentiment]++; });
  const posPct = Math.round(sent.Positive / total * 100);
  const negPct = Math.round(sent.Negative / total * 100);
  const high = rows.filter(r => r.priority === 'High').length;

  const jr: Record<string, number> = {};
  rows.forEach(r => { if (r.journey) jr[r.journey] = (jr[r.journey] || 0) + 1; });
  const journey = Object.entries(jr).sort((a, b) => b[1] - a[1]);

  const tp: Record<string, number> = {};
  rows.forEach(r => { if (r.topic) tp[r.topic] = (tp[r.topic] || 0) + 1; });
  const topTopics = Object.entries(tp).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <>
      <header className="top">
        <h1>{name}</h1>
        <div className="sub"><Link href="/channels" style={{ color: '#2e6cf0' }}>← กลับ 8 ช่องทาง</Link> · เจาะลึกเฉพาะช่องทางนี้</div>
      </header>
      <div className="content">
        {!known ? (
          <div className="card">ไม่พบช่องทางนี้ — <Link href="/channels" style={{ color: '#2e6cf0' }}>กลับไปหน้า 8 ช่องทาง</Link></div>
        ) : rows.length === 0 ? (
          <div className="card">ยังไม่มีข้อมูลในช่องทางนี้</div>
        ) : (
          <>
            {/* KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
              <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>จำนวนเสียงลูกค้า</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1f3a93' }}>{rows.length.toLocaleString()}</div></div>
              <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>% เสียงเชิงบวก</div><div style={{ fontSize: 26, fontWeight: 700, color: '#16a34a' }}>{posPct}%</div></div>
              <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>% เสียงเชิงลบ</div><div style={{ fontSize: 26, fontWeight: 700, color: '#dc2626' }}>{negPct}%</div></div>
              <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>เร่งด่วนสูง (High)</div><div style={{ fontSize: 26, fontWeight: 700, color: '#f59e0b' }}>{high}</div></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
              {/* Sentiment */}
              <div className="card">
                <h3>สัดส่วน Sentiment</h3>
                {(['Positive', 'Neutral', 'Negative'] as const).map(s => (
                  <div key={s} style={{ margin: '10px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                      <span>{SENT_TH[s]}</span><span style={{ fontWeight: 600 }}>{sent[s]} ({Math.round(sent[s] / total * 100)}%)</span>
                    </div>
                    <div style={{ height: 8, background: '#eef2f7', borderRadius: 6 }}>
                      <div style={{ width: Math.round(sent[s] / total * 100) + '%', height: '100%', background: SENT_COLOR[s], borderRadius: 6 }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Customer Journey */}
              <div className="card">
                <h3>Customer Journey</h3>
                {journey.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <span>{k}</span><span style={{ fontWeight: 600, color: '#1f3a93' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Top topics */}
              <div className="card">
                <h3>ประเด็นที่พูดถึงมาก</h3>
                {topTopics.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <span>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent list */}
            <div className="card" style={{ marginTop: 16 }}>
              <h3>เสียงลูกค้าล่าสุดในช่องทางนี้</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef2f7' }}>
                    <th style={{ padding: '8px 6px' }}>รหัส</th><th>แหล่ง</th><th>ประเด็น / เสียงลูกค้า</th><th>Sentiment</th><th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}><Link href={'/voc/' + r.id} style={{ color: '#2e6cf0' }}>{r.ref}</Link></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.source}</td>
                      <td><b>{r.topic}</b><div style={{ color: '#64748b' }}>{r.voice}</div></td>
                      <td style={{ whiteSpace: 'nowrap', color: SENT_COLOR[r.sentiment], fontWeight: 600 }}>{SENT_TH[r.sentiment]}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
