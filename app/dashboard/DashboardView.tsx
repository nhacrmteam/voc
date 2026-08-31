'use client';
// DashboardView — หน้าภาพรวม (interactive): LIVE ticker + ตัวกรองช่วงเวลา/ผลิตภัณฑ์/ประเภท/ชื่อโครงการ
// คำนวณ KPI/Pipeline/แนวโน้ม จากข้อมูลจริงตามตัวกรองที่เลือก
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';
import { PROJECT_TYPES, CHANNELS, JOURNEYS, JOURNEY_TH, JOURNEY_COLOR } from '../../lib/data';

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

const SENT_COLOR = { pos: '#16a34a', neu: '#f59e0b', neg: '#dc2626' };   // เขียว/เหลือง/แดง — ชุดเดียวกับหน้า 8 ช่องทาง

/** กราฟผสม: แท่ง = จำนวนเสียง · เส้น = %เชิงบวก และ %เชิงลบ (แกน % อยู่ขวา) */
function TrendCombo({ data }: { data: { label: string; n: number; pos: number; neg: number }[] }) {
  const W = 760, H = 260, L = 46, R = 40, T = 14, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const maxN = Math.max(...data.map(d => d.n), 1);
  const niceMax = Math.ceil(maxN / 5) * 5 || 5;
  const x = (i: number) => L + (data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2);
  const yN = (v: number) => T + ih - (v / niceMax) * ih;
  const yP = (v: number) => T + ih - (v / 100) * ih;
  const bw = Math.max(8, Math.min(38, iw / data.length * 0.55));
  const line = (key: 'pos' | 'neg') => data.map((d, i) => `${x(i).toFixed(1)},${yP(d[key]).toFixed(1)}`).join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', minWidth: 520 }} role="img"
        aria-label="กราฟแนวโน้มจำนวนเสียงลูกค้าและสัดส่วน sentiment รายเดือน">
        {/* เส้นกริดแนวนอน + แกนซ้าย (จำนวน) + แกนขวา (%) */}
        {[0, 0.25, 0.5, 0.75, 1].map(p => {
          const yy = T + ih - p * ih;
          return (
            <g key={p}>
              <line x1={L} y1={yy} x2={W - R} y2={yy} stroke="#e8edf5" strokeWidth={1} />
              <text x={L - 7} y={yy + 3.5} textAnchor="end" fontSize={10} fill="#94a3b8">{Math.round(niceMax * p).toLocaleString()}</text>
              <text x={W - R + 7} y={yy + 3.5} fontSize={10} fill="#94a3b8">{Math.round(100 * p)}</text>
            </g>
          );
        })}
        {/* แท่งจำนวนเสียง */}
        {data.map((d, i) => (
          <rect key={d.label} x={x(i) - bw / 2} y={yN(d.n)} width={bw} height={Math.max(0, T + ih - yN(d.n))}
            fill="#c7d7f7" rx={3}><title>{d.label}: {d.n.toLocaleString()} เสียง</title></rect>
        ))}
        {/* เส้น % เชิงบวก / เชิงลบ */}
        <polyline points={line('pos')} fill="none" stroke={SENT_COLOR.pos} strokeWidth={2.5} strokeLinejoin="round" />
        <polyline points={line('neg')} fill="none" stroke={SENT_COLOR.neg} strokeWidth={2.5} strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={'p' + d.label}>
            <circle cx={x(i)} cy={yP(d.pos)} r={3.5} fill={SENT_COLOR.pos}><title>{d.label}: เชิงบวก {d.pos}%</title></circle>
            <circle cx={x(i)} cy={yP(d.neg)} r={3.5} fill={SENT_COLOR.neg}><title>{d.label}: เชิงลบ {d.neg}%</title></circle>
          </g>
        ))}
        {/* ชื่อเดือน */}
        {data.map((d, i) => (
          <text key={'x' + d.label} x={x(i)} y={H - 12} textAnchor="middle" fontSize={10.5} fill="#64748b">{d.label}</text>
        ))}
        <text x={12} y={T + ih / 2} fontSize={10} fill="#94a3b8" transform={`rotate(-90 12 ${T + ih / 2})`} textAnchor="middle">จำนวน</text>
        <text x={W - 8} y={T + ih / 2} fontSize={10} fill="#94a3b8" textAnchor="middle">%</text>
      </svg>
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', fontSize: 12, marginTop: 4, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 14, height: 9, background: '#c7d7f7', borderRadius: 2, marginRight: 6 }} />จำนวน VOC</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 3, background: SENT_COLOR.pos, marginRight: 6, verticalAlign: 'middle' }} />% เชิงบวก</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 3, background: SENT_COLOR.neg, marginRight: 6, verticalAlign: 'middle' }} />% เชิงลบ</span>
      </div>
    </div>
  );
}

/** โดนัทสัดส่วน sentiment — เขียว/เหลือง/แดง */
function SentDonut({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = pos + neu + neg;
  const segs = [
    { lab: 'เชิงบวก', v: pos, c: SENT_COLOR.pos },
    { lab: 'เป็นกลาง', v: neu, c: SENT_COLOR.neu },
    { lab: 'เชิงลบ', v: neg, c: SENT_COLOR.neg },
  ];
  let acc = 0;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 42 42" width={190} height={190} role="img" aria-label="สัดส่วน sentiment">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#eef2f7" strokeWidth="6" />
        {total > 0 && segs.map(s => {
          const p = s.v / total * 100;
          const el = <circle key={s.lab} cx="21" cy="21" r="15.915" fill="none" stroke={s.c} strokeWidth="6"
            strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={25 - acc} ><title>{s.lab} {s.v.toLocaleString()} ({Math.round(p)}%)</title></circle>;
          acc += p;
          return el;
        })}
        <text x="21" y="20" textAnchor="middle" style={{ fontSize: 5.5, fontWeight: 700, fill: 'var(--ink)' }}>{total.toLocaleString()}</text>
        <text x="21" y="25.5" textAnchor="middle" style={{ fontSize: 2.6, fill: 'var(--muted)' }}>เสียงลูกค้า</text>
      </svg>
      <div style={{ marginTop: 8 }}>
        {segs.map(s => (
          <div key={s.lab} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 6px' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.c, marginRight: 7 }} />{s.lab}</span>
            <b>{s.v.toLocaleString()} ({total ? Math.round(s.v / total * 100) : 0}%)</b>
          </div>
        ))}
      </div>
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

  // ---- แนวโน้มรายเดือน + sentiment (12 เดือนของปีงบที่เลือก / 12 เดือนล่าสุดถ้าเลือกทั้งหมด) ----
  const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const monthly = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    if (allTime) {
      const end = new Date(anchor);
      for (let i = 11; i >= 0; i--) {
        const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
        months.push({ key: d.toISOString().slice(0, 7), label: TH_MON[d.getMonth()] });
      }
    } else {
      // ปีงบเริ่ม ต.ค. ของปี (beYear-543-1) → ก.ย. ของปี (beYear-543)
      const startY = beYear - 543 - 1;
      for (let i = 0; i < 12; i++) {
        const d = new Date(startY, 9 + i, 1);
        months.push({ key: d.toISOString().slice(0, 7), label: TH_MON[d.getMonth()] });
      }
    }
    return months.map(m => {
      const rs = fBase.filter(r => (r.occurredAt || '').slice(0, 7) === m.key);
      const t = rs.length || 1;
      return {
        label: m.label, n: rs.length,
        pos: Math.round(rs.filter(r => r.sentiment === 'Positive').length / t * 100),
        neg: Math.round(rs.filter(r => r.sentiment === 'Negative').length / t * 100),
      };
    });
  }, [fBase, allTime, anchor, beYear]);

  // ---- สัดส่วน sentiment (ช่วงที่เลือก) ----
  const neu = f.filter(r => r.sentiment === 'Neutral').length;

  // ---- เสียงลูกค้าแยกตาม 8 ช่องทาง (ช่วงที่เลือก) ----
  const CH_COLOR = ['#1f3a93', '#2e6cf0', '#60a5fa', '#16a34a', '#38bdf8', '#f59e0b', '#dc2626', '#8b5cf6'];
  const chanRows = CHANNELS.map((name, i) => ({
    name, n: f.filter(r => r.channel === name).length, color: CH_COLOR[i % CH_COLOR.length],
  }));
  const chanMax = Math.max(...chanRows.map(c => c.n), 1);

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

        {/* แนวโน้ม & Sentiment + สัดส่วน Sentiment */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.1fr) minmax(240px,1fr)', gap: 16, marginBottom: 16 }} className="dash-2col">
          <div className="card" style={{ marginBottom: 0 }}>
            <h3>📈 แนวโน้มเสียงลูกค้า &amp; Sentiment</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 8 }}>
              ช่วง: {allTime ? '12 เดือนล่าสุด' : `ปีงบประมาณ ${beYear} (ต.ค. ${String(beYear - 1).slice(-2)} – ก.ย. ${String(beYear).slice(-2)})`}
            </div>
            <TrendCombo data={monthly} />
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <h3>🎭 สัดส่วน Sentiment</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 8 }}>ภาพรวมทั้ง 8 ช่องทาง · {pd.label}</div>
            <SentDonut pos={pos} neu={neu} neg={neg} />
          </div>
        </div>

        {/* เสียงลูกค้าแยกตาม 8 ช่องทาง */}
        <div className="card">
          <h3>📥 เสียงลูกค้าแยกตาม 8 ช่องทาง</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 12 }}>จำนวนรายการที่รับเข้าใน {pd.label}</div>
          {chanRows.map(c => (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '7px 0' }}>
              <div style={{ width: 168, flexShrink: 0, fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 5, height: 20, position: 'relative' }}>
                <div style={{ width: Math.round(c.n / chanMax * 100) + '%', height: '100%', background: c.color, borderRadius: 5, transition: 'width .3s' }} />
              </div>
              <div style={{ width: 60, fontSize: 12.5, fontWeight: 700, color: c.color }}>{c.n.toLocaleString()}</div>
            </div>
          ))}
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
