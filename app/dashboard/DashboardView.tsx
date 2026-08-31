'use client';
// DashboardView — หน้าภาพรวม (interactive): LIVE ticker + ตัวกรองช่วงเวลา/ผลิตภัณฑ์/ประเภท/ชื่อโครงการ
// คำนวณ KPI/Pipeline/แนวโน้ม จากข้อมูลจริงตามตัวกรองที่เลือก
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';
import { PROJECT_TYPES, JOURNEYS, JOURNEY_TH, JOURNEY_COLOR } from '../../lib/data';

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

/** ตัวเลขเปรียบเทียบกับช่วงก่อน — ▲ ดีขึ้น / ▼ ลดลง */
function Delta({ now, prev, label, invert = false }: { now: number; prev: number; label: string; invert?: boolean }) {
  if (!prev) return <div className="kdelta flat">— ไม่มีข้อมูลช่วงก่อน</div>;
  const diff = now - prev;
  const pct = Math.round(Math.abs(diff) / prev * 1000) / 10;
  if (diff === 0) return <div className="kdelta flat">= เท่ากับ{label.replace('เทียบ', '')}</div>;
  const good = invert ? diff < 0 : diff > 0;   // invert = ตัวเลขลดลงถือว่าดี (เช่น เสียงเชิงลบ)
  return (
    <div className={'kdelta ' + (good ? 'up' : 'down')}>
      {diff > 0 ? '▲' : '▼'} {pct}% {label}
    </div>
  );
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

  const allTime = beYear === 0;   // 0 = ทั้งหมด ตั้งแต่มีระบบ
  const range = periodRange(beYear, quarter);
  const qLabel = QUARTERS.find(q => q.k === quarter)?.label || '';
  const pd = allTime
    ? { from: '0000-01-01', to: '9999-12-31', label: 'ทั้งหมด (ตั้งแต่มีระบบ)' }
    : { from: range.from, to: range.to, label: `ปีงบ ${beYear} · ${qLabel}` };
  const projQ = projText.trim().toLowerCase();
  // กรองตามตัวกรองทั้งหมด (ยกเว้นช่วงเวลา) — ใช้กับการ์ดเวลา
  const fBase = useMemo(() => rows.filter(r =>
    (ptype === 'all' || r.projectType === ptype) &&
    (!projQ || (r.project || '').toLowerCase().includes(projQ))
  ), [rows, ptype, projQ]);
  // กรองตามช่วงเวลาที่เลือกด้วย — ใช้กับ KPI/Pipeline
  const f = useMemo(() => fBase.filter(r => r.occurredAt >= pd.from && r.occurredAt <= pd.to), [fBase, pd]);

  const total = f.length || 1;
  const pos = f.filter(r => r.sentiment === 'Positive').length;
  const neg = f.filter(r => r.sentiment === 'Negative').length;
  const high = f.filter(r => r.priority === 'High').length;
  const posPct = Math.round(pos / total * 100), negPct = Math.round(neg / total * 100);

  // สรุปสะสมทั้งองค์กร (ทุกเสียงตั้งแต่มีระบบ — ไม่ขึ้นกับตัวกรอง) — เน้น monitoring
  const allTotal = rows.length;
  const allPos = rows.filter(r => r.sentiment === 'Positive').length;
  const allNeg = rows.filter(r => r.sentiment === 'Negative').length;
  const allHigh = rows.filter(r => r.priority === 'High').length;
  const allPosPct = allTotal ? Math.round(allPos / allTotal * 100) : 0;
  const allNegPct = allTotal ? Math.round(allNeg / allTotal * 100) : 0;
  // ประเด็นซ้ำ (recurring) = หัวข้อที่พบตั้งแต่ 3 ครั้งขึ้นไป
  const topicCountAll: Record<string, number> = {};
  rows.forEach(r => { if (r.topic) topicCountAll[r.topic] = (topicCountAll[r.topic] || 0) + 1; });
  const recurringCount = Object.values(topicCountAll).filter(n => n >= 3).length;

  // การ์ดเวลา (วันนี้/7วัน/เดือน/ปีงบ) จาก fBase — อ้างอิงวันที่ล่าสุดในข้อมูล
  const dates = fBase.map(r => r.occurredAt).filter(Boolean).sort();
  const anchor = dates.length ? dates[dates.length - 1] : '2026-06-26';
  const A = new Date(anchor);
  const daysAgo = (n: number) => new Date(A.getTime() - n * 86400000).toISOString().slice(0, 10);
  const inRange = (from: string, to: string) => fBase.filter(r => r.occurredAt >= from && r.occurredAt <= to).length;
  // เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน — ผู้บริหารอยากรู้ว่า "ดีขึ้นหรือแย่ลง"
  const cards = [
    {
      lab: 'เสียงลูกค้าวันนี้', sub: 'วันล่าสุดในข้อมูล', color: '#2e6cf0',
      n: inRange(anchor, anchor), prev: inRange(daysAgo(1), daysAgo(1)), pl: 'เทียบเมื่อวาน',
      spark: dateSeries(fBase, daysAgo(6), anchor, 7),
    },
    {
      lab: 'สัปดาห์นี้', sub: '7 วันล่าสุด', color: '#0ea5e9',
      n: inRange(daysAgo(6), anchor), prev: inRange(daysAgo(13), daysAgo(7)), pl: 'เทียบสัปดาห์ก่อน',
      spark: dateSeries(fBase, daysAgo(13), anchor, 14),
    },
    {
      lab: 'เดือนนี้', sub: '30 วันล่าสุด', color: '#0e7c86',
      n: inRange(daysAgo(29), anchor), prev: inRange(daysAgo(59), daysAgo(30)), pl: 'เทียบเดือนก่อน',
      spark: dateSeries(fBase, daysAgo(29), anchor, 15),
    },
    {
      lab: 'ปีงบประมาณ ' + maxFY, sub: 'สะสมทั้งปีงบ', color: '#8b5cf6',
      n: inRange(`${maxFY - 543 - 1}-10-01`, `${maxFY - 543}-09-30`),
      prev: inRange(`${maxFY - 543 - 2}-10-01`, `${maxFY - 543 - 1}-09-30`), pl: 'เทียบปีก่อน',
      spark: dateSeries(fBase, daysAgo(29), anchor, 15),
    },
  ];

  // KPI ของช่วงที่เลือก เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน
  const spanMs = new Date(pd.to).getTime() - new Date(pd.from).getTime();
  const prevFrom = new Date(new Date(pd.from).getTime() - spanMs - 86400000).toISOString().slice(0, 10);
  const prevTo = new Date(new Date(pd.from).getTime() - 86400000).toISOString().slice(0, 10);
  const fPrev = fBase.filter(r => r.occurredAt >= prevFrom && r.occurredAt <= prevTo);
  const pTotal = fPrev.length || 1;
  const prevPosPct = Math.round(fPrev.filter(r => r.sentiment === 'Positive').length / pTotal * 100);
  const prevNegPct = Math.round(fPrev.filter(r => r.sentiment === 'Negative').length / pTotal * 100);
  const prevHigh = fPrev.filter(r => r.priority === 'High').length;

  // เสียงลูกค้าตาม Customer Journey (ช่วงที่เลือก)
  const jrCount: Record<string, number> = {};
  f.forEach(r => { if (r.journey) jrCount[r.journey] = (jrCount[r.journey] || 0) + 1; });
  const jrMax = Math.max(...JOURNEYS.map(j => jrCount[j] || 0), 1);

  // ประเด็นที่ต้องจับตา + Top โครงการ (จากช่วงที่เลือก)
  const negTopic: Record<string, { c: number; neg: number }> = {};
  f.forEach(r => { negTopic[r.topic] ||= { c: 0, neg: 0 }; negTopic[r.topic].c++; if (r.sentiment === 'Negative') negTopic[r.topic].neg++; });
  const watch = Object.entries(negTopic).filter(([, o]) => o.neg > 0).sort((a, b) => b[1].neg - a[1].neg).slice(0, 5);
  // จุดแข็ง — ประเด็นที่ได้เสียงเชิงบวกมากที่สุด (ระบบฟังทั้งสองด้าน ไม่ใช่แค่เสียงลบ)
  const posTopic: Record<string, { c: number; pos: number }> = {};
  f.forEach(r => { posTopic[r.topic] ||= { c: 0, pos: 0 }; posTopic[r.topic].c++; if (r.sentiment === 'Positive') posTopic[r.topic].pos++; });
  const strong = Object.entries(posTopic).filter(([, o]) => o.pos > 0).sort((a, b) => b[1].pos - a[1].pos).slice(0, 5);
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
            <option value={0}>ทั้งหมด (ตั้งแต่มีระบบ)</option>
            {YEARS.map(y => <option key={y} value={y}>ปีงบประมาณ {y}</option>)}
          </select>
          <select style={sel} value={quarter} onChange={e => setQuarter(e.target.value)} disabled={allTime}
            title={allTime ? 'เลือก "ทั้งหมด" อยู่ — ไม่แยกไตรมาส' : ''}>
            {QUARTERS.map(q => <option key={q.k} value={q.k}>{q.label}</option>)}
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

        {/* สรุปสะสมทั้งองค์กร (ทุกเสียงตั้งแต่มีระบบ — ค้างไว้เสมอ ไม่ขึ้นกับตัวกรอง) */}
        <div className="sumcard">
          <div className="sum-head">🗂️ สรุปสะสมทั้งองค์กร <span>ทุกเสียงลูกค้าตั้งแต่เริ่มมีระบบ — ไม่ขึ้นกับตัวกรองด้านบน</span></div>
          <div className="sum-grid">
            <div className="sum-item">
              <div className="l">เสียงลูกค้าสะสมทั้งหมด</div>
              <div className="v">{allTotal.toLocaleString()}</div>
              <div className="s">จาก 8 ช่องทาง</div>
            </div>
            <div className="sum-item">
              <div className="l">เสียงเชิงบวก</div>
              <div className="v" style={{ color: '#86efac' }}>{allPosPct}%</div>
              <div className="s">{allPos.toLocaleString()} รายการ</div>
            </div>
            <div className="sum-item">
              <div className="l">เสียงเชิงลบ</div>
              <div className="v" style={{ color: '#fca5a5' }}>{allNegPct}%</div>
              <div className="s">{allNeg.toLocaleString()} รายการ</div>
            </div>
            <div className="sum-item">
              <div className="l">เรื่องเร่งด่วนสะสม</div>
              <div className="v" style={{ color: '#fcd34d' }}>{allHigh.toLocaleString()}</div>
              <div className="s">ความรุนแรงระดับ High</div>
            </div>
            <div className="sum-item">
              <div className="l">ประเด็นเฝ้าระวัง</div>
              <div className="v" style={{ color: '#fcd34d' }}>{recurringCount.toLocaleString()}</div>
              <div className="s">ประเด็นที่เกิดซ้ำ ≥3 ครั้ง</div>
            </div>
          </div>
        </div>

        {/* การ์ดเวลา + sparkline */}
        <div className="kgrid">
          {cards.map(c => (
            <div key={c.lab} className="kcard" style={{ ['--kc' as string]: c.color }}>
              <div className="klab">{c.lab} <span style={{ opacity: .65 }}>· {c.sub}</span></div>
              <div className="kval">{c.n.toLocaleString()}</div>
              <Delta now={c.n} prev={c.prev} label={c.pl} />
              <div className="kspark"><Spark arr={c.spark} color={c.color} /></div>
            </div>
          ))}
        </div>

        {/* KPI ตามช่วงที่เลือก */}
        <div className="kgrid">
          <div className="kcard" style={{ ['--kc' as string]: '#1f3a93' }}>
            <div className="klab">เสียงลูกค้าทั้งหมด <span style={{ opacity: .65 }}>· {pd.label}</span></div>
            <div className="kval">{f.length.toLocaleString()}</div>
            <Delta now={f.length} prev={fPrev.length} label="จากช่วงก่อน" />
          </div>
          <div className="kcard" style={{ ['--kc' as string]: '#16a34a' }}>
            <div className="klab">เสียงเชิงบวก (% Positive)</div>
            <div className="kval">{posPct}%</div>
            <Delta now={posPct} prev={prevPosPct} label="จากช่วงก่อน" />
          </div>
          <div className="kcard" style={{ ['--kc' as string]: '#dc2626' }}>
            <div className="klab">เสียงเชิงลบ (% Negative)</div>
            <div className="kval">{negPct}%</div>
            <Delta now={negPct} prev={prevNegPct} label="จากช่วงก่อน" invert />
          </div>
          <div className="kcard" style={{ ['--kc' as string]: '#f59e0b' }}>
            <div className="klab">เรื่องเร่งด่วน (High)</div>
            <div className="kval">{high.toLocaleString()}</div>
            <Delta now={high} prev={prevHigh} label="จากช่วงก่อน" invert />
          </div>
        </div>

        {/* เสียงลูกค้าตาม Customer Journey */}
        <div className="card">
          <h3>🧭 เสียงลูกค้าตามเส้นทางลูกค้า (Customer Journey 6 ขั้น)</h3>
          <div className="jr-flow">
            {JOURNEYS.map((j, i) => (
              <span key={j}>{i > 0 && ' → '}{JOURNEY_TH[j]}</span>
            ))}
          </div>
          <div className="jr-grid">
            {JOURNEYS.map(j => {
              const n = jrCount[j] || 0;
              return (
                <Link key={j} href={'/voc'} className="jr-card" style={{ ['--jc' as string]: JOURNEY_COLOR[j].fg, display: 'block' }}
                  title={JOURNEY_TH[j] + ' (' + j + ') — ' + n.toLocaleString() + ' รายการ'}>
                  <div className="en">{j}</div>
                  <div className="n">{n.toLocaleString()}</div>
                  <div className="th">{JOURNEY_TH[j]}</div>
                  <div className="bar"><i style={{ width: Math.round(n / jrMax * 100) + '%' }} /></div>
                </Link>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
            นับตามตัวกรองด้านบน ({pd.label}) · AI จำแนกขั้นจากประเด็นในข้อความ และใช้ช่องทางต้นทางช่วยเมื่อกำกวม
          </div>
        </div>

        {/* แนวโน้มในช่วงที่เลือก */}
        <div className="card">
          <h3>📈 แนวโน้มจำนวนเสียงลูกค้า — {pd.label}</h3>
          <Spark arr={trend} color="#1f3a93" />
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
            <h3>🌟 จุดแข็งที่ลูกค้าชื่นชม</h3>
            {strong.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>ไม่มีเสียงเชิงบวกในช่วง/ตัวกรองนี้</div>}
            {strong.map(([t, o]) => (
              <div key={t} style={{ padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Link href={'/voc?q=' + encodeURIComponent(t)} style={{ fontWeight: 600 }}>{t}</Link>
                  <span style={{ color: 'var(--green)', fontWeight: 700, whiteSpace: 'nowrap' }}>{o.pos} บวก</span>
                </div>
                <div style={{ height: 6, background: '#dcfce7', borderRadius: 6, marginTop: 4 }}>
                  <div style={{ width: Math.round(o.pos / o.c * 100) + '%', height: '100%', background: '#16a34a', borderRadius: 6 }} />
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
              <Link href="/prioritize" style={{ color: 'var(--blue)' }}>ดูตารางจุดแข็งแบบถ่วงน้ำหนัก →</Link>
            </div>
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
            <thead><tr><th>รหัส</th><th>วันที่ต้นทาง</th><th>ช่องทาง</th><th>โครงการ</th><th>หัวข้อ</th><th>Sentiment</th><th>ความรุนแรง</th></tr></thead>
            <tbody>{f.slice(0, 15).map(r => (
              <tr key={r.id}>
                <td><Link href={'/voc/' + r.id} className="tag">{r.ref}</Link></td>
                <td>{r.occurredAt}{r.imported ? ' (ไฟล์)' : ''}</td>
                <td>{r.channel}</td><td>{r.project}</td><td>{r.topic}</td>
                <td><span className={'pill ' + (r.sentiment === 'Positive' ? 'p-pos' : r.sentiment === 'Negative' ? 'p-neg' : 'p-neu')}>{r.sentiment}</span></td>
                <td><span className={'pill ' + (r.priority === 'High' ? 'p-hi' : r.priority === 'Medium' ? 'p-md' : 'p-lo')}>{r.priority}</span></td>
              </tr>))}
            </tbody>
          </table>
          {f.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>ไม่มีข้อมูลในช่วง/ตัวกรองนี้</div>}
        </div>
      </div>
    </>
  );
}
