'use client';
// ChannelsView — 8 ช่องทางรับฟังเสียงลูกค้า (interactive)
// หน้ายิ้ม/นิ่ง/เศร้า + แถบเทียบช่องทาง + การ์ด hover ขยับ + คลิกดูรายละเอียดด้านล่าง + ปุ่มกลับ
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';
import { CHANNELS, PROJECT_TYPES } from '../../lib/data';
import { computeCloud } from '../../lib/cloud';
import WordCloud from '../components/WordCloud';
import TrendChart from '../components/TrendChart';

const PRODUCTS = ['อาคารเพื่อขาย/เช่าซื้อ', 'อาคารเช่า', 'เช่าจัดประโยชน์'];
const QUARTERS: { k: string; label: string }[] = [
  { k: 'year', label: 'ทั้งปี (สะสม)' },
  { k: 'q1', label: 'ไตรมาส 1 (ต.ค.–ธ.ค.)' },
  { k: 'q2', label: 'ไตรมาส 2 (ม.ค.–มี.ค.)' },
  { k: 'q3', label: 'ไตรมาส 3 (เม.ย.–มิ.ย.)' },
  { k: 'q4', label: 'ไตรมาส 4 (ก.ค.–ก.ย.)' },
];
function currentFYQuarter(): { be: number; q: string } {
  const d = new Date(); const y = d.getFullYear(), mo = d.getMonth();
  return { be: (mo >= 9 ? y + 1 : y) + 543, q: mo >= 9 ? 'q1' : mo <= 2 ? 'q2' : mo <= 5 ? 'q3' : 'q4' };
}
function periodRange(be: number, q: string): { from: string; to: string } {
  const s = be - 543 - 1, e = be - 543;
  const m: Record<string, [string, string]> = {
    q1: [`${s}-10-01`, `${s}-12-31`], q2: [`${e}-01-01`, `${e}-03-31`],
    q3: [`${e}-04-01`, `${e}-06-30`], q4: [`${e}-07-01`, `${e}-09-30`], year: [`${s}-10-01`, `${e}-09-30`],
  };
  const [from, to] = m[q] || m.year; return { from, to };
}
const selStyle: React.CSSProperties = { padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'inherit' };

const ICON: Record<string, string> = {
  'Social Media': '👍', 'Website / Email / DB': '🌐', 'ทีมรณรงค์ขาย': '🧑‍💼', 'ฝ่ายงานสำนักงานใหญ่': '🏢',
  'สำนักงานสาขาทั่วประเทศ': '📍', 'Call Center': '🎧', 'ระบบร้องเรียน/ข้อเสนอแนะ': '📣', 'แบบประเมินความพึงพอใจ': '📝',
};
const SENT_TH: Record<string, string> = { Positive: 'เชิงบวก', Neutral: 'เป็นกลาง', Negative: 'เชิงลบ' };
const SENT_COLOR: Record<string, string> = { Positive: '#16a34a', Neutral: '#f59e0b', Negative: '#dc2626' };

// หน้ายิ้ม/นิ่ง/เศร้า เป็น SVG
function Face({ kind, color, size = 72 }: { kind: 'smile' | 'flat' | 'frown'; color: string; size?: number }) {
  const mouth = kind === 'smile' ? 'M32 60 Q50 76 68 60' : kind === 'frown' ? 'M32 66 Q50 50 68 66' : 'M34 62 H66';
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r="42" fill={color + '22'} stroke={color} strokeWidth="4" />
      <circle cx="37" cy="42" r="5.5" fill={color} />
      <circle cx="63" cy="42" r="5.5" fill={color} />
      <path d={mouth} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

const PALETTE = ['#2e6cf0', '#16a34a', '#f59e0b', '#8b5cf6', '#0ea5e9'];

// Donut chart (SVG) — สัดส่วนตามแหล่งที่มา
function Donut({ data, size = 150 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  let acc = 0;
  return (
    <svg viewBox="0 0 42 42" width={size} height={size} aria-hidden="true">
      <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--line)" strokeWidth="5" />
      {data.map((d, i) => {
        const seg = d.value / total * 100;
        const el = (
          <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={d.color} strokeWidth="5"
            strokeDasharray={`${seg} ${100 - seg}`} strokeDashoffset={25 - acc} strokeLinecap="butt" />
        );
        acc += seg;
        return el;
      })}
      <text x="21" y="20.5" textAnchor="middle" style={{ fontSize: 6, fontWeight: 700, fill: 'var(--ink)' }}>{total}</text>
      <text x="21" y="26" textAnchor="middle" style={{ fontSize: 2.6, fill: 'var(--muted)' }}>รายการ</text>
    </svg>
  );
}

export default function ChannelsView({ rows }: { rows: Voc[] }) {
  const [sel, setSel] = useState<string | null>(null);
  // ฟิลเตอร์ชุดเดียวกับหน้าภาพรวม
  const [maxFY, setMaxFY] = useState(2569);
  const [beYear, setBeYear] = useState(2569);
  const [quarter, setQuarter] = useState('q3');
  const [product, setProduct] = useState('all');
  const [ptype, setPtype] = useState('all');
  const [projText, setProjText] = useState('');
  useEffect(() => { const { be, q } = currentFYQuarter(); setMaxFY(be); setBeYear(be); setQuarter(q); }, []);
  const YEARS = [maxFY, maxFY - 1, maxFY - 2];

  const allTime = beYear === 0;
  const range = periodRange(beYear, quarter);
  const projQ = projText.trim().toLowerCase();
  // รายชื่อโครงการ (cascade ตามประเภท) สำหรับ datalist ค้นหา
  const projectNames = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (r.project) m.set(r.project, r.projectType); });
    return Array.from(m, ([name, type]) => ({ name, type }));
  }, [rows]);
  const projOptions = ptype === 'all' ? projectNames : projectNames.filter(p => p.type === ptype);

  // ข้อมูลหลังกรอง — ใช้กับทุกส่วนของหน้า
  const fr = useMemo(() => rows.filter(r =>
    (allTime || (r.occurredAt >= range.from && r.occurredAt <= range.to)) &&
    (product === 'all' || r.product === product) &&
    (ptype === 'all' || r.projectType === ptype) &&
    (!projQ || (r.project || '').toLowerCase().includes(projQ))
  ), [rows, allTime, range.from, range.to, product, ptype, projQ]);

  const stats = useMemo(() => CHANNELS.map(name => {
    const r = fr.filter(x => x.channel === name);
    const t = r.length || 1;
    const pos = r.filter(x => x.sentiment === 'Positive').length;
    const neu = r.filter(x => x.sentiment === 'Neutral').length;
    const neg = r.filter(x => x.sentiment === 'Negative').length;
    return { name, count: r.length, pos, neu, neg, posPct: Math.round(pos / t * 100), neuPct: Math.round(neu / t * 100), negPct: Math.round(neg / t * 100) };
  }), [fr]);

  const total = stats.reduce((a, c) => a + c.count, 0);
  const maxCount = Math.max(...stats.map(c => c.count), 1);
  const allPos = fr.filter(r => r.sentiment === 'Positive').length;
  const allNeu = fr.filter(r => r.sentiment === 'Neutral').length;
  const allNeg = fr.filter(r => r.sentiment === 'Negative').length;
  const t0 = fr.length || 1;
  const faces = [
    { kind: 'smile' as const, lab: 'เชิงบวก (Positive)', n: allPos, pct: Math.round(allPos / t0 * 100), color: '#16a34a' },
    { kind: 'flat' as const, lab: 'เป็นกลาง (Neutral)', n: allNeu, pct: Math.round(allNeu / t0 * 100), color: '#f59e0b' },
    { kind: 'frown' as const, lab: 'เชิงลบ (Negative)', n: allNeg, pct: Math.round(allNeg / t0 * 100), color: '#dc2626' },
  ];

  return (
    <>
      <header className="top">
        <h1>8 ช่องทางรับฟังเสียงลูกค้า</h1>
        <div className="sub">คลิกการ์ดช่องทางเพื่อดูแดชบอร์ดเฉพาะช่องทาง · รวม {total.toLocaleString()} รายการ</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <select style={selStyle} value={beYear} onChange={e => setBeYear(Number(e.target.value))}>
            <option value={0}>ทั้งหมด (ตั้งแต่มีระบบ)</option>
            {YEARS.map(y => <option key={y} value={y}>ปีงบประมาณ {y}</option>)}
          </select>
          <select style={selStyle} value={quarter} onChange={e => setQuarter(e.target.value)} disabled={allTime}>
            {QUARTERS.map(q => <option key={q.k} value={q.k}>{q.label}</option>)}
          </select>
          <select style={selStyle} value={product} onChange={e => setProduct(e.target.value)}>
            <option value="all">ทุกกลุ่มผลิตภัณฑ์</option>
            {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select style={selStyle} value={ptype} onChange={e => { setPtype(e.target.value); setProjText(''); }}>
            <option value="all">ทุกประเภทโครงการ</option>
            {PROJECT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={{ position: 'relative' }}>
            <input list="ch-projects" style={{ ...selStyle, width: 210 }} value={projText}
              onChange={e => setProjText(e.target.value)}
              placeholder={`🔎 ทุกชื่อโครงการ${ptype !== 'all' ? ` (${projOptions.length})` : ''}`} />
            <datalist id="ch-projects">{projOptions.map(p => <option key={p.name} value={p.name} />)}</datalist>
            {projText && <button type="button" onClick={() => setProjText('')} title="ล้าง"
              style={{ position: 'absolute', right: 6, top: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>✕</button>}
          </div>
        </div>
      </header>
      <div className="content">
        {/* ===== ภาพรวม (แสดงเมื่อยังไม่เลือกช่องทาง) ===== */}
        {!sel && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            {/* หน้ายิ้ม/นิ่ง/เศร้า */}
            <div className="card" style={{ marginBottom: 0, flex: '1 1 300px' }}>
              <h3>ความรู้สึกของลูกค้า (ภาพรวมทั้ง 8 ช่องทาง)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 12, textAlign: 'center' }}>
                {faces.map(f => (
                  <div key={f.lab} style={{ padding: '10px 6px', borderRadius: 12, background: f.color + '10' }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}><Face kind={f.kind} color={f.color} /></div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: f.color, marginTop: 6 }}>{f.pct}%</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>{f.n.toLocaleString()} เสียง</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>{f.lab}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* เทียบช่องทาง — กราฟแท่งแนวตั้ง (stacked ตามอารมณ์) */}
            <div className="card" style={{ marginBottom: 0, flex: '2 1 460px' }}>
              <h3>เสียงลูกค้าแยกตามช่องทาง</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 210, padding: '14px 0 0' }}>
                {stats.map((c, i) => {
                  const barH = Math.max(4, Math.round(c.count / maxCount * 150));
                  const seg = (v: number) => (c.count ? Math.round(barH * v / c.count) : 0);
                  return (
                    <div key={c.name} onClick={() => setSel(c.name)} title={`${c.name}\nรวม ${c.count} · บวก ${c.posPct}% กลาง ${c.neuPct}% ลบ ${c.negPct}%`}
                      className="chan-bar" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{c.count}</div>
                      <div style={{ width: '78%', maxWidth: 40, height: barH, display: 'flex', flexDirection: 'column', borderRadius: '6px 6px 0 0', overflow: 'hidden' }}>
                        <div style={{ height: seg(c.neg), background: '#dc2626' }} />
                        <div style={{ height: seg(c.neu), background: '#f59e0b' }} />
                        <div style={{ flex: 1, background: '#16a34a' }} />
                      </div>
                      <div style={{ fontSize: 17, marginTop: 6 }}>{ICON[c.name]}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{i + 1}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, textAlign: 'center' }}>🟢 บวก · 🟡 กลาง · 🔴 ลบ — คลิกแท่งเพื่อดูรายละเอียดช่องทาง (เลข 1–8 ตรงกับการ์ดด้านล่าง)</div>
            </div>
          </div>
        )}

        {/* ===== การ์ด 8 ช่องทาง ===== */}
        <div style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 10px' }}>
          📋 8 ช่องทางรับฟังเสียงลูกค้า <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>— คลิกการ์ดเพื่อดูแดชบอร์ดเฉพาะช่องทาง</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 14 }}>
          {stats.map((c, i) => (
            <div key={c.name} className={'card chan-card' + (sel === c.name ? ' sel' : '')} style={{ marginBottom: 0 }}
              onClick={() => setSel(sel === c.name ? null : c.name)}>
              <h3 title={c.name} style={{ marginBottom: 8, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <span style={{ fontSize: 18, flex: '0 0 auto' }}>{ICON[c.name]}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{i + 1}. {c.name}</span>
              </h3>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1f3a93' }}>{c.count.toLocaleString()}<span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}> รายการ</span></div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12 }}>
                <span>เชิงบวก <b style={{ color: '#16a34a' }}>{c.posPct}%</b></span>
                <span>กลาง <b style={{ color: '#f59e0b' }}>{c.neuPct}%</b></span>
                <span>เชิงลบ <b style={{ color: '#dc2626' }}>{c.negPct}%</b></span>
              </div>
            </div>
          ))}
        </div>

        {/* ===== รายละเอียดเฉพาะช่องทาง (แสดงด้านล่างเมื่อเลือก) ===== */}
        {sel && <ChannelDetail key={sel} rows={fr.filter(r => r.channel === sel)} name={sel} onBack={() => setSel(null)} />}
      </div>
    </>
  );
}

function ChannelDetail({ rows, name, onBack }: { rows: Voc[]; name: string; onBack: () => void }) {
  // แหล่งที่มาในช่องทาง (เช่น Social → Facebook / Line OA)
  const allSources = Array.from(new Set(rows.map(r => r.source).filter(Boolean))) as string[];
  const [source, setSource] = useState('all');
  const view = source === 'all' ? rows : rows.filter(r => r.source === source);
  const total = view.length || 1;

  const sent = { Positive: 0, Neutral: 0, Negative: 0 };
  view.forEach(r => sent[r.sentiment]++);
  const posPct = Math.round(sent.Positive / total * 100);
  const neuPct = Math.round(sent.Neutral / total * 100);
  const negPct = Math.round(sent.Negative / total * 100);
  const high = view.filter(r => r.priority === 'High').length;

  const jr: Record<string, number> = {}; view.forEach(r => { if (r.journey) jr[r.journey] = (jr[r.journey] || 0) + 1; });
  const journey = Object.entries(jr).sort((a, b) => b[1] - a[1]);
  const jmax = Math.max(...journey.map(j => j[1]), 1);
  const tp: Record<string, number> = {}; view.forEach(r => { if (r.topic) tp[r.topic] = (tp[r.topic] || 0) + 1; });
  const topTopics = Object.entries(tp).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const tmax = Math.max(...topTopics.map(t => t[1]), 1);
  // สัดส่วนตามแหล่งที่มา (เทียบทั้งช่องทาง — ไม่ขึ้นกับแท็บ)
  const srcAgg: Record<string, number> = {}; rows.forEach(r => { const s = r.source || name; srcAgg[s] = (srcAgg[s] || 0) + 1; });
  const sources = Object.entries(srcAgg).sort((a, b) => b[1] - a[1]);
  const srcTotal = rows.length || 1;
  const byDay: Record<string, number> = {}; view.forEach(r => { if (r.occurredAt) byDay[r.occurredAt] = (byDay[r.occurredAt] || 0) + 1; });
  const trend = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({ label: d.slice(5).split('-').reverse().join('/'), value: v }));
  const cloud = computeCloud(view);

  const tabBtn = (active: boolean): React.CSSProperties => ({
    fontSize: 12.5, padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
    border: '1px solid ' + (active ? '#1f3a93' : 'var(--line)'), background: active ? '#1f3a93' : 'transparent', color: active ? '#fff' : 'inherit',
  });

  return (
    <div style={{ marginTop: 20, paddingTop: 4, borderTop: '2px dashed var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, margin: '14px 0' }}>
        <h2 style={{ fontSize: 18 }}>{ICON[name]} แดชบอร์ดเฉพาะช่องทาง: {name}</h2>
        <button className="btn" style={{ background: '#64748b' }} onClick={onBack}>✕ ดูทุกช่องทาง</button>
      </div>

      {/* แท็บแยกตามแหล่งที่มา */}
      {allSources.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>แยกตามแหล่งที่มา:</span>
          <button style={tabBtn(source === 'all')} onClick={() => setSource('all')}>ทั้งหมด</button>
          {allSources.map(s => <button key={s} style={tabBtn(source === s)} onClick={() => setSource(s)}>{s}</button>)}
        </div>
      )}

      {view.length === 0 ? <div className="card">ยังไม่มีข้อมูลในแหล่งนี้</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>จำนวนรายการ{source !== 'all' ? ` (${source})` : ''}</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1f3a93' }}>{view.length.toLocaleString()}</div></div>
            <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>% เสียงเชิงบวก</div><div style={{ fontSize: 26, fontWeight: 700, color: '#16a34a' }}>{posPct}%</div></div>
            <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>% เสียงเชิงลบ</div><div style={{ fontSize: 26, fontWeight: 700, color: '#dc2626' }}>{negPct}%</div></div>
            <div className="card" style={{ marginBottom: 0 }}><div style={{ fontSize: 12, color: '#64748b' }}>เร่งด่วนสูง (High)</div><div style={{ fontSize: 26, fontWeight: 700, color: '#f59e0b' }}>{high}</div></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 16 }}>
            <div className="card" style={{ marginBottom: 0 }}><h3>แนวโน้มรายวัน</h3><TrendChart points={trend} /></div>
            {/* Sentiment — ใบหน้ายิ้ม/นิ่ง/เศร้า */}
            <div className="card" style={{ marginBottom: 0 }}>
              <h3>สัดส่วน Sentiment</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 8, textAlign: 'center' }}>
                {([['smile', sent.Positive, posPct, '#16a34a', 'เชิงบวก'], ['flat', sent.Neutral, neuPct, '#f59e0b', 'เป็นกลาง'], ['frown', sent.Negative, negPct, '#dc2626', 'เชิงลบ']] as const).map(([k, n, pct, col, lab]) => (
                  <div key={k} style={{ padding: '8px 4px', borderRadius: 10, background: col + '10' }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}><Face kind={k} color={col} size={52} /></div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: col, marginTop: 4 }}>{pct}%</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{n} เสียง</div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{lab}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
            {/* Customer Journey — แท่งแนวนอน */}
            <div className="card">
              <h3>การกระจายตาม Customer Journey</h3>
              {journey.map(([k, v]) => (
                <div key={k} style={{ margin: '9px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}><span>{k}</span><span style={{ fontWeight: 600, color: '#1f3a93' }}>{v}</span></div>
                  <div style={{ height: 8, background: '#eef2f7', borderRadius: 6 }}><div style={{ width: Math.round(v / jmax * 100) + '%', height: '100%', background: '#2e6cf0', borderRadius: 6 }} /></div>
                </div>
              ))}
            </div>
            {/* หัวข้อที่พบบ่อย — แท่งแนวนอน */}
            <div className="card">
              <h3>หัวข้อที่พบบ่อย</h3>
              {topTopics.map(([k, v]) => (
                <div key={k} style={{ margin: '9px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}><span>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
                  <div style={{ height: 8, background: '#eef2f7', borderRadius: 6 }}><div style={{ width: Math.round(v / tmax * 100) + '%', height: '100%', background: '#8b5cf6', borderRadius: 6 }} /></div>
                </div>
              ))}
            </div>
            {/* สัดส่วนตามแหล่งที่มา — Donut (ช่องทางที่มี >1 แหล่ง) */}
            <div className="card">
              <h3>สัดส่วนตามแหล่งที่มา</h3>
              {sources.length > 1 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <Donut data={sources.map(([k, v], i) => ({ label: k, value: v, color: PALETTE[i % PALETTE.length] }))} size={140} />
                  <div style={{ flex: 1, minWidth: 120 }}>
                    {sources.map(([k, v], i) => (
                      <div key={k} onClick={() => setSource(k)} title="คลิกเพื่อกรองดูเฉพาะแหล่งนี้"
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer', fontSize: 13, fontWeight: source === k ? 700 : 400 }}>
                        <span><b style={{ color: PALETTE[i % PALETTE.length] }}>●</b> {k}{source === k ? ' ✓' : ''}</span>
                        <span style={{ fontWeight: 600 }}>{v} ({Math.round(v / srcTotal * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>ช่องทางนี้มีแหล่งเดียว: <b style={{ color: 'var(--ink)' }}>{sources[0]?.[0] || name}</b> ({srcTotal} รายการ)</div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3>☁️ Word Cloud — คำที่พูดถึงมากในช่องทางนี้ (คลิกคำเพื่อค้นหา)</h3>
            <div style={{ padding: '10px 4px' }}><WordCloud freq={cloud} basePath="/voc" /></div>
          </div>

          <div className="card">
            <h3>รายการ VOC ของช่องทางนี้{source !== 'all' ? ` · ${source}` : ''}</h3>
            <table>
              <thead><tr><th>รหัส</th><th>แหล่ง</th><th>ประเด็น / เสียงลูกค้า</th><th>Sentiment</th><th>สถานะ</th></tr></thead>
              <tbody>{view.slice(0, 20).map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}><Link href={'/voc/' + r.id} className="tag">{r.ref}</Link></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.source}</td>
                  <td><b>{r.topic}</b><div style={{ color: 'var(--muted)' }}>{r.voice}</div></td>
                  <td style={{ whiteSpace: 'nowrap', color: SENT_COLOR[r.sentiment], fontWeight: 600 }}>{SENT_TH[r.sentiment]}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
