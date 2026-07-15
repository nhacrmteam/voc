import Link from 'next/link';
import { channelStats } from '../../lib/data';

export const dynamic = 'force-dynamic';

export default async function Channels() {
  const chans = await channelStats();
  const total = chans.reduce((a, c) => a + c.count, 0);
  return (
    <>
      <header className="top"><h1>8 ช่องทางรับฟังลูกค้า</h1><div className="sub">คลิกการ์ดช่องทางเพื่อดูรายละเอียดเฉพาะช่องทาง · รวม {total} รายการ</div></header>
      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 14 }}>
          {chans.map((c, i) => (
            <Link key={c.name} href={'/channels/' + encodeURIComponent(c.name)} className="card" style={{ display: 'block', cursor: 'pointer', marginBottom: 0 }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>ช่องทาง {i + 1}</div>
              <h3 style={{ marginBottom: 8 }}>{c.name}</h3>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1f3a93' }}>{c.count.toLocaleString()}<span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}> รายการ</span></div>
              <div style={{ fontSize: 12, marginTop: 7, color: '#475569' }}>เชิงลบ <b style={{ color: c.negPct > 20 ? '#dc2626' : '#f59e0b' }}>{c.negPct}%</b> · ดูรายละเอียด →</div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
