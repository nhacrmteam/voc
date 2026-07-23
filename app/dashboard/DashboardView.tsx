'use client';
// DashboardView — หน้าภาพรวม (interactive): LIVE ticker + ตัวกรองช่วงเวลา/ผลิตภัณฑ์/ประเภท/ชื่อโครงการ
// คำนวณ KPI/Pipeline/แนวโน้ม จากข้อมูลจริงตามตัวกรองที่เลือก
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';
import { CASE_STATUS, PROJECT_TYPES } from '../../lib/data';

const PRODUCTS = ['อาคารเพื่อขาย/เช่าซื้อ', 'อาคารเช่า', 'เช่าจัดประโยชน์'];
const COL: Record<string, string> = {
  'รับเรื่อง': '#94a3b8', 'ส่งต่อหน่วยงานที่รับผิดชอบ': '#4aa3ff', 'กำลังดำเนินการ': '#2e6cf0',
  'รอข้อมูลเพิ่มเติม': '#f59e0b', 'ติดตามผล': '#8b5cf6', 'ดำเนินการเสร็จ/ปิดเรื่อง': '#16a34a',
};
// ปีงบประมาณ (พ.ศ.) — ปีงบ Y เริ่ม 1 ต.ค. ปี (Y-1)
// คำนวณปีงบ+ไตรมาส "ปัจจุบัน" จากวันที่จริง (เลื่อนตามเวลาเอง)
function currentFYQuarter(): { be: number; q: string } {
  const d = new Date();
  const y = d.getFullYear(), mo = d.getMonth();   // 0=ม.ค. ... 9=ต.ค.
  const be = (mo >= 9 ? y + 1 : y) + 543;
  const q = mo >= 9 ? 'q1' : mo <= 2 ? 'q2' : mo <= 5 ? 'q3' : 'q4';
  return { be, q };
}
const QUARTERS: { k: string; label: string }[] = [
  { k: 'year', label: 'ทั้งปี (สะสม)' },
  { k: 'q1', label: 'ไตรมาส 1 (ต.ค.–ธ.ค.)' },
  { k: 'q2', label: 'ไตรมาส 2 (ม.ค.–มี.ค.)' },
  { k: 'q3', label: 'ไตรมาส 3 (เม.ย.–มิ.ย.)' },
  { k: 'q4', label: 'ไตรมาส 4 (ก.ค.–ก.ย.)' },
];
// คืนช่วงวันที่ (ค.ศ.) ของปีงบ be + ไตรมาส q
function periodRange(be: number, q: string): { from: string; to: string } {
  const s = be - 543 - 1;   // ปี ค.ศ. เริ่มต้น (ต.ค.)
  const e = be - 543;       // ปี ค.ศ. สิ้นสุด (ก.ย.)
  const m: Record<string, [string, string]> = {
    q1: [`${s}-10-01`, `${s}-12-31`],
    q2: [`${e}-01-01`, `${e}-03-31`],
    q3: [`${e}-04-01`, `${e}-06-30`],
    q4: [`${e}-07-01`, `${e}-09-30`],
    year: [`${s}-10-01`, `${e}-09-30`],
  };
  const [from, to] = m[q] || m.year;
  return { from, to };
}

function Spark({ arr, color }: { arr: number[]; color: string }) {
  if (arr.length < 2) return null;
  const w = 120, h = 26, mx = Math.max(...arr), mn = Math.min(...arr);
  const pts = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - 3 - (v - mn) / ((mx - mn) || 1) * (h - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', marginTop: 6 }}>
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color + '22'} stroke="none" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}
function dateSeries(rows: Voc[], from: string, to: string, buckets = 12) {
  const f = new Date(from).getTime(), t = new Date(to).getTime();
  const step = (t - f) / buckets;
  const out = new Array(buckets).fill(0);
  rows.forEach(r => { const d = new Date(r.occurredAt).getTime(); if (d >= f && d <= t) { const i = Math.min(buckets - 1, Math.max(0, Math.floor((d - f) / step))); out[i]++; } });
  return out;
}
const sel: React.CSSProperties = { padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'inherit' };

export default function DashboardView({ rows }: { rows: Voc[] }) {
  const [maxFY, setMaxFY] = useState(2569);        // ปีงบล่าสุด (อ้างอิงวันปัจจุบัน)
  const [beYear, setBeYear] = useState(2569);
  const [quarter, setQuarter] = useState('q3');
  const [product, setProduct] = useState('all');
  const [ptype, setPtype] = useState('all');
  const [projText, setProjText] = useState('');   // ช่องพิมพ์ค้นหาชื่อโครงการ
  const [tick, setTick] = useState<Voc | null>(null);

  // ตั้งค่าเริ่มต้นเป็นปีงบ+ไตรมาสปัจจุบันตอนโหลด (เลื่อนตามเวลาเอง)
  useEffect(() => {
    const { be, q } = currentFYQuarter();
    setMaxFY(be); setBeYear(be); setQuarter(q);
  }, []);
  const YEARS = [maxFY, maxFY - 1, maxFY - 2];

  // LIVE ticker — หมุนแสดงเสียงลูกค้าล่าสุด
  useEffect(() => {
    if (!rows.length) return;
    const pick = () => setTick(rows[Math.floor(Math.random() * rows.length)]);
    pick();
    const id = setInterval(pick, 3500);
    return () => clearInterval(id);
  }, [rows]);

  // รายชื่อโครงการ (cascade ตามประเภท)
  const projectNames = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (r.project) m.set(r.project, r.projectType); });
    return Array.from(m, ([name, type]) => ({ name, type }));
  }, [rows]);
  const projOptions = ptype === 'all' ? projectNames : projectNames.filter(p => p.type === ptype);

  const range = periodRange(beYear, quarter);
  const qLabel = QUARTERS.find(q => q.k === quarter)?.label || '';
  const pd = { from: range.from, to: range.to, label: `ปีงบ ${beYear} · ${qLabel}` };
  const projQ = projText.trim().toLowerCase();
  // กรองตามตัวกรองทั้งหมด (ยกเว้นช่วงเวลา) — ใช้กับการ์ดเวลา
  const fBase = useMemo(() => rows.filter(r =>
    (product === 'all' || r.product === product) &&
    (ptype === 'all' || r.projectType === ptype) &&
    (!projQ || (r.project || '').toLowerCase().includes(projQ))
  ), [rows, product, ptype, projQ]);
  // กรองตามช่วงเวลาที่เลือกด้วย — ใช้กับ KPI/Pipeline
  const f = useMemo(() => fBase.filter(r => r.occurredAt >= pd.from && r.occurredAt <= pd.to), [fBase, pd]);

  const total = f.length || 1;
  const pos = f.filter(r => r.sentiment === 'Positive').length;
  const neg = f.filter(r => r.sentiment === 'Negative').length;
  const high = f.filter(r => r.priority === 'High').length;
  const posPct = Math.round(pos / total * 100), negPct = Math.round(neg / total * 100);

  const pipe: Record<string, number> = {}; CASE_STATUS.forEach(s => pipe[s] = 0);
  f.forEach(r => pipe[r.status] = (pipe[r.status] || 0) + 1);
  const pipeTotal = f.length || 1;
  const doneKey: string = 'ดำเนินการเสร็จ/ปิดเรื่อง';

  // การ์ดเวลา (วันนี้/7วัน/เดือน/ปีงบ) จาก fBase — อ้างอิงวันที่ล่าสุดในข้อมูล
  const dates = fBase.map(r => r.occurredAt).filter(Boolean).sort();
  const anchor = dates.length ? dates[dates.length - 1] : '2026-06-26';
  const A = new Date(anchor);
  const daysAgo = (n: number) => new Date(A.getTime() - n * 86400000).toISOString().slice(0, 10);
  const inRange = (from: string, to: string) => fBase.filter(r => r.occurredAt >= from && r.occurredAt <= to).length;
  const cards = [
    { lab: 'วันนี้ (ล่าสุดในข้อมูล)', n: inRange(anchor, anchor), color: '#1f3a93', spark: dateSeries(fBase, daysAgo(6), anchor, 7) },
    { lab: '7 วันล่าสุด', n: inRange(daysAgo(6), anchor), color: '#2e6cf0', spark: dateSeries(fBase, daysAgo(13), anchor, 14) },
    { lab: 'เดือนนี้', n: inRange(daysAgo(29), anchor), color: '#0e7c86', spark: dateSeries(fBase, daysAgo(29), anchor, 15) },
    { lab: 'ปีงบประมาณ 2569', n: inRange('2025-10-01', '2026-09-30'), color: '#8b5cf6', spark: dateSeries(fBase, daysAgo(29), anchor, 15) },
  ];

  // ประเด็นที่ต้องจับตา + Top โครงการ (จากช่วงที่เลือก)
  const negTopic: Record<string, { c: number; neg: number }> = {};
  f.forEach(r => { negTopic[r.topic] ||= { c: 0, neg: 0 }; negTopic[r.topic].c++; if (r.sentiment === 'Negative') negTopic[r.topic].neg++; });
  const watch = Object.entries(negTopic).filter(([, o]) => o.neg > 0).sort((a, b) => b[1].neg - a[1].neg).slice(0, 5);
  const projAgg: Record<string, number> = {};
  f.forEach(r => { if (r.project) projAgg[r.project] = (projAgg[r.project] || 0) + 1; });
  const topProjects = Object.entries(projAgg).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxProj = topProjects.length ? topProjects[0][1] : 1;

  const trend = dateSeries(f, pd.from, pd.to, 12);
  const sp = tick ? (tick.sentiment === 'Positive' ? 'p-pos' : tick.sentiment === 'Negative' ? 'p-neg' : 'p-neu') : 'p-neu';

  return (
    <>
      <header className="top">
        <h1>ภาพรวมเสียงของลูกค้า</h1>
        <div className="sub">สรุปข้อมูลเชิงปริมาณและคุณภาพจาก 8 ช่องทาง</div>
        {/* แถบตัวกรอง: ปีงบ → ไตรมาส → ผลิตภัณฑ์ → ประเภท → ชื่อโครงการ(ค้นหา) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <select style={sel} value={beYear} onChange={e => setBeYear(Number(e.target.value))}>
            {YEARS.map(y => <option key={y} value={y}>ปีงบประมาณ {y}</option>)}
          </select>
          <select style={sel} value={quarter} onChange={e => setQuarter(e.target.value)}>
            {QUARTERS.map(q => <option key={q.k} value={q.k}>{q.label}</option>)}
          </select>
          <select style={sel} value={product} onChange={e => setProduct(e.target.value)}>
            <option value="all">ทุกกลุ่มผลิตภัณฑ์</option>
            {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select style={sel} value={ptype} onChange={e => { setPtype(e.target.value); setProjText(''); }}>
            <option value="all">ทุกประเภทโครงการ</option>
            {PROJECT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={{ position: 'relative' }}>
            <input list="dash-projects" style={{ ...sel, width: 220 }} value={projText}
              onChange={e => setProjText(e.target.value)}
              placeholder={`🔎 ทุกชื่อโครงการ${ptype !== 'all' ? ` (${projOptions.length})` : ''}`} />
            <datalist id="dash-projects">
              {projOptions.map(p => <option key={p.name} value={p.name} />)}
            </datalist>
            {projText && <button type="button" onClick={() => setProjText('')} title="ล้าง"
              style={{ position: 'absolute', right: 6, top: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>✕</button>}
          </div>
        </div>
      </header>

      <div className="content">
        {/* LIVE ticker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', color: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginBottom: 16, overflow: 'hidden' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', flexShrink: 0, boxShadow: '0 0 0 0 rgba(239,68,68,.6)', animation: 'pulse 1.6s infinite' }} />
          <b style={{ fontSize: 11, color: '#fca5a5', flexShrink: 0 }}>LIVE</b>
          <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'opacity .25s' }}>
            {tick ? (
              <><span className="tag">{tick.ref}</span> &nbsp;{tick.channel}{tick.source !== tick.channel ? ' › ' + tick.source : ''} &nbsp;·&nbsp; {tick.topic} &nbsp;<span className={'pill ' + sp}>{tick.sentiment}</span></>
            ) : 'กำลังรับฟังเสียงลูกค้า…'}
          </div>
        </div>
        <style>{`@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}70%{box-shadow:0 0 0 7px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}`}</style>

        {/* การ์ดเวลา + sparkline */}
        <div className="cards">
          {cards.map(c => (
            <div key={c.lab} className="kpi">
              <div className="lab">{c.lab}</div>
              <div className="val" style={{ color: c.color }}>{c.n.toLocaleString()}</div>
              <Spark arr={c.spark} color={c.color} />
            </div>
          ))}
        </div>

        {/* KPI ตามช่วงที่เลือก */}
        <div className="cards">
          <div className="kpi"><div className="lab">เสียงลูกค้าทั้งหมด ({pd.label})</div><div className="val">{f.length.toLocaleString()}</div></div>
          <div className="kpi"><div className="lab">เสียงเชิงบวก (% Positive)</div><div className="val" style={{ color: 'var(--green)' }}>{posPct}%</div></div>
          <div className="kpi"><div className="lab">เสียงเชิงลบ (% Negative)</div><div className="val" style={{ color: 'var(--red)' }}>{negPct}%</div></div>
          <div className="kpi"><div className="lab">เรื่องเร่งด่วน (High)</div><div className="val" style={{ color: 'var(--amber)' }}>{high}</div></div>
        </div>

        {/* แนวโน้มในช่วงที่เลือก */}
        <div className="card">
          <h3>📈 แนวโน้มจำนวนเสียงลูกค้า — {pd.label}</h3>
          <Spark arr={trend} color="#1f3a93" />
        </div>

        {/* Case Pipeline */}
        <div className="card">
          <h3>📋 สถานะการดำเนินการเรื่อง (Case Pipeline)</h3>
          <div className="pipe">
            {CASE_STATUS.map(s => { const w = pipeTotal ? (pipe[s] / pipeTotal * 100) : 0; return <div key={s} title={s + ': ' + pipe[s]} style={{ width: w + '%', background: COL[s] }} />; })}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
            {CASE_STATUS.map(s => <span key={s}><b style={{ color: COL[s] }}>●</b> {s}: <b>{pipe[s]}</b></span>)}
          </div>
        </div>

        {/* ประเด็นจับตา + Top โครงการ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <h3>⚠️ ประเด็นที่ต้องจับตา</h3>
            {watch.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>ไม่มีเสียงเชิงลบในช่วง/ตัวกรองนี้</div>}
            {watch.map(([t, o]) => (
              <div key={t} style={{ padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Link href={'/voc?q=' + encodeURIComponent(t)} style={{ fontWeight: 600 }}>{t}</Link>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>{o.neg} ลบ</span>
                </div>
                <div style={{ height: 6, background: '#fee2e2', borderRadius: 6, marginTop: 4 }}>
                  <div style={{ width: Math.round(o.neg / o.c * 100) + '%', height: '100%', background: '#dc2626', borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <h3>🏠 Top ชื่อโครงการที่มีเสียงลูกค้าสูงสุด</h3>
            {topProjects.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>ไม่มีข้อมูลในตัวกรองนี้</div>}
            {topProjects.map(([p, n], i) => (
              <div key={p} style={{ margin: '9px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                  <span>{i + 1}. {p}</span><span style={{ fontWeight: 700, color: '#1f3a93' }}>{n}</span>
                </div>
                <div style={{ height: 7, background: '#eef2f7', borderRadius: 6 }}>
                  <div style={{ width: Math.round(n / maxProj * 100) + '%', height: '100%', background: '#2e6cf0', borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* รายการล่าสุด */}
        <div className="card">
          <h3>💬 รายการล่าสุด ({pd.label})</h3>
          <table>
            <thead><tr><th>รหัส</th><th>วันที่ต้นทาง</th><th>ช่องทาง</th><th>โครงการ</th><th>หัวข้อ</th><th>Sentiment</th><th>สถานะ</th></tr></thead>
            <tbody>{f.slice(0, 15).map(r => (
              <tr key={r.id}>
                <td><Link href={'/voc/' + r.id} className="tag">{r.ref}</Link></td>
                <td>{r.occurredAt}{r.imported ? ' (ไฟล์)' : ''}</td>
                <td>{r.channel}</td><td>{r.project}</td><td>{r.topic}</td>
                <td><span className={'pill ' + (r.sentiment === 'Positive' ? 'p-pos' : r.sentiment === 'Negative' ? 'p-neg' : 'p-neu')}>{r.sentiment}</span></td>
                <td>{r.status}</td>
              </tr>))}
            </tbody>
          </table>
          {f.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>ไม่มีข้อมูลในช่วง/ตัวกรองนี้</div>}
        </div>
      </div>
    </>
  );
}
