'use client';
// VocListView — รายการเสียงลูกค้า (VOC) พร้อมชุดฟิลเตอร์เดียวกับหน้าภาพรวม/8 ช่องทาง
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';
import { CHANNELS, PROJECT_TYPES, JOURNEYS, JOURNEY_TH, JOURNEY_COLOR, journeyLabel } from '../../lib/data';
import { computeCloud } from '../../lib/cloud';
import WordCloud from '../components/WordCloud';
import EmptyState from '../components/EmptyState';
import { useSort, SortTh } from '../components/SortTh';
import VocModal from './VocModal';

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
// ค่าที่ใช้เรียงของแต่ละคอลัมน์ — ระดับความรุนแรง/อารมณ์เรียงตามความหมาย ไม่ใช่ตามตัวอักษร
const SENT_ORDER: Record<string, number> = { Negative: 0, Neutral: 1, Positive: 2 };
const PRIO_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
const SORTERS: Record<string, (r: Voc) => string | number> = {
  ref: r => r.ref,
  channel: r => r.channel,
  journey: r => JOURNEYS.indexOf(r.journey as (typeof JOURNEYS)[number]),
  projectType: r => r.projectType,
  project: r => r.project || '',
  topic: r => r.topic || '',
  voice: r => r.voice || '',
  sentiment: r => SENT_ORDER[r.sentiment] ?? 9,
  priority: r => PRIO_ORDER[r.priority] ?? 9,
  owner: r => r.owner || '',
  occurredAt: r => r.occurredAt,
};

const sel: React.CSSProperties = { padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'inherit' };

export default function VocListView({ rows, initialQ }: { rows: Voc[]; initialQ: string }) {
  const [maxFY, setMaxFY] = useState(2569);
  const [beYear, setBeYear] = useState(2569);
  const [quarter, setQuarter] = useState('q3');
  const [ptype, setPtype] = useState('all');
  const [projText, setProjText] = useState('');
  const [channel, setChannel] = useState('all');
  const [journey, setJourney] = useState('all');
  const [q, setQ] = useState(initialQ);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);   // รายการที่เปิดป๊อปอัปอยู่
  const PER = 20;   // แถวต่อหน้า — อ่านง่าย ไม่ต้องเลื่อนยาว และรองรับข้อมูลหลักพัน
  useEffect(() => { const c = currentFYQuarter(); setMaxFY(c.be); setBeYear(c.be); setQuarter(c.q); }, []);
  const YEARS = [maxFY, maxFY - 1, maxFY - 2];

  const allTime = beYear === 0;
  const range = periodRange(beYear, quarter);
  const projQ = projText.trim().toLowerCase();
  const qq = q.trim().toLowerCase();

  const projectNames = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (r.project) m.set(r.project, r.projectType); });
    return Array.from(m, ([name, type]) => ({ name, type }));
  }, [rows]);
  const projOptions = ptype === 'all' ? projectNames : projectNames.filter(p => p.type === ptype);

  const cloud = useMemo(() => computeCloud(rows), [rows]);

  // กรองทุกเงื่อนไข "ยกเว้นขั้นเส้นทางลูกค้า" — ใช้เป็นฐานนับจำนวนต่อขั้น
  // จะได้เห็นจำนวนจริงของแต่ละขั้นตามตัวกรองปัจจุบัน และสลับขั้นไปมาได้โดยตัวเลขไม่หาย
  const frBase = useMemo(() => rows.filter(r =>
    (allTime || (r.occurredAt >= range.from && r.occurredAt <= range.to)) &&
    (ptype === 'all' || r.projectType === ptype) &&
    (!projQ || (r.project || '').toLowerCase().includes(projQ)) &&
    (channel === 'all' || r.channel === channel) &&
    (!qq || (r.voice + r.topic + r.ref + r.owner + r.project).toLowerCase().includes(qq))
  ), [rows, allTime, range.from, range.to, ptype, projQ, channel, qq]);

  const fr = useMemo(() =>
    journey === 'all' ? frBase : frBase.filter(r => r.journey === journey),
    [frBase, journey]);

  // เรียงตามคอลัมน์ที่ผู้ใช้คลิก (ยังไม่เลือก = ลำดับเดิมจากฐานข้อมูล)
  const { sort, toggle, sorted } = useSort(fr, SORTERS);

  // เปลี่ยนตัวกรอง/คำค้น/การเรียง → กลับไปหน้าแรกเสมอ ไม่งั้นจะค้างอยู่หน้าที่ไม่มีข้อมูล
  useEffect(() => { setPage(1); }, [beYear, quarter, ptype, projQ, channel, journey, qq, sort]);
  const pageCount = Math.max(1, Math.ceil(fr.length / PER));
  const pageRows = sorted.slice((page - 1) * PER, page * PER);

  // จำนวนจริงต่อขั้น ตามตัวกรองที่เลือกอยู่ (ไม่นับตัวกรองขั้นเอง)
  const jrCount = useMemo(() => {
    const m: Record<string, number> = {};
    frBase.forEach(r => { if (r.journey) m[r.journey] = (m[r.journey] || 0) + 1; });
    return m;
  }, [frBase]);

  // ประเด็นซ้ำ (recurring) — นับหัวข้อในชุดที่กรอง
  const topicCount = useMemo(() => {
    const m: Record<string, number> = {};
    fr.forEach(r => { if (r.topic) m[r.topic] = (m[r.topic] || 0) + 1; });
    return m;
  }, [fr]);

  // เปิดรายการอื่นจากในป๊อปอัป — เลื่อนหน้าตารางตามไปด้วย ปิดแล้วจะได้เห็นแถวที่เพิ่งอ่านอยู่บนจอ
  function openAt(id: string) {
    setOpenId(id);
    const i = sorted.findIndex(x => x.id === id);
    if (i >= 0) setPage(Math.floor(i / PER) + 1);
  }

  function clearAll() {
    const c = currentFYQuarter(); setBeYear(c.be); setQuarter(c.q);
    setPtype('all'); setProjText(''); setChannel('all'); setJourney('all'); setQ('');
  }
  const hasFilter = ptype !== 'all' || projText || channel !== 'all' || journey !== 'all' || q || allTime;

  return (
    <>
      <header className="top">
        <h1>รายการเสียงลูกค้า (VOC)</h1>
        <div className="sub">ค้นหา + ตัวกรอง (ปีงบ/ไตรมาส/ประเภทโครงการ/ชื่อโครงการ/ช่องทาง/เส้นทางลูกค้า) + Word Cloud</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <select style={sel} value={beYear} onChange={e => setBeYear(Number(e.target.value))}>
            <option value={0}>ทั้งหมด (ตั้งแต่มีระบบ)</option>
            {YEARS.map(y => <option key={y} value={y}>ปีงบประมาณ {y}</option>)}
          </select>
          <select style={sel} value={quarter} onChange={e => setQuarter(e.target.value)} disabled={allTime}>
            {QUARTERS.map(qt => <option key={qt.k} value={qt.k}>{qt.label}</option>)}
          </select>
          <select style={sel} value={ptype} onChange={e => { setPtype(e.target.value); setProjText(''); }}>
            <option value="all">ทุกประเภทโครงการ</option>
            {PROJECT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={{ position: 'relative' }}>
            <input list="voc-projects" style={{ ...sel, width: 200 }} value={projText}
              onChange={e => setProjText(e.target.value)}
              placeholder={`🔎 ทุกชื่อโครงการ${ptype !== 'all' ? ` (${projOptions.length})` : ''}`} />
            <datalist id="voc-projects">{projOptions.map(p => <option key={p.name} value={p.name} />)}</datalist>
            {projText && <button type="button" onClick={() => setProjText('')} style={{ position: 'absolute', right: 6, top: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>✕</button>}
          </div>
          <select style={sel} value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="all">ทุกช่องทาง</option>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={sel} value={journey} onChange={e => setJourney(e.target.value)}>
            <option value="all">ทุกขั้นเส้นทางลูกค้า</option>
            {JOURNEYS.map(j => (
              <option key={j} value={j}>{JOURNEY_TH[j]} ({j})</option>
            ))}
          </select>
        </div>
      </header>

      <div className="content">
        <div className="card">
          <h3>☁️ Word Cloud — คำที่ลูกค้าพูดถึงมาก (คลิกคำเพื่อค้นหา)</h3>
          <WordCloud freq={cloud} basePath="/voc" />
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input style={{ ...sel, flex: '1 1 220px' }} value={q} onChange={e => setQ(e.target.value)}
              placeholder="🔎 ค้นหาข้อความ เช่น จอง, ซ่อม, สินเชื่อ..." />
            {hasFilter && <button className="btn" style={{ background: '#64748b' }} onClick={clearAll}>ล้างตัวกรอง</button>}
          </div>
          <div className="sub" style={{ marginBottom: 8 }}>
            พบ {fr.length.toLocaleString()} รายการ
            {fr.length > PER && <> · แสดง {((page - 1) * PER + 1).toLocaleString()}–{Math.min(page * PER, fr.length).toLocaleString()}</>}
          </div>

          {/* สรุปตามขั้นเส้นทางลูกค้า — คลิกเพื่อกรอง */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
            {JOURNEYS.map(j => {
              const c = JOURNEY_COLOR[j];
              const on = journey === j;
              const n = jrCount[j] || 0;
              return (
                <button key={j} type="button" title={journeyLabel(j) + ' — ' + n.toLocaleString() + ' รายการ'}
                  disabled={n === 0 && !on}
                  onClick={() => setJourney(on ? 'all' : j)}
                  style={{
                    border: '1px solid ' + (on ? c.fg : 'var(--line)'), background: on ? c.bg : 'transparent',
                    color: on ? c.fg : 'inherit', borderRadius: 20, padding: '4px 12px', fontSize: 12,
                    fontFamily: 'inherit', cursor: n === 0 && !on ? 'default' : 'pointer',
                    fontWeight: on ? 700 : 500, opacity: n === 0 && !on ? .4 : 1,
                  }}>
                  <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: c.fg, marginRight: 6 }} />
                  {JOURNEY_TH[j]} <b>{n.toLocaleString()}</b>
                </button>
              );
            })}
          </div>
          <table className="tcards">
            <thead><tr>
              <SortTh sk="ref" sort={sort} toggle={toggle}>รหัส</SortTh>
              <SortTh sk="channel" sort={sort} toggle={toggle}>ช่องทาง</SortTh>
              <SortTh sk="journey" sort={sort} toggle={toggle}>เส้นทางลูกค้า</SortTh>
              <SortTh sk="projectType" sort={sort} toggle={toggle}>ประเภทโครงการ</SortTh>
              <SortTh sk="project" sort={sort} toggle={toggle}>โครงการ</SortTh>
              <SortTh sk="topic" sort={sort} toggle={toggle}>หัวข้อ</SortTh>
              <SortTh sk="voice" sort={sort} toggle={toggle}>เสียงลูกค้า</SortTh>
              <SortTh sk="sentiment" sort={sort} toggle={toggle}>Sentiment</SortTh>
              <SortTh sk="priority" sort={sort} toggle={toggle}>ความรุนแรง</SortTh>
              <SortTh sk="owner" sort={sort} toggle={toggle}>ฝ่ายที่เกี่ยวข้อง</SortTh>
            </tr></thead>
            <tbody>{pageRows.map(r => (
              <tr key={r.id}>
                <td data-label="รหัส">
                  <button type="button" className="tag" onClick={() => setOpenId(r.id)}
                    title={'ดูรายละเอียด ' + r.ref}>{r.ref}</button>
                </td>
                <td data-label="ช่องทาง">{r.channel}</td>
                <td data-label="เส้นทางลูกค้า">{r.journey
                  ? <span className="pill" title={journeyLabel(r.journey)}
                      style={{ background: (JOURNEY_COLOR[r.journey] || {}).bg || '#f1f5f9', color: (JOURNEY_COLOR[r.journey] || {}).fg || '#475569', whiteSpace: 'nowrap' }}>
                      {JOURNEY_TH[r.journey] || r.journey}
                    </span>
                  : <span style={{ color: 'var(--muted)', fontSize: 12 }}>-</span>}</td>
                <td data-label="ประเภทโครงการ">{r.projectType}</td><td data-label="โครงการ">{r.project}</td>
                <td data-label="หัวข้อ">{r.topic}{topicCount[r.topic] >= 3 && <span title={`ประเด็นซ้ำ ${topicCount[r.topic]} ครั้ง`} style={{ marginLeft: 6, fontSize: 12, color: '#b45309', background: '#fef3c7', borderRadius: 20, padding: '1px 7px' }}>🔁 ซ้ำ {topicCount[r.topic]}</span>}</td>
                <td className="cell-wrap" data-label="เสียงลูกค้า" style={{ maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <button type="button" className="voice-open" onClick={() => setOpenId(r.id)}
                    title={r.voice + '\n(คลิกเพื่อดูรายละเอียดและคะแนน)'}>{r.voice}</button>
                </td>
                <td data-label="Sentiment"><span className={'pill ' + (r.sentiment === 'Positive' ? 'p-pos' : r.sentiment === 'Negative' ? 'p-neg' : 'p-neu')}>{r.sentiment}</span></td>
                <td data-label="ความรุนแรง"><span className={'pill ' + (r.priority === 'High' ? 'p-hi' : r.priority === 'Medium' ? 'p-md' : 'p-lo')}>{r.priority}</span></td>
                <td data-label="ฝ่ายที่เกี่ยวข้อง">{r.owner}</td>
              </tr>))}
            </tbody>
          </table>
          {fr.length === 0 && (rows.length === 0
            ? <EmptyState icon="📥" title="ยังไม่มีเสียงลูกค้าในระบบ"
                detail={<>เริ่มจากนำเข้าข้อมูลจากช่องทางใดช่องทางหนึ่ง หรือเปิดรับข้อมูลเรียลไทม์ผ่าน API<br />เมื่อมีข้อมูลแล้ว หน้านี้จะแสดงรายการทั้งหมดพร้อมตัวกรองและ Word Cloud</>}
                actions={<Link className="btn" href="/import">นำเข้าข้อมูล</Link>} />
            : <EmptyState title="ไม่พบรายการตามตัวกรองนี้"
                detail={<>ลองขยายช่วงเวลา (เลือก &ldquo;ทั้งหมด (ตั้งแต่มีระบบ)&rdquo;) เลือกช่องทาง/ประเภทโครงการให้กว้างขึ้น หรือลดคำค้นให้สั้นลง</>}
                actions={<button className="btn" onClick={clearAll}>ล้างตัวกรองทั้งหมด</button>} />)}

          {/* แบ่งหน้า */}
          {pageCount > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
              <button style={{ ...sel, cursor: 'pointer' }} disabled={page === 1} onClick={() => setPage(1)}>« แรก</button>
              <button style={{ ...sel, cursor: 'pointer' }} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ ก่อนหน้า</button>
              {/* หมายเลขหน้ารอบ ๆ หน้าปัจจุบัน */}
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter(n => n === 1 || n === pageCount || Math.abs(n - page) <= 2)
                .map((n, i, arr) => (
                  <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && arr[i - 1] !== n - 1 && <span style={{ color: 'var(--muted)' }}>…</span>}
                    <button onClick={() => setPage(n)}
                      style={{
                        ...sel, cursor: 'pointer', minWidth: 38, textAlign: 'center',
                        background: n === page ? 'var(--blue)' : 'var(--card,#fff)',
                        color: n === page ? '#fff' : 'inherit',
                        borderColor: n === page ? 'var(--blue)' : 'var(--line)',
                        fontWeight: n === page ? 700 : 400,
                      }}>{n}</button>
                  </span>
                ))}
              <button style={{ ...sel, cursor: 'pointer' }} disabled={page === pageCount} onClick={() => setPage(p => p + 1)}>ถัดไป ›</button>
              <button style={{ ...sel, cursor: 'pointer' }} disabled={page === pageCount} onClick={() => setPage(pageCount)}>ท้าย »</button>
              <span style={{ fontSize: 12.5, color: 'var(--muted)', marginLeft: 4 }}>หน้า {page} / {pageCount}</span>
            </div>
          )}
        </div>
      </div>

      <VocModal id={openId} list={sorted} rows={rows} onChange={openAt} onClose={() => setOpenId(null)} />
    </>
  );
}
