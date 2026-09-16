'use client';
// ReportClient — ศูนย์รายงาน
//
// ปัญหาเดิม: หน้านี้เป็นการ์ดปุ่มดาวน์โหลด 11 ใบ กดแล้วได้ตารางดิบ
//   ดูก่อนโหลดไม่ได้ว่าข้างในมีอะไร · ไม่มีบทสรุป · ไม่มีกราฟ · ไฟล์ Excel เป็น HTML เปลี่ยนนามสกุล
//   ผู้ใช้จึงต้องมาตีความตัวเลขเองทุกครั้ง = เอาไปใช้ต่อจริงไม่ได้
//
// ตอนนี้: เลือกรายงาน → เห็นเอกสารเต็มบนหน้าเว็บทันที (ตัวชี้วัด · บทสรุปเป็นประโยค · กราฟ · ตาราง)
//   แล้วค่อยเลือกส่งออก 5 แบบ ตามลักษณะการใช้งาน — CSV · Excel · PDF ทางการ · อินโฟกราฟิก PNG/PDF
import { useEffect, useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';
import { PROJECT_TYPES } from '../../lib/data';
import { buildExec, buildChannel, buildWatch, buildStrength, plainReports, type ReportDoc } from '../../lib/report';
import { buildInfographicSvg, type InfoMeta } from '../../lib/reportInfographic';
import { exportCSV, exportXLSX, exportPDFDoc, exportInfographicPNG, exportInfographicPDF } from './exportKit';
import EmptyState from '../components/EmptyState';

const QUARTERS = [
  { k: 'year', label: 'ทั้งปี (สะสม)' }, { k: 'q1', label: 'ไตรมาส 1 (ต.ค.–ธ.ค.)' }, { k: 'q2', label: 'ไตรมาส 2 (ม.ค.–มี.ค.)' },
  { k: 'q3', label: 'ไตรมาส 3 (เม.ย.–มิ.ย.)' }, { k: 'q4', label: 'ไตรมาส 4 (ก.ค.–ก.ย.)' },
];
function currentFYQuarter() { const d = new Date(), y = d.getFullYear(), mo = d.getMonth(); return { be: (mo >= 9 ? y + 1 : y) + 543, q: mo >= 9 ? 'q1' : mo <= 2 ? 'q2' : mo <= 5 ? 'q3' : 'q4' }; }
function periodRange(be: number, q: string) {
  const s = be - 543 - 1, e = be - 543;
  const m: Record<string, [string, string]> = { q1: [`${s}-10-01`, `${s}-12-31`], q2: [`${e}-01-01`, `${e}-03-31`], q3: [`${e}-04-01`, `${e}-06-30`], q4: [`${e}-07-01`, `${e}-09-30`], year: [`${s}-10-01`, `${e}-09-30`] };
  const [from, to] = m[q] || m.year; return { from, to };
}
/** ช่วงก่อนหน้าที่ "ยาวเท่ากัน" — ใช้เทียบในบทสรุป ถ้าไม่เท่ากันตัวเลขเปรียบเทียบจะหลอกตา */
function prevRange(from: string, to: string) {
  const a = Date.parse(from + 'T00:00:00Z'), b = Date.parse(to + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  const span = b - a + 86400000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: iso(a - span), to: iso(a - 86400000) };
}

const sel: React.CSSProperties = { padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'inherit' };
const DEEP = [
  { id: 'exec', icon: '📊', name: 'สรุปผู้บริหาร' },
  { id: 'channel', icon: '📥', name: 'แยกตามช่องทาง' },
  { id: 'watch', icon: '🔁', name: 'ประเด็นเฝ้าระวัง' },
  { id: 'strength', icon: '🌟', name: 'จุดแข็งที่ควรขยายผล' },
] as const;
type DeepId = (typeof DEEP)[number]['id'];

export default function ReportClient({ rows }: { rows: Voc[] }) {
  const [beYear, setBeYear] = useState(2569);
  const [quarter, setQuarter] = useState('q3');
  const [ptype, setPtype] = useState('all');
  const [projText, setProjText] = useState('');
  const [maxFY, setMaxFY] = useState(2569);
  const [pick, setPick] = useState<DeepId>('exec');
  const [tab, setTab] = useState<'doc' | 'info'>('doc');
  const [tableIdx, setTableIdx] = useState(0);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [today, setToday] = useState('');

  useEffect(() => {
    const c = currentFYQuarter(); setMaxFY(c.be); setBeYear(c.be); setQuarter(c.q);
    // คำนวณวันที่ฝั่งเบราว์เซอร์เท่านั้น — ถ้าเรนเดอร์ฝั่งเซิร์ฟเวอร์ด้วยจะได้คนละค่าแล้ว hydrate ไม่ตรง
    setToday(new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }));
  }, []);
  useEffect(() => { setTableIdx(0); }, [pick]);

  const YEARS = [maxFY, maxFY - 1, maxFY - 2];
  const allTime = beYear === 0;
  const range = periodRange(beYear, quarter);
  const projQ = projText.trim().toLowerCase();
  const projOptions = useMemo(() => {
    const m = new Map<string, string>(); rows.forEach(r => { if (r.project) m.set(r.project, r.projectType); });
    return Array.from(m, ([name, type]) => ({ name, type })).filter(p => ptype === 'all' || p.type === ptype);
  }, [rows, ptype]);

  const matchOther = (r: Voc) => (ptype === 'all' || r.projectType === ptype) && (!projQ || (r.project || '').toLowerCase().includes(projQ));
  const fr = useMemo(() => rows.filter(r => (allTime || (r.occurredAt >= range.from && r.occurredAt <= range.to)) && matchOther(r)),
    [rows, allTime, range.from, range.to, ptype, projQ]);
  // ชุดข้อมูลช่วงก่อนหน้า — ใช้เขียนประโยคเปรียบเทียบในบทสรุป (เลือก "ทั้งหมด" จะไม่มีช่วงก่อนให้เทียบ)
  const prev = useMemo(() => {
    if (allTime) return [];
    const pr = prevRange(range.from, range.to); if (!pr) return [];
    return rows.filter(r => r.occurredAt >= pr.from && r.occurredAt <= pr.to && matchOther(r));
  }, [rows, allTime, range.from, range.to, ptype, projQ]);

  const scope = [
    allTime ? 'ทั้งหมด (ตั้งแต่มีระบบ)' : `ปีงบ ${beYear} · ${QUARTERS.find(q => q.k === quarter)?.label}`,
    ptype !== 'all' ? ptype : '',
    projText.trim() ? `โครงการ: ${projText.trim()}` : '',
  ].filter(Boolean).join(' · ');

  const doc: ReportDoc = useMemo(() => {
    if (pick === 'channel') return buildChannel(fr, prev, scope);
    if (pick === 'watch') return buildWatch(fr, prev, scope);
    if (pick === 'strength') return buildStrength(fr, prev, scope);
    return buildExec(fr, prev, scope);
  }, [pick, fr, prev, scope]);

  const plains = useMemo(() => plainReports(fr), [fr]);
  const meta: InfoMeta = { org: 'การเคหะแห่งชาติ', system: 'ระบบรับฟังเสียงลูกค้า (Voice of Customer)', printedAt: today };
  const infoSvg = useMemo(() => (tab === 'info' ? buildInfographicSvg(doc, meta) : ''), [tab, doc, today]);

  const blocked = () => setMsg('เบราว์เซอร์บล็อกหน้าต่างใหม่ — กดอนุญาต pop-up ของเว็บนี้แล้วลองอีกครั้ง');
  async function run(key: string, fn: () => void | Promise<void>) {
    setBusy(key); setMsg('');
    try { await fn(); } catch (e) { setMsg('ส่งออกไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e))); }
    setBusy('');
  }

  return (
    <>
      <header className="top">
        <h1>รายงานข้อมูล</h1>
        <div className="sub">เลือกรายงาน → อ่านบทสรุปและกราฟบนหน้าเว็บได้ทันที → ส่งออกเป็นตาราง เอกสารทางการ หรืออินโฟกราฟิก</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <select style={sel} value={beYear} onChange={e => setBeYear(Number(e.target.value))}>
            <option value={0}>ทั้งหมด (ตั้งแต่มีระบบ)</option>
            {YEARS.map(y => <option key={y} value={y}>ปีงบประมาณ {y}</option>)}
          </select>
          <select style={sel} value={quarter} onChange={e => setQuarter(e.target.value)} disabled={allTime}>
            {QUARTERS.map(q => <option key={q.k} value={q.k}>{q.label}</option>)}
          </select>
          <select style={sel} value={ptype} onChange={e => { setPtype(e.target.value); setProjText(''); }}>
            <option value="all">ทุกประเภทโครงการ</option>
            {PROJECT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input list="rep-projects" style={{ ...sel, width: 200 }} value={projText} onChange={e => setProjText(e.target.value)} placeholder="🔎 ทุกชื่อโครงการ" />
          <datalist id="rep-projects">{projOptions.map(p => <option key={p.name} value={p.name} />)}</datalist>
        </div>
      </header>

      <div className="content">
        {fr.length === 0 ? (
          <div className="card">
            <EmptyState icon="📄" title="ไม่มีข้อมูลให้ออกรายงานในช่วงนี้"
              detail={<>ช่วงที่เลือกคือ <b>{scope}</b> ซึ่งยังไม่มีเสียงลูกค้า<br />
                ลองเลือก &ldquo;ทั้งหมด (ตั้งแต่มีระบบ)&rdquo; ขยายประเภท/ชื่อโครงการ หรือนำเข้าข้อมูลเพิ่มก่อน</>} />
          </div>
        ) : (
          <>
            {/* เลือกรายงานเชิงลึก */}
            <div className="rp-pick">
              {DEEP.map(d => (
                <button key={d.id} type="button" className={'rp-tab' + (pick === d.id ? ' on' : '')} onClick={() => setPick(d.id)}>
                  <span className="rp-tab-ic">{d.icon}</span>{d.name}
                </button>
              ))}
              <span className="rp-scope">ช่วงข้อมูล: <b>{scope}</b> · {fr.length.toLocaleString()} รายการ</span>
            </div>

            {/* แถบส่งออก — 5 แบบ แยกตามลักษณะการใช้งาน ไม่ใช่แยกตามนามสกุลไฟล์ */}
            <div className="card rp-bar">
              <div className="rp-bar-g">
                <span className="rp-bar-l">ตาราง</span>
                <button className="rp-btn csv" disabled={!!busy} onClick={() => run('csv', () => exportCSV(`${doc.name}_${scope}`, doc.tables[tableIdx] ?? doc.tables[0]))}>
                  ↓ CSV<small>ตารางที่เปิดอยู่</small>
                </button>
                <button className="rp-btn xls" disabled={!!busy} onClick={() => run('xls', () => exportXLSX(`${doc.name}_${scope}`, doc.tables, { doc, meta }))}>
                  {busy === 'xls' ? '⏳ กำลังสร้าง…' : <>↓ Excel<small>บทสรุป + {doc.tables.length} ชีต</small></>}
                </button>
              </div>
              <div className="rp-bar-g">
                <span className="rp-bar-l">เอกสาร</span>
                <button className="rp-btn pdf" disabled={!!busy} onClick={() => run('pdf', () => { exportPDFDoc(doc, meta, blocked); })}>
                  ↓ PDF ทางการ<small>ปก · บทสรุป · กราฟ · ตาราง</small>
                </button>
              </div>
              <div className="rp-bar-g">
                <span className="rp-bar-l">อินโฟกราฟิก</span>
                <button className="rp-btn png" disabled={!!busy} onClick={() => run('png', () => exportInfographicPNG(doc, meta))}>
                  {busy === 'png' ? '⏳ กำลังสร้างภาพ…' : <>↓ PNG<small>แปะสไลด์/ส่งไลน์</small></>}
                </button>
                <button className="rp-btn ipdf" disabled={!!busy} onClick={() => run('ipdf', () => { exportInfographicPDF(doc, meta, blocked); })}>
                  ↓ PDF แผ่นเดียว<small>A4 แนวนอน คมทุกขนาด</small>
                </button>
              </div>
            </div>
            {msg && <div className="card rp-msg">⚠ {msg}</div>}

            <div className="rp-view">
              <button type="button" className={'rp-vtab' + (tab === 'doc' ? ' on' : '')} onClick={() => setTab('doc')}>📄 เอกสารทางการ</button>
              <button type="button" className={'rp-vtab' + (tab === 'info' ? ' on' : '')} onClick={() => setTab('info')}>🖼️ อินโฟกราฟิก</button>
              <span className="rp-vnote">สิ่งที่เห็นตรงนี้คือสิ่งที่จะได้ในไฟล์ — ไม่ต้องโหลดมาเปิดเพื่อดูว่าข้างในมีอะไร</span>
            </div>

            {tab === 'info' ? (
              <div className="card rp-info" dangerouslySetInnerHTML={{ __html: infoSvg }} />
            ) : (
              <>
                {/* ---------- ตัวชี้วัด ---------- */}
                <div className="rp-kpis">
                  {doc.kpis.map(k => (
                    <div key={k.label} className={'rp-kpi t-' + (k.tone ?? 'plain')}>
                      <div className="rp-kl">{k.label}</div>
                      <div className="rp-kv">{k.value}</div>
                      {k.note && <div className="rp-kn">{k.note}</div>}
                    </div>
                  ))}
                </div>

                {/* ---------- บทสรุปเป็นข้อความ ---------- */}
                <div className="card rp-doc">
                  <div className="rp-doc-head">
                    <div>
                      <h2>{doc.icon} {doc.name}</h2>
                      <div className="rp-doc-sub">{doc.desc}</div>
                    </div>
                    <div className="rp-doc-meta">ช่วงข้อมูล<br /><b>{doc.scope}</b>{today && <><br />ออกรายงาน {today}</>}</div>
                  </div>
                  {doc.sections.map(s => (
                    <section key={s.head} className="rp-sec">
                      <h3>{s.head}</h3>
                      {s.paras.map((p, i) => <p key={i}>{p}</p>)}
                      {s.bullets && s.bullets.length > 0 && <ul>{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                    </section>
                  ))}
                </div>

                {/* ---------- กราฟ ---------- */}
                {doc.charts.map(c => (
                  <div className="card rp-fig" key={c.title}>
                    <h3>{c.title}</h3>
                    {c.note && <div className="rp-fnote">{c.note}</div>}
                    <div className="rp-svg" dangerouslySetInnerHTML={{ __html: c.svg }} />
                  </div>
                ))}

                {/* ---------- ตาราง ---------- */}
                <div className="card">
                  <div className="rp-tabs">
                    {doc.tables.map((t, i) => (
                      <button key={t.sheet} type="button" className={'rp-ttab' + (tableIdx === i ? ' on' : '')} onClick={() => setTableIdx(i)}>
                        {t.title} <b>({t.rows.length.toLocaleString()})</b>
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const t = doc.tables[tableIdx] ?? doc.tables[0];
                    const show = t.rows.slice(0, 50);
                    return (
                      <>
                        <div className="rp-tablewrap">
                          <table className="rp-table">
                            <thead><tr>{t.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
                            <tbody>
                              {show.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{String(c ?? '')}</td>)}</tr>)}
                            </tbody>
                          </table>
                        </div>
                        <div className="rp-fnote" style={{ marginTop: 8 }}>
                          {t.rows.length > 50
                            ? <>แสดง 50 แถวแรกจากทั้งหมด <b>{t.rows.length.toLocaleString()}</b> แถว — ดาวน์โหลด Excel หรือ CSV เพื่อดูครบทุกแถว</>
                            : <>ทั้งหมด <b>{t.rows.length.toLocaleString()}</b> แถว</>}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            {/* ---------- รายงานตารางล้วน ---------- */}
            <div className="card">
              <h3>📋 รายงานตารางสำหรับส่งต่อหน่วยงาน</h3>
              <div className="rp-fnote">ตารางล้วนไม่มีบทสรุป — ใช้ส่งให้ฝ่ายงานกรอง/เรียงเอง · ทุกไฟล์อิงช่วงข้อมูลเดียวกับด้านบน</div>
              <div className="rp-plain">
                {plains.map(p => (
                  <div key={p.id} className="rp-pcard">
                    <div className="rp-pname">{p.icon} {p.name}</div>
                    <div className="rp-pdesc">{p.desc}</div>
                    <div className="rp-pacts">
                      <button className="rp-btn sm csv" disabled={!!busy} onClick={() => run('p' + p.id, () => exportCSV(`${p.name}_${scope}`, p.build()))}>↓ CSV</button>
                      <button className="rp-btn sm xls" disabled={!!busy} onClick={() => run('px' + p.id, () => exportXLSX(`${p.name}_${scope}`, [p.build()]))}>
                        {busy === 'px' + p.id ? '⏳' : '↓ Excel'}
                      </button>
                      <span className="rp-prow">{p.build().rows.length.toLocaleString()} แถว</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
