'use client';
// DimensionsView — "วิเคราะห์ 4 มิติ"
//
// ทำไมต้องมีหน้านี้แยกจาก "AI วิเคราะห์"
//   หน้า AI วิเคราะห์ตอบคำถามว่า "เครื่องมือจำแนกอะไรได้บ้าง" (มุมมองของระบบ)
//   หน้านี้ตอบคำถามของฝ่ายงานว่า "เสียงลูกค้าบอกอะไรเราใน 4 มิติที่องค์กรใช้ตัดสินใจ"
//   จึงจัดตามกรอบ 4 มิติของ กคช. ไม่ใช่ตามคอลัมน์ในฐานข้อมูล
//
// กติกาสำคัญ: ทุกตัวเลขบนหน้านี้คิดจาก "ชุดที่ตัวกรองด้านบนกรองไว้" เสมอ
// เปลี่ยนปี/ไตรมาส/ประเภทโครงการ → ทุกมิติเปลี่ยนตามพร้อมกัน ไม่มีตัวเลขไหนค้างที่ค่าสะสม
import { useEffect, useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';
import { PROJECT_TYPES, JOURNEY_TH, JOURNEY_DESC, JOURNEY_COLOR, journeyLabel } from '../../lib/data';
import {
  DIM2_GROUPS, DIM2_OTHER, DIM2_CATS, dim2Cat,
  DIM3_CATS, DIM3_OTHER, DIM3_COLOR, DIM3_DESC, dim3Cat,
  CUST_GROUPS, custGroupOf, STAGE_DETAIL, LIFECYCLE,
  bucketBy, topTopics, type Bucket, type CustGroup,
} from '../../lib/dimensions';
import VocModal from '../voc/VocModal';
import EmptyState from '../components/EmptyState';

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

const DIMS = [
  { key: '1', no: '1', icon: '🔄', name: 'วงจรชีวิตลูกค้า', en: 'Customer Lifecycle', color: '#0ea5e9', sub: '6 ขั้น ตั้งแต่การรับรู้จนถึงการดึงกลับมา' },
  { key: '2', no: '2', icon: '📦', name: 'ผลิตภัณฑ์และการบริการ', en: 'Product & Service', color: '#2e6cf0', sub: 'บ้าน การก่อสร้าง ซื้อ/เช่า สินเชื่อ จอง สื่อ โปรโมชั่น' },
  { key: '3', no: '3', icon: '🤝', name: 'การสนับสนุนลูกค้า', en: 'Customer Support', color: '#f59e0b', sub: 'ความเร็ว การแก้ปัญหา ติดตามผล ข้อมูล ความสะดวก' },
  { key: '4', no: '4', icon: '👥', name: 'กลุ่มลูกค้า', en: 'Customer Segment', color: '#8b5cf6', sub: '5 กลุ่ม ตั้งแต่ลูกค้ามุ่งหวังถึงลูกค้าในอดีต' },
] as const;
type DimKey = (typeof DIMS)[number]['key'];

/** แถบอารมณ์ 3 สีในบรรทัดเดียว — ใช้เทียบสัดส่วนบวก/กลาง/ลบ ของแต่ละหมวดได้เร็วกว่าตัวเลข */
function SentBar({ b, height = 8 }: { b: Bucket; height?: number }) {
  const t = b.n || 1;
  const w = (v: number) => (v / t * 100).toFixed(1) + '%';
  return (
    <div className="dim-sent" style={{ height }} title={`เชิงบวก ${b.pos} · เป็นกลาง ${b.neu} · เชิงลบ ${b.neg}`}>
      <i style={{ width: w(b.pos), background: '#16a34a' }} />
      <i style={{ width: w(b.neu), background: '#f59e0b' }} />
      <i style={{ width: w(b.neg), background: '#dc2626' }} />
    </div>
  );
}

/** แถวหมวดหนึ่งบรรทัด — ชื่อ · จำนวน · % · แถบอารมณ์ · คลิกเพื่อดูรายการจริง */
function CatRow({ b, total, color, desc, active, onPick }: {
  b: Bucket; total: number; color: string; desc?: string; active: boolean; onPick: () => void;
}) {
  const pct = total ? Math.round(b.n / total * 100) : 0;
  const negPct = b.n ? Math.round(b.neg / b.n * 100) : 0;
  return (
    <button type="button" className={'dim-row' + (active ? ' on' : '')} onClick={onPick}
      title={b.n ? 'คลิกเพื่อดูรายการเสียงลูกค้าในหมวดนี้' : 'ยังไม่มีเสียงลูกค้าในหมวดนี้ตามตัวกรองที่เลือก'}>
      <div className="dim-row-head">
        <span className="dim-row-name"><b style={{ color }}>●</b> {b.key}</span>
        <span className="dim-row-num">{b.n.toLocaleString()} <span>({pct}%)</span></span>
      </div>
      <div className="dim-track"><i style={{ width: Math.max(b.n ? 2 : 0, pct) + '%', background: color }} /></div>
      {b.n > 0 && (
        <div className="dim-row-foot">
          <SentBar b={b} height={6} />
          <span className={'dim-neg' + (negPct >= 40 ? ' hot' : '')}>เชิงลบ {negPct}%</span>
          {b.high > 0 && <span className="dim-hi">เร่งด่วนสูง {b.high.toLocaleString()}</span>}
        </div>
      )}
      {desc && <div className="dim-row-desc">{desc}</div>}
    </button>
  );
}

export default function DimensionsView({ rows }: { rows: Voc[] }) {
  // ---------- ตัวกรอง (ชุดเดียวกับหน้าภาพรวม/8 ช่องทาง) ----------
  const [maxFY, setMaxFY] = useState(2569);
  const [beYear, setBeYear] = useState(2569);
  const [quarter, setQuarter] = useState('q3');
  const [ptype, setPtype] = useState('all');
  const [projText, setProjText] = useState('');
  const [dim, setDim] = useState<DimKey>('1');
  // pick = หมวด/กลุ่มที่ผู้ใช้กดเพื่อ "ดูของจริง" — เก็บเป็น label เดียว รีเซ็ตเมื่อเปลี่ยนมิติ
  const [pick, setPick] = useState<string>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [group, setGroup] = useState<string>(CUST_GROUPS[2].key);

  useEffect(() => { const { be, q } = currentFYQuarter(); setMaxFY(be); setBeYear(be); setQuarter(q); }, []);
  const YEARS = [maxFY, maxFY - 1, maxFY - 2];
  const allTime = beYear === 0;
  const period = { fy: beYear, qt: quarter };
  const range = periodRange(beYear, quarter);
  const projQ = projText.trim().toLowerCase();

  const projectNames = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (r.project) m.set(r.project, r.projectType); });
    return Array.from(m, ([name, type]) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [rows]);
  const projOptions = ptype === 'all' ? projectNames : projectNames.filter(p => p.type === ptype);

  // ---------- ชุดข้อมูลที่ทุกมิติใช้ร่วมกัน ----------
  const fr = useMemo(() => rows.filter(r => {
    if (!allTime && !(r.occurredAt >= range.from && r.occurredAt <= range.to)) return false;
    if (ptype !== 'all' && r.projectType !== ptype) return false;
    if (projQ && !r.project.toLowerCase().includes(projQ)) return false;
    return true;
  }), [rows, allTime, range.from, range.to, ptype, projQ]);
  const total = fr.length;

  // ---------- คำนวณทั้ง 4 มิติในรอบเดียว ----------
  const d1 = useMemo(() => bucketBy(fr, r => r.journey || 'Service', LIFECYCLE.map(l => l.en)), [fr]);
  const d2 = useMemo(() => bucketBy(fr, dim2Cat, [...DIM2_CATS, DIM2_OTHER]), [fr]);
  const d3 = useMemo(() => bucketBy(fr, dim3Cat, [...DIM3_CATS, DIM3_OTHER]), [fr]);
  const d4 = useMemo(() => bucketBy(fr, r => custGroupOf(r).key, CUST_GROUPS.map(g => g.key)), [fr]);
  const byKey = (bs: Bucket[], k: string) => bs.find(b => b.key === k) || { key: k, n: 0, pos: 0, neu: 0, neg: 0, high: 0 };

  // ---------- รายการที่กดดูอยู่ ----------
  // แต่ละมิติกดคนละความหมาย จึงตัดสินใจที่เดียวตรงนี้ว่า pick หมายถึงตัวกรองอะไร
  const picked = useMemo<Voc[]>(() => {
    if (!pick) return [];
    if (dim === '1') return fr.filter(r => (r.journey || 'Service') === pick);
    if (dim === '2') return fr.filter(r => dim2Cat(r) === pick);
    if (dim === '3') return fr.filter(r => dim3Cat(r) === pick);
    return fr.filter(r => custGroupOf(r).key === group && (r.journey || 'Service') === pick);
  }, [pick, dim, fr, group]);
  const pickLabel = dim === '1' || dim === '4' ? (JOURNEY_TH[pick] || pick) : pick;
  const sample = picked.slice(0, 30);

  const changeDim = (k: DimKey) => { setDim(k); setPick(''); };

  // ---------- มิติที่ 3: จุดที่ต้องปรับปรุงเร่งด่วน ----------
  // เรียงด้วย "จำนวนเสียงเชิงลบ" ไม่ใช่ % เพราะหมวดที่มี 3 เสียงแล้วลบหมดจะได้ 100% และแซงหมวดที่มีปัญหาจริง
  const d3Pain = useMemo(() => d3.filter(b => b.key !== DIM3_OTHER && b.neg > 0).sort((a, b) => b.neg - a.neg).slice(0, 5), [d3]);

  const gInfo = CUST_GROUPS.find(g => g.key === group) as CustGroup;
  const gRows = useMemo(() => fr.filter(r => custGroupOf(r).key === group), [fr, group]);

  return (
    <>
      <header className="top">
        <h1>วิเคราะห์ 4 มิติ</h1>
        <div className="sub">
          กรอบวิเคราะห์เสียงลูกค้าของ กคช. — วงจรชีวิตลูกค้า · ผลิตภัณฑ์และการบริการ · การสนับสนุนลูกค้า · กลุ่มลูกค้า ·
          คิดจาก <b>{total.toLocaleString()}</b> รายการตามตัวกรอง
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <select style={selStyle} value={beYear} onChange={e => setBeYear(Number(e.target.value))}>
            <option value={0}>ทั้งหมด (ตั้งแต่มีระบบ)</option>
            {YEARS.map(y => <option key={y} value={y}>ปีงบประมาณ {y}</option>)}
          </select>
          <select style={selStyle} value={quarter} onChange={e => setQuarter(e.target.value)} disabled={allTime}>
            {QUARTERS.map(q => <option key={q.k} value={q.k}>{q.label}</option>)}
          </select>
          <select style={selStyle} value={ptype} onChange={e => { setPtype(e.target.value); setProjText(''); }}>
            <option value="all">ทุกประเภทโครงการ</option>
            {PROJECT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={{ position: 'relative' }}>
            <input list="dim-projects" style={{ ...selStyle, width: 210 }} value={projText}
              onChange={e => setProjText(e.target.value)}
              placeholder={`🔎 ทุกชื่อโครงการ${ptype !== 'all' ? ` (${projOptions.length})` : ''}`} />
            <datalist id="dim-projects">{projOptions.map(p => <option key={p.name} value={p.name} />)}</datalist>
            {projText && <button type="button" onClick={() => setProjText('')} title="ล้าง"
              style={{ position: 'absolute', right: 6, top: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>✕</button>}
          </div>
        </div>
      </header>

      <div className="content">
        {/* ===== การ์ด 4 มิติ — เป็นทั้งสรุปและแท็บเลือกมิติ ===== */}
        <div className="dim-tabs">
          {DIMS.map(d => {
            const bs = d.key === '1' ? d1 : d.key === '2' ? d2 : d.key === '3' ? d3 : d4;
            const top = [...bs].filter(b => b.n > 0).sort((a, b) => b.n - a.n)[0];
            const topName = !top ? '—'
              : d.key === '1' ? JOURNEY_TH[top.key]
              : d.key === '4' ? (CUST_GROUPS.find(g => g.key === top.key)?.name ?? top.key)
              : top.key;
            return (
              <button key={d.key} type="button" className={'dim-tab' + (dim === d.key ? ' on' : '')}
                style={{ ['--dc' as string]: d.color }} onClick={() => changeDim(d.key)}>
                <div className="dim-tab-top">
                  <span className="dim-tab-no">{d.no}</span>
                  <span className="dim-tab-icon">{d.icon}</span>
                </div>
                <div className="dim-tab-name">มิติ{d.name}</div>
                <div className="dim-tab-en">{d.en}</div>
                <div className="dim-tab-sub">{d.sub}</div>
                <div className="dim-tab-top1">
                  มากที่สุด: <b>{topName}</b>{top ? ` ${top.n.toLocaleString()} (${Math.round(top.n / (total || 1) * 100)}%)` : ''}
                </div>
              </button>
            );
          })}
        </div>

        {total === 0 ? (
          <div className="card">
            <EmptyState icon="🗂️" title="ไม่มีเสียงลูกค้าในช่วงที่เลือก"
              detail={<>ลองเปลี่ยนปีงบประมาณ/ไตรมาส หรือเลือก &ldquo;ทั้งหมด (ตั้งแต่มีระบบ)&rdquo; ด้านบน</>} />
          </div>
        ) : (
          <>
            {/* ============ มิติที่ 1 — วงจรชีวิตลูกค้า ============ */}
            {dim === '1' && (
              <>
                <div className="card">
                  <h3>🔄 มิติที่ 1 — วงจรชีวิตลูกค้า (Customer Lifecycle)</h3>
                  <div className="dim-note">เสียงลูกค้าแต่ละเสียงถูกจัดเข้า 1 ใน 6 ขั้น ตามประเด็นในข้อความ · คลิกขั้นเพื่อดูรายการจริง</div>
                  <div className="dim-flow">
                    {LIFECYCLE.map(l => {
                      const b = byKey(d1, l.en);
                      const c = JOURNEY_COLOR[l.en];
                      const pct = Math.round(b.n / (total || 1) * 100);
                      return (
                        <button key={l.en} type="button" className={'dim-step' + (pick === l.en ? ' on' : '')}
                          style={{ background: c.bg, color: c.fg }} onClick={() => setPick(pick === l.en ? '' : l.en)}
                          title={JOURNEY_DESC[l.en]}>
                          <span className="dim-step-no">{l.no}</span>
                          <span className="dim-step-th">{l.th}</span>
                          <span className="dim-step-en">{l.en}</span>
                          <span className="dim-step-n">{b.n.toLocaleString()}</span>
                          <span className="dim-step-pct">{pct}%</span>
                          <SentBar b={b} height={5} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="card">
                  <h3>รายละเอียดรายขั้น</h3>
                  <div className="dim-tablewrap">
                    <table className="dim-table">
                      <thead><tr>
                        <th>ขั้น</th><th className="r">จำนวน</th><th className="r">%</th>
                        <th className="r">เชิงบวก</th><th className="r">เป็นกลาง</th><th className="r">เชิงลบ</th>
                        <th className="r">เร่งด่วนสูง</th><th>ประเด็นที่พบบ่อยที่สุด</th>
                      </tr></thead>
                      <tbody>
                        {LIFECYCLE.map(l => {
                          const b = byKey(d1, l.en);
                          const t = topTopics(fr.filter(r => (r.journey || 'Service') === l.en), 1)[0];
                          const p = (v: number) => (b.n ? Math.round(v / b.n * 100) : 0) + '%';
                          return (
                            <tr key={l.en} className={pick === l.en ? 'on' : ''} onClick={() => setPick(pick === l.en ? '' : l.en)}>
                              <td><b>{l.no}. {l.th}</b><br /><span className="dim-mut">{l.en}</span></td>
                              <td className="r"><b>{b.n.toLocaleString()}</b></td>
                              <td className="r">{Math.round(b.n / (total || 1) * 100)}%</td>
                              <td className="r" style={{ color: '#16a34a' }}>{p(b.pos)}</td>
                              <td className="r" style={{ color: '#b45309' }}>{p(b.neu)}</td>
                              <td className="r" style={{ color: '#dc2626' }}>{p(b.neg)}</td>
                              <td className="r">{b.high.toLocaleString()}</td>
                              <td>{t ? <>{t[0]} <span className="dim-mut">({t[1]})</span></> : <span className="dim-mut">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ============ มิติที่ 2 — ผลิตภัณฑ์และการบริการ ============ */}
            {dim === '2' && (
              <>
                <div className="card">
                  <h3>📦 มิติที่ 2 — ผลิตภัณฑ์และการบริการ (Product &amp; Service)</h3>
                  <div className="dim-note">
                    รวมทุกเรื่องที่เกี่ยวกับผลิตภัณฑ์ของ กคช. — คุณภาพบ้านและการก่อสร้าง · การซื้อ/เช่า/เช่าซื้อ · สินเชื่อและการผ่อนชำระ ·
                    ระบบจองและข้อมูลโครงการ · โปรโมชั่นและสื่อประชาสัมพันธ์ · คลิกหมวดเพื่อดูรายการจริง
                  </div>
                </div>
                <div className="dim-grid">
                  {DIM2_GROUPS.map(g => {
                    const gs = g.cats.map(c => byKey(d2, c));
                    const gn = gs.reduce((a, b) => a + b.n, 0);
                    return (
                      <div className="card" key={g.group}>
                        <h3><span style={{ marginRight: 6 }}>{g.icon}</span>{g.group}
                          <span className="dim-badge" style={{ background: g.color }}>{gn.toLocaleString()}</span>
                        </h3>
                        {gs.map(b => (
                          <CatRow key={b.key} b={b} total={total} color={g.color}
                            active={pick === b.key} onPick={() => setPick(pick === b.key ? '' : b.key)} />
                        ))}
                      </div>
                    );
                  })}
                  <div className="card">
                    <h3><span style={{ marginRight: 6 }}>🗂️</span>ยังจัดหมวดไม่ได้</h3>
                    <CatRow b={byKey(d2, DIM2_OTHER)} total={total} color="#94a3b8"
                      desc="เสียงที่ AI ยังจับหมวดผลิตภัณฑ์ไม่ได้ — ถ้าตัวเลขนี้สูง ควรสั่งวิเคราะห์ใหม่ด้วย LLM ที่หน้า AI วิเคราะห์เสียงลูกค้า"
                      active={pick === DIM2_OTHER} onPick={() => setPick(pick === DIM2_OTHER ? '' : DIM2_OTHER)} />
                  </div>
                </div>
              </>
            )}

            {/* ============ มิติที่ 3 — การสนับสนุนลูกค้า ============ */}
            {dim === '3' && (
              <>
                <div className="card">
                  <h3>🤝 มิติที่ 3 — การสนับสนุนลูกค้า (Customer Support)</h3>
                  <div className="dim-note">
                    วัด &ldquo;คุณภาพการให้บริการ&rdquo; ไม่ใช่ตัวผลิตภัณฑ์ — ความรวดเร็ว การแก้ไขปัญหา การติดตามผล
                    ความถูกต้อง/ครบถ้วน/การเข้าถึงข้อมูล และความสะดวก · จำแนกจากประเด็นในข้อความ
                  </div>
                </div>
                <div className="dim-grid2">
                  <div className="card">
                    <h3>9 ด้านของการสนับสนุนลูกค้า</h3>
                    {[...DIM3_CATS, DIM3_OTHER].map(c => (
                      <CatRow key={c} b={byKey(d3, c)} total={total} color={DIM3_COLOR[c]} desc={DIM3_DESC[c]}
                        active={pick === c} onPick={() => setPick(pick === c ? '' : c)} />
                    ))}
                  </div>
                  <div className="card">
                    <h3>🔥 จุดที่ต้องปรับปรุงเร่งด่วน</h3>
                    <div className="dim-note">เรียงตาม &ldquo;จำนวนเสียงเชิงลบ&rdquo; ไม่ใช่เปอร์เซ็นต์ — หมวดที่มีไม่กี่เสียงจะได้เปอร์เซ็นต์สูงเกินจริง</div>
                    {d3Pain.length === 0 && <div className="dim-mut" style={{ fontSize: 13 }}>ยังไม่พบเสียงเชิงลบในมิตินี้ตามตัวกรองที่เลือก</div>}
                    {d3Pain.map((b, i) => (
                      <button key={b.key} type="button" className={'dim-pain' + (pick === b.key ? ' on' : '')}
                        onClick={() => setPick(pick === b.key ? '' : b.key)}>
                        <span className="dim-pain-no" style={{ background: DIM3_COLOR[b.key] }}>{i + 1}</span>
                        <span className="dim-pain-body">
                          <span className="dim-pain-name">{b.key}</span>
                          <span className="dim-mut">{b.neg.toLocaleString()} เสียงเชิงลบ จาก {b.n.toLocaleString()} เสียง ({Math.round(b.neg / (b.n || 1) * 100)}%)</span>
                        </span>
                        {b.high > 0 && <span className="dim-hi">เร่งด่วนสูง {b.high.toLocaleString()}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ============ มิติที่ 4 — กลุ่มลูกค้า + แนวทางสนับสนุน ============ */}
            {dim === '4' && (
              <>
                <div className="card">
                  <h3>👥 มิติที่ 4 — กลุ่มลูกค้า (Customer Segment)</h3>
                  <div className="dim-note">5 กลุ่มตามเส้นทางการเดินทางของลูกค้า · เลือกกลุ่มเพื่อดูว่าลูกค้ากลุ่มนั้นคือใคร พูดเรื่องอะไร และ กคช. ต้องสนับสนุนอย่างไร</div>
                  <div className="dim-groups">
                    {CUST_GROUPS.map(g => {
                      const b = byKey(d4, g.key);
                      const pct = Math.round(b.n / (total || 1) * 100);
                      return (
                        <button key={g.key} type="button" className={'dim-gcard' + (group === g.key ? ' on' : '')}
                          style={{ ['--gc' as string]: g.color }}
                          onClick={() => { setGroup(g.key); setPick(''); }}>
                          <span className="dim-gicon">{g.icon}</span>
                          <span className="dim-gname">{g.name}</span>
                          <span className="dim-gn">{b.n.toLocaleString()}</span>
                          <span className="dim-mut">{pct}% ของทั้งหมด</span>
                          <SentBar b={b} height={6} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="card dim-gdetail" style={{ ['--gc' as string]: gInfo.color }}>
                  <h3><span style={{ marginRight: 6 }}>{gInfo.icon}</span>{gInfo.name}
                    <span className="dim-badge" style={{ background: gInfo.color }}>{gRows.length.toLocaleString()} เสียง</span>
                  </h3>
                  <div className="dim-note">{gInfo.note}</div>
                  <div className="dim-stages">
                    {gInfo.stages.map(s => {
                      const det = STAGE_DETAIL[s];
                      const b = byKey(d1, s);
                      return (
                        <div key={s} className="dim-stage">
                          <div className="dim-stage-head">
                            <span className="dim-stage-title">{journeyLabel(s)}</span>
                            <button type="button" className="dim-stage-n" onClick={() => setPick(pick === s ? '' : s)}
                              title="คลิกเพื่อดูรายการเสียงลูกค้าในขั้นนี้">
                              {b.n.toLocaleString()} เสียง →
                            </button>
                          </div>
                          <div className="dim-who">ลูกค้าในขั้นนี้: <b>{det.customer}</b></div>
                          <div className="dim-act-t">แนวทางสนับสนุนลูกค้า</div>
                          <ul className="dim-acts">{det.actions.map(a => <li key={a}>{a}</li>)}</ul>
                        </div>
                      );
                    })}
                  </div>
                  <div className="dim-gfoot">
                    <div>
                      <div className="dim-act-t">ประเด็นที่กลุ่มนี้พูดถึงมากที่สุด</div>
                      {topTopics(gRows, 5).length === 0
                        ? <div className="dim-mut" style={{ fontSize: 13 }}>ยังไม่มีข้อมูล</div>
                        : <ol className="dim-toplist">{topTopics(gRows, 5).map(([t, n]) => <li key={t}><span>{t}</span><b>{n.toLocaleString()}</b></li>)}</ol>}
                    </div>
                    <div>
                      <div className="dim-act-t">การสนับสนุนที่กลุ่มนี้พูดถึงมากที่สุด (มิติที่ 3)</div>
                      {(() => {
                        const gs = bucketBy(gRows, dim3Cat).filter(b => b.key !== DIM3_OTHER).slice(0, 5);
                        return gs.length === 0
                          ? <div className="dim-mut" style={{ fontSize: 13 }}>ยังไม่มีข้อมูล</div>
                          : <ol className="dim-toplist">{gs.map(b => <li key={b.key}><span><b style={{ color: DIM3_COLOR[b.key] }}>●</b> {b.key}</span><b>{b.n.toLocaleString()}</b></li>)}</ol>;
                      })()}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ===== รายการจริงของหมวดที่กดเลือก — ทุกมิติใช้กล่องเดียวกัน ===== */}
            {pick && (
              <div className="card">
                <div className="dim-picked-head">
                  <h3 style={{ margin: 0 }}>🔎 เสียงลูกค้าในหมวด: {pickLabel}</h3>
                  <button type="button" className="btn" style={{ background: '#64748b' }} onClick={() => setPick('')}>✕ ปิดรายการ</button>
                </div>
                <div className="dim-note">
                  พบ <b>{picked.length.toLocaleString()}</b> รายการ{picked.length > sample.length ? ` — แสดง ${sample.length} รายการแรก` : ''} ·
                  คลิกแถวเพื่อเปิดรายละเอียดเต็ม
                </div>
                {picked.length === 0 ? (
                  <div className="dim-mut" style={{ fontSize: 13 }}>ไม่มีรายการในหมวดนี้ตามตัวกรองที่เลือก</div>
                ) : (
                  <div className="dim-tablewrap">
                    <table className="dim-table dim-picked">
                      <thead><tr><th>รหัส VOC</th><th>วันที่</th><th>ช่องทาง</th><th>หัวข้อ</th><th>เสียงลูกค้า</th><th>อารมณ์</th></tr></thead>
                      <tbody>
                        {sample.map(r => (
                          <tr key={r.id} onClick={() => setOpenId(r.id)} title="คลิกเพื่อดูรายละเอียดเต็ม">
                            <td><b>{r.ref}</b></td>
                            <td className="dim-mut">{r.occurredAt}</td>
                            <td>{r.channel}</td>
                            <td>{r.topic}</td>
                            <td className="dim-voice">{r.voice}</td>
                            <td>
                              <span className={'dim-pill ' + (r.sentiment === 'Positive' ? 'pos' : r.sentiment === 'Negative' ? 'neg' : 'neu')}>
                                {r.sentiment === 'Positive' ? 'เชิงบวก' : r.sentiment === 'Negative' ? 'เชิงลบ' : 'เป็นกลาง'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <VocModal id={openId} list={sample} rows={rows} period={period} onChange={setOpenId} onClose={() => setOpenId(null)} />
    </>
  );
}
