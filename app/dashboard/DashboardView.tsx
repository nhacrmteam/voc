'use client';
// DashboardView — หน้าภาพรวม (interactive): LIVE ticker + ตัวกรองช่วงเวลา/ผลิตภัณฑ์/ประเภท/ชื่อโครงการ
// คำนวณ KPI/Pipeline/แนวโน้ม จากข้อมูลจริงตามตัวกรองที่เลือก
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';
import { PROJECT_TYPES, CHANNELS, JOURNEYS, JOURNEY_TH, JOURNEY_COLOR } from '../../lib/data';
import EmptyState from '../components/EmptyState';
import VocModal from '../voc/VocModal';
import { vocHref, ALL_TIME } from '../../lib/vocLink';

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

/** สเกลแกนที่ลงตัวสวย — คืนค่าสูงสุดและระยะขีด */
function niceScale(max: number): { max: number; step: number } {
  if (max <= 4) return { max: 4, step: 1 };
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(max / step) * step, step };
}

/** เส้นโค้งนุ่มผ่านจุดที่กำหนด (Catmull-Rom → Bezier) */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * กราฟผสม: แท่ง = จำนวนเสียง · เส้นโค้ง = %เชิงบวก / %เชิงลบ (แกน % อยู่ขวา)
 * เดือนที่ยังไม่มีข้อมูลจะไม่ลากเส้น % ลงศูนย์ แต่ตัดช่วงเส้นแทน — กราฟจึงไม่หักแหลมผิดความหมาย
 */
function TrendCombo({ data }: { data: { label: string; n: number; pos: number; neg: number }[] }) {
  const W = 780, H = 280, L = 52, R = 44, T = 22, B = 40;
  const iw = W - L - R, ih = H - T - B;
  const sc = niceScale(Math.max(...data.map(d => d.n), 1));
  const x = (i: number) => L + (data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2);
  const yN = (v: number) => T + ih - (v / sc.max) * ih;
  const yP = (v: number) => T + ih - (v / 100) * ih;
  const bw = Math.max(10, Math.min(30, iw / data.length * 0.5));
  const ticks = Array.from({ length: Math.round(sc.max / sc.step) + 1 }, (_, i) => i * sc.step);
  const hasData = data.some(d => d.n > 0);

  // แบ่งเส้น % เป็นช่วง ๆ เฉพาะเดือนที่มีข้อมูลติดกัน
  const runs = (key: 'pos' | 'neg'): [number, number][][] => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    data.forEach((d, i) => {
      if (d.n > 0) cur.push([x(i), yP(d[key])]);
      else if (cur.length) { out.push(cur); cur = []; }
    });
    if (cur.length) out.push(cur);
    return out;
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', minWidth: 560 }} role="img"
        aria-label="กราฟแนวโน้มจำนวนเสียงลูกค้าและสัดส่วน sentiment รายเดือน">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#93b4f5" /><stop offset="100%" stopColor="#dbe6fb" />
          </linearGradient>
        </defs>

        {/* เส้นกริด + ตัวเลขแกนซ้าย (จำนวน) และแกนขวา (%) */}
        {ticks.map((v, i) => {
          const yy = yN(v);
          return (
            <g key={v}>
              <line x1={L} y1={yy} x2={W - R} y2={yy} stroke="#eef2f8" strokeWidth={1} />
              <text x={L - 9} y={yy + 3.5} textAnchor="end" fontSize={11} fill="#556274">{v.toLocaleString()}</text>
              <text x={W - R + 9} y={yy + 3.5} fontSize={11} fill="#556274">
                {Math.round(100 / (ticks.length - 1) * i)}
              </text>
            </g>
          );
        })}
        <line x1={L} y1={T + ih} x2={W - R} y2={T + ih} stroke="#cbd5e1" strokeWidth={1} />

        {/* แท่งจำนวนเสียง */}
        {data.map((d, i) => d.n > 0 && (
          <g key={d.label + i}>
            <rect x={x(i) - bw / 2} y={yN(d.n)} width={bw} height={Math.max(2, T + ih - yN(d.n))}
              fill="url(#barGrad)" rx={4}>
              <title>{d.label}: {d.n.toLocaleString()} เสียง · บวก {d.pos}% · ลบ {d.neg}%</title>
            </rect>
            <text x={x(i)} y={yN(d.n) - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill="#5578c4">{d.n.toLocaleString()}</text>
          </g>
        ))}

        {/* เส้น % เชิงบวก / เชิงลบ — ตัดช่วงที่ไม่มีข้อมูล */}
        {(['pos', 'neg'] as const).map(k => runs(k).map((seg, si) => (
          <path key={k + si} d={smoothPath(seg)} fill="none"
            stroke={k === 'pos' ? SENT_COLOR.pos : SENT_COLOR.neg}
            strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        )))}
        {data.map((d, i) => d.n > 0 && (
          <g key={'pt' + i}>
            <circle cx={x(i)} cy={yP(d.pos)} r={4} fill="#fff" stroke={SENT_COLOR.pos} strokeWidth={2.2}><title>{d.label}: เชิงบวก {d.pos}%</title></circle>
            <circle cx={x(i)} cy={yP(d.neg)} r={4} fill="#fff" stroke={SENT_COLOR.neg} strokeWidth={2.2}><title>{d.label}: เชิงลบ {d.neg}%</title></circle>
          </g>
        ))}

        {/* ชื่อเดือน — เดือนที่ยังไม่มีข้อมูลจะจางลง */}
        {data.map((d, i) => (
          <text key={'x' + i} x={x(i)} y={H - 14} textAnchor="middle" fontSize={11}
            fill={d.n > 0 ? '#475569' : '#94a3b8'} fontWeight={d.n > 0 ? 500 : 400}>{d.label}</text>
        ))}
        <text x={14} y={T + ih / 2} fontSize={11} fill="#556274" transform={`rotate(-90 14 ${T + ih / 2})`} textAnchor="middle">จำนวนเสียง</text>
        <text x={W - 10} y={T + ih / 2} fontSize={11} fill="#556274" transform={`rotate(90 ${W - 10} ${T + ih / 2})`} textAnchor="middle">เปอร์เซ็นต์</text>

        {!hasData && <text x={W / 2} y={T + ih / 2} textAnchor="middle" fontSize={13} fill="#556274">ยังไม่มีข้อมูลในช่วงนี้</text>}
      </svg>
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center', fontSize: 12, marginTop: 6, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 15, height: 10, background: 'linear-gradient(#93b4f5,#dbe6fb)', borderRadius: 3, marginRight: 6, verticalAlign: 'middle' }} />จำนวน VOC</span>
        <span><span style={{ display: 'inline-block', width: 16, height: 3, background: SENT_COLOR.pos, borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />% เชิงบวก</span>
        <span><span style={{ display: 'inline-block', width: 16, height: 3, background: SENT_COLOR.neg, borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />% เชิงลบ</span>
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
  const [openId, setOpenId] = useState<string | null>(null);   // รายการที่เปิดป๊อปอัปอยู่
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
  // ช่วงเวลาที่ตัวเลขบนหน้านี้ถูกคำนวณมา — ลิงก์ไปหน้ารายการ VOC ต้องพาช่วงนี้ไปด้วย
  // ไม่งั้นกดจากการ์ด "ทั้งปี (สะสม)" แล้วหน้าปลายทางจะเด้งกลับเป็นไตรมาสปัจจุบัน
  const period = { fy: beYear, qt: quarter };
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
  // Top 5 โครงการ แยกเป็นเสียงเชิงบวกสูงสุด / เชิงลบสูงสุด
  const projAgg: Record<string, { pos: number; neg: number }> = {};
  f.forEach(r => {
    if (!r.project) return;
    projAgg[r.project] ||= { pos: 0, neg: 0 };
    if (r.sentiment === 'Positive') projAgg[r.project].pos++;
    if (r.sentiment === 'Negative') projAgg[r.project].neg++;
  });
  const topPos = Object.entries(projAgg).filter(([, o]) => o.pos > 0).sort((a, b) => b[1].pos - a[1].pos).slice(0, 5);
  const topNeg = Object.entries(projAgg).filter(([, o]) => o.neg > 0).sort((a, b) => b[1].neg - a[1].neg).slice(0, 5);

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
          <b style={{ fontSize: 12, color: '#fca5a5', flexShrink: 0 }}>LIVE</b>
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
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
            นับตามตัวกรองด้านบน ({pd.label}) · AI จำแนกขั้นจากประเด็นในข้อความ และใช้ช่องทางต้นทางช่วยเมื่อกำกวม
          </div>
        </div>


        {/* ประเด็นจับตา + จุดแข็ง */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <h3>🔥 ประเด็น/เรื่องที่ต้องจับตา</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 8 }}>
              หัวข้อที่ถูกพูดถึงบ่อยและมีเสียงเชิงลบมาก — นำไปสู่การพัฒนาบริการ
            </div>
            {watch.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>ไม่มีเสียงเชิงลบในช่วง/ตัวกรองนี้</div>
              : watch.map(([t, o]) => (
                <div key={t} className="wl-row">
                  <div className="wl-name">
                    <span style={{ color: 'var(--red)' }}>⚠</span>
                    <Link href={vocHref(t, period)} title={t}>{t}</Link>
                  </div>
                  <div className="wl-bar" style={{ background: '#fee2e2' }}>
                    <i style={{ width: Math.round(o.neg / o.c * 100) + '%', background: '#dc2626' }} />
                  </div>
                  <div className="wl-meta" style={{ color: 'var(--red)' }}>
                    พูดถึง {o.c} · ลบ {o.neg} ({Math.round(o.neg / o.c * 100)}%)
                  </div>
                </div>
              ))}
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h3>🌟 จุดแข็งที่ลูกค้าชื่นชม</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 8 }}>
              หัวข้อที่ได้เสียงเชิงบวกมาก — ควรรักษาไว้และขยายผลไปโครงการอื่น
            </div>
            {strong.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>ไม่มีเสียงเชิงบวกในช่วง/ตัวกรองนี้</div>
              : strong.map(([t, o]) => (
                <div key={t} className="wl-row">
                  <div className="wl-name">
                    <span style={{ color: 'var(--green)' }}>👍</span>
                    <Link href={vocHref(t, period)} title={t}>{t}</Link>
                  </div>
                  <div className="wl-bar" style={{ background: '#dcfce7' }}>
                    <i style={{ width: Math.round(o.pos / o.c * 100) + '%', background: '#16a34a' }} />
                  </div>
                  <div className="wl-meta" style={{ color: 'var(--green)' }}>
                    พูดถึง {o.c} · บวก {o.pos} ({Math.round(o.pos / o.c * 100)}%)
                  </div>
                </div>
              ))}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
              <Link href="/prioritize" style={{ color: 'var(--blue)' }}>ดูตารางจุดแข็งแบบถ่วงน้ำหนัก →</Link>
            </div>
          </div>
        </div>

        {/* Top 5 โครงการ — แยกเสียงเชิงบวก / เชิงลบ */}
        <div className="card">
          <h3>🏘️ Top 5 โครงการ เสียงเชิงบวก / เชิงลบ</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6, marginBottom: 14 }}>
            โครงการที่ลูกค้าพูดเชิงบวกและเชิงลบมากที่สุด · {pd.label}
          </div>
          <div className="top5">
            <div>
              <h4 style={{ color: 'var(--green)' }}>👍 เชิงบวกสูงสุด</h4>
              {topPos.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>ยังไม่มีเสียงเชิงบวกที่ระบุโครงการ</div>
                : <ol>{topPos.map(([p, o], i) => (
                  <li key={p}>
                    <span>{i + 1}. <Link href={vocHref(p, period)}>{p}</Link></span>
                    <b style={{ color: 'var(--green)' }}>{o.pos} เสียง</b>
                  </li>
                ))}</ol>}
            </div>
            <div>
              <h4 style={{ color: 'var(--red)' }}>👎 เชิงลบสูงสุด</h4>
              {topNeg.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>ยังไม่มีเสียงเชิงลบที่ระบุโครงการ</div>
                : <ol>{topNeg.map(([p, o], i) => (
                  <li key={p}>
                    <span>{i + 1}. <Link href={vocHref(p, period)}>{p}</Link></span>
                    <b style={{ color: 'var(--red)' }}>{o.neg} เสียง</b>
                  </li>
                ))}</ol>}
            </div>
          </div>
          {topPos.length === 0 && topNeg.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
              * ข้อมูลที่นำเข้าต้องจับคู่คอลัมน์ &ldquo;โครงการ&rdquo; ในขั้นนำเข้า จึงจะแสดงที่นี่ได้
            </div>
          )}
        </div>

        {/* รายการล่าสุด */}
        <div className="card">
          <h3>💬 รายการล่าสุด ({pd.label})</h3>
          {f.length > 0 && (
            <table className="tcards">
              <thead><tr><th>รหัส</th><th>วันที่ต้นทาง</th><th>ช่องทาง</th><th>โครงการ</th><th>หัวข้อ</th><th>Sentiment</th><th>ความรุนแรง</th></tr></thead>
              <tbody>{f.slice(0, 15).map(r => (
                <tr key={r.id}>
                  <td data-label="รหัส">
                    <button type="button" className="tag" onClick={() => setOpenId(r.id)} title={'ดูรายละเอียด ' + r.ref}>{r.ref}</button>
                  </td>
                  <td data-label="วันที่ต้นทาง">{r.occurredAt}{r.imported ? ' (ไฟล์)' : ''}</td>
                  <td data-label="ช่องทาง">{r.channel}</td><td data-label="โครงการ">{r.project}</td>
                  <td className="cell-wrap" data-label="หัวข้อ">
                    <button type="button" className="voice-open" onClick={() => setOpenId(r.id)} title={r.voice + '\n(คลิกเพื่อดูรายละเอียดและคะแนน)'}>{r.topic}</button>
                  </td>
                  <td data-label="Sentiment"><span className={'pill ' + (r.sentiment === 'Positive' ? 'p-pos' : r.sentiment === 'Negative' ? 'p-neg' : 'p-neu')}>{r.sentiment}</span></td>
                  <td data-label="ความรุนแรง"><span className={'pill ' + (r.priority === 'High' ? 'p-hi' : r.priority === 'Medium' ? 'p-md' : 'p-lo')}>{r.priority}</span></td>
                </tr>))}
              </tbody>
            </table>
          )}
          {f.length === 0 && (rows.length === 0
            ? <EmptyState icon="📥" title="ยังไม่มีเสียงลูกค้าในระบบ"
                detail={<>นำเข้าข้อมูลจากช่องทางใดช่องทางหนึ่งก่อน แล้วหน้านี้จะสรุป KPI แนวโน้ม และประเด็นที่ควรเฝ้าระวังให้อัตโนมัติ</>}
                actions={<Link className="btn" href="/import">นำเข้าข้อมูล</Link>} />
            : <EmptyState title="ไม่มีข้อมูลในช่วง/ตัวกรองนี้"
                detail={<>ลองเลือก &ldquo;ทั้งหมด (ตั้งแต่มีระบบ)&rdquo; หรือขยายประเภท/ชื่อโครงการให้กว้างขึ้น</>} />)}
        </div>
      </div>

      <VocModal id={openId} list={f.slice(0, 15)} rows={rows} period={ALL_TIME} onChange={setOpenId} onClose={() => setOpenId(null)} />
    </>
  );
}
